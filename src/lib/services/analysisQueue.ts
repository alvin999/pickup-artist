import type { ArtistEntry } from '$lib/types/artist';
import { analyzeArtistWithAI, RateLimitError } from '$lib/ai/client';
import { updateArtist } from '$lib/db';
import type { SupportedLocale } from '$lib/i18n';
import type { DisambiguationContext } from '$lib/ai/prompts';

/**
 * AI 背景批次分析佇列與 429 智能退避管理器
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 杜絕併發擊穿 TPM (Tokens Per Minute)：
 *    Groq / OpenAI Free Tier 具備嚴苛的 8,000 TPM 限額。
 *    採用嚴格的 FIFO 單工佇列 (Sequential Worker)，絕不進行非同步並發請求。
 * 2. 平滑 Token 消耗步調 (Pacing Interval)：
 *    每次順利完成分析後，自動插入 4 秒安全冷卻緩衝期，使 Token 桶 (Token Bucket) 順利回補。
 * 3. 429 Rate Limit 智能解析與無感重試 (Auto-Recovery)：
 *    當攔截到 429 錯誤時，自動解析 API 回傳之等待秒數 (Retry-After)，
 *    佇列自動進入 'cooling_down' 倒數狀態並即時廣播至 UI；
 *    倒數結束後原地自動重試該筆藝人，完全無需使用者手動刷新或重複點擊！
 * 4. 同名排歧脈絡萃取：
 *    自動從既有藝人資料（如 formatSpec 提取之年份、appleMusicUrl、personalNotes）組裝排歧 Context，
 *    傳入 AI 提示詞避免同名誤判。
 */

export interface QueueItem {
  artist: ArtistEntry;
  locale: SupportedLocale;
  retries: number;
}

export type QueueStatus = 'idle' | 'processing' | 'cooling_down';

export interface QueueState {
  status: QueueStatus;
  currentArtist: ArtistEntry | null;
  pendingCount: number;
  totalInBatch: number;
  cooldownRemainingSeconds: number;
  lastMessage: string | null;
  queuedArtistIds: string[];
}

class AnalysisQueueService {
  private queue: QueueItem[] = [];
  private isRunning = false;
  private currentItem: QueueItem | null = null;
  private totalBatchCount = 0;
  private cooldownTimer: any = null;
  private cooldownSeconds = 0;
  private status: QueueStatus = 'idle';
  private lastMessage: string | null = null;
  private listeners = new Set<(state: QueueState) => void>();

