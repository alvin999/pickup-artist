export type QueueItemStatus = 'queued' | 'listening' | 'completed';

export interface ListeningQueueItem {
  id: string;                      // 唯一識別碼 UUID
  artistId: string;                // 關聯藝人 ID (指向 ArtistEntry.id)
  artistName: string;              // 藝人名稱
  albumTitle?: string;             // 專輯名稱 (若指定代表盤入列)
  albumYear?: string;              // 發行年份
  tier?: 'milestone' | 'hidden-treasure'; // 時代基石 vs 深埋寶藏
  losslessSpec?: string;           // 無損格式規格 (如 96kHz 24bit ALAC)
  description?: string;            // 作品簡評
  rarityReason?: string;           // 挖寶理由
  audiophileHighlight?: string;    // 聲學亮點
  dynamicRangeScore?: number;      // DR 動態值
  appleMusicUrl?: string;          // Apple Music 播放/搜尋連結
  coverImage?: string;             // 封面圖片
  status: QueueItemStatus;         // queued (待聆) | listening (品鑑中) | completed (已品鑑)
  addedAt: number;                 // 加入時間戳 (UTC ms)
  startedAt?: number;              // 開始品鑑時間戳
  completedAt?: number;            // 品鑑完成時間戳
  quickNotes?: string;             // 隨手聽感筆記
  rating?: number;                 // 1-5 星級評分
}

const STORAGE_KEY = 'pua_listening_queue_v1';
const isBrowser = typeof window !== 'undefined';

/**
 * 聲學發燒友聆賞隊列服務 (Audiophile Listening Queue Service)
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 零破壞既有架構：完全由現有 ArtistEntry 與 NotableAlbum 投影構成，直接引用不冗餘。
 * 2. 跨工作階段持久化：於瀏覽器端即時同步 localStorage，保證重整或切換視圖永不遺失。
 * 3. 響應式訂閱模式：提供 subscribe 函式，無縫支援 Svelte 5 元件與 Runes。
 */
class ListeningQueueService {
  private items: ListeningQueueItem[] = [];
  private listeners = new Set<(items: ListeningQueueItem[]) => void>();

  constructor() {
    if (isBrowser) {
      this.loadFromStorage();
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.notify();
        }
      });
    }
  }

  private loadFromStorage(): void {
    if (!isBrowser) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.items = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[QueueService] Failed to load queue from storage:', err);
    }
  }

  private saveToStorage(): void {
    if (!isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch (err) {
      console.warn('[QueueService] Failed to save queue to storage:', err);
    }
  }

  private notify(): void {
    const snapshot = [...this.items];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[QueueService] Listener error:', err);
      }
    });
  }

  public subscribe(listener: (items: ListeningQueueItem[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getItems(): ListeningQueueItem[] {
    return [...this.items];
  }

  /**
   * 將藝人或特定盤片加入隊列
   */
  public add(item: {
    artistId: string;
    artistName: string;
    albumTitle?: string;
    albumYear?: string;
    tier?: 'milestone' | 'hidden-treasure';
    losslessSpec?: string;
    description?: string;
    rarityReason?: string;
    audiophileHighlight?: string;
    dynamicRangeScore?: number;
    appleMusicUrl?: string;
    coverImage?: string;
  }): { added: boolean; item: ListeningQueueItem; alreadyExists: boolean } {
    // 檢查是否已在待播/品鑑中佇列
    const existingIndex = this.items.findIndex(
      (q) =>
        q.artistId === item.artistId &&
        (q.albumTitle || '') === (item.albumTitle || '') &&
        q.status !== 'completed'
    );

    if (existingIndex >= 0) {
      return { added: false, item: this.items[existingIndex], alreadyExists: true };
    }

    const newItem: ListeningQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      artistId: item.artistId,
      artistName: item.artistName,
      albumTitle: item.albumTitle,
      albumYear: item.albumYear,
      tier: item.tier,
      losslessSpec: item.losslessSpec || 'Hi-Res Lossless',
      description: item.description,
      rarityReason: item.rarityReason,
      audiophileHighlight: item.audiophileHighlight,
      dynamicRangeScore: item.dynamicRangeScore,
      appleMusicUrl: item.appleMusicUrl,
      coverImage: item.coverImage,
      status: 'queued',
      addedAt: Date.now()
    };

    this.items.push(newItem);
    this.saveToStorage();
    this.notify();
    return { added: true, item: newItem, alreadyExists: false };
  }

  /**
   * 批次加入
   */
  public addBatch(items: Parameters<typeof this.add>[0][]): number {
    let addedCount = 0;
    for (const it of items) {
      const res = this.add(it);
      if (res.added) addedCount++;
    }
    return addedCount;
  }

  /**
   * 從隊列中移除
   */
  public remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.saveToStorage();
    this.notify();
  }

  /**
   * 更新隊列項目狀態 (queued | listening | completed)
   */
  public updateStatus(id: string, status: QueueItemStatus): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    item.status = status;
    if (status === 'listening' && !item.startedAt) {
      item.startedAt = Date.now();
    } else if (status === 'completed' && !item.completedAt) {
      item.completedAt = Date.now();
    }

    this.saveToStorage();
    this.notify();
  }

  /**
   * 更新聆聽速記與星級
   */
  public updateReview(id: string, quickNotes?: string, rating?: number): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    if (quickNotes !== undefined) item.quickNotes = quickNotes;
    if (rating !== undefined) item.rating = rating;

    this.saveToStorage();
    this.notify();
  }

  /**
   * 拖曳或手動調換排序位置
   */
  public reorder(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.items.length) return;
    if (toIndex < 0 || toIndex >= this.items.length) return;

    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);

    this.saveToStorage();
    this.notify();
  }

  /**
   * 清除所有已完成項目
   */
  public clearCompleted(): void {
    this.items = this.items.filter((i) => i.status !== 'completed');
    this.saveToStorage();
    this.notify();
  }

  /**
   * 清空全部隊列
   */
  public clearAll(): void {
    this.items = [];
    this.saveToStorage();
    this.notify();
  }
}

export const listeningQueue = new ListeningQueueService();