  /**
   * 訂閱佇列即時狀態變更
   */
  public subscribe(listener: (state: QueueState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (e) {
        console.warn('[AnalysisQueue] 狀態通知異常:', e);
      }
    });
  }

  public getState(): QueueState {
    return {
      status: this.status,
      currentArtist: this.currentItem?.artist || null,
      pendingCount: this.queue.length,
      totalInBatch: this.totalBatchCount,
      cooldownRemainingSeconds: this.cooldownSeconds,
      lastMessage: this.lastMessage,
      queuedArtistIds: this.queue.map((q) => q.artist.id)
    };
  }

  /**
   * 加入單一藝人至分析佇列
   */
  public enqueue(artist: ArtistEntry, locale: SupportedLocale = 'zh-TW') {
    // 避免重複排入相同藝人
    const alreadyInQueue = this.queue.some((q) => q.artist.id === artist.id);
    const isCurrent = this.currentItem?.artist.id === artist.id;
    if (alreadyInQueue || isCurrent) return;

    if (this.queue.length === 0 && !this.isRunning) {
      this.totalBatchCount = 1;
    } else {
      this.totalBatchCount++;
    }

    this.queue.push({ artist, locale, retries: 0 });
    this.lastMessage = `已加入佇列：${artist.name}`;
    this.notify();
    this.processNext();
  }

  /**
   * 批次加入多位藝人至分析佇列
   */
  public enqueueBatch(artists: ArtistEntry[], locale: SupportedLocale = 'zh-TW') {
    let addedCount = 0;
    artists.forEach((artist) => {
      const alreadyInQueue = this.queue.some((q) => q.artist.id === artist.id);
      const isCurrent = this.currentItem?.artist.id === artist.id;
      if (!alreadyInQueue && !isCurrent) {
        this.queue.push({ artist, locale, retries: 0 });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.totalBatchCount += addedCount;
      this.lastMessage = `已批次排入 ${addedCount} 位藝人等候解剖`;
      this.notify();
      this.processNext();
    }
  }

  /**
   * 背景依序處理核心循環 (Worker Loop)
   */
  private async processNext() {
    if (this.isRunning) return;

    if (this.queue.length === 0) {
      this.status = 'idle';
      this.currentItem = null;
      this.totalBatchCount = 0;
      this.notify();
      return;
    }

    this.isRunning = true;
    const item = this.queue.shift() || null;
    this.currentItem = item;
    if (!item) {
      this.isRunning = false;
      return;
    }

    this.status = 'processing';
    this.lastMessage = `正在解剖：${item.artist.name}...`;
    this.notify();

    try {
      await this.executeAnalysis(item);
      this.lastMessage = `「${item.artist.name}」解剖完成`;
      this.currentItem = null;
      this.notify();

      // 順利完成後插入 4 秒冷卻間隔，平滑回補 Token Bucket
      if (this.queue.length > 0) {
        await this.sleep(4000);
      }
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        // 攔截到 429：啟動冷卻倒數與自動重試
        const waitSec = err.retryAfterSeconds || 35;
        this.lastMessage = `觸發頻率限制 (429)，將於 ${waitSec} 秒後自動重試「${item.artist.name}」`;
        this.status = 'cooling_down';
        this.notify();

        await this.startCooldownCountdown(waitSec);

        // 倒數結束：若重試次數在限制內，放回佇列最前端原地重試
        if (item.retries < 3) {
          item.retries++;
          this.queue.unshift(item);
        } else {
          this.lastMessage = `「${item.artist.name}」重試達上限，暫時跳過`;
        }
        this.currentItem = null;
      } else {
        // 其他非 429 偶發錯誤（如網路瞬斷或偶然空回應），自動給予 1 次短延遲重試機會
        if (item.retries < 1) {
          item.retries++;
          console.warn(`[AnalysisQueue] 「${item.artist.name}」發生異常，1.5 秒後自動重試:`, err);
          this.lastMessage = `「${item.artist.name}」暫時異常，正在自動重試...`;
          this.notify();
          await this.sleep(1500);
          this.queue.unshift(item);
        } else {
          console.error('[AnalysisQueue] 解剖失敗:', err);
          this.lastMessage = `「${item.artist.name}」解剖失敗: ${err?.message || err}`;
        }
        this.currentItem = null;
      }
    } finally {
      this.isRunning = false;
      this.processNext();
    }
  }

  /**
   * 執行實際的 AI 剖析與資料庫持久化
   */
  private async executeAnalysis(item: QueueItem) {
    const { artist, locale } = item;

    // 從現有資料中萃取同名排歧脈絡（僅使用發行年代等客觀資訊，嚴禁使用舊 clusterCategory 避免回饋污染）
    const context: DisambiguationContext = {};
    if (artist.formatSpec) {
      const yearMatch = artist.formatSpec.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) context.releaseYear = yearMatch[1];
    }

    const result = await analyzeArtistWithAI(artist.name, locale, undefined, context);

    // 持久化更新至 IndexedDB
    await updateArtist(artist.id, {
      status: 'analyzed',
      originLocation: result.originLocation,
      formedYear: result.formedYear,
      canonTier: result.canonTier,
      formation: result.formation,
      countryCode: result.originLocation?.split('_')?.[1] || artist.countryCode,
      audiophileGrade: result.suggestedAudiophileGrade || 'Reference',
      dynamicRange: result.suggestedDynamicRange || 14,
      clusterSector: result.sector,
      clusterCategory: result.sector,
      entityType: result.entityType,
      lineage: result.lineage,
      analysis: {
        sector: result.sector,
        subGenre: result.subGenre,
        artistRole: result.artistRole,
        era: result.era,
        aestheticTags: result.aestheticTags,
        genres: result.genres,
        summary: result.summary,
        instrumentationNotes: result.instrumentationNotes,
        similarArtists: result.similarArtists,
        notableAlbums: result.notableAlbums.map((alb) => ({
          title: alb.title,
          year: alb.year,
          tier: alb.tier,
          trackType: alb.tier,
          losslessSpec: alb.tier === 'hidden-treasure' ? 'Rare Vault Pressing' : 'Lossless Master',
          dynamicRangeScore: alb.dynamicRangeScore,
          description: alb.description,
          rarityReason: alb.rarityReason,
          audiophileHighlight: alb.audiophileHighlight,
          appleMusicSearchUrl: alb.appleMusicSearchUrl
        }))
      }
    });
  }

  /**
   * 429 冷卻倒數計時器
   */
  private startCooldownCountdown(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.cooldownSeconds = seconds;
      this.notify();

      if (this.cooldownTimer) clearInterval(this.cooldownTimer);

      this.cooldownTimer = setInterval(() => {
        this.cooldownSeconds--;
        if (this.cooldownSeconds <= 0) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
          this.status = 'processing';
          this.notify();
          resolve();
        } else {
          this.notify();
        }
      }, 1000);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const analysisQueue = new AnalysisQueueService();
