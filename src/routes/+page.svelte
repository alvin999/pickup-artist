<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n } from '$lib/i18n/index.svelte';
  import {
    getArtists,
    quickPickupArtist,
    deleteArtist,
    updateArtist,
    seedInitialSampleIfEmpty,
    autoHealArtistCovers,
    onDatabaseChange
  } from '$lib/db';
  import type { ArtistEntry } from '$lib/types/artist';
  import { searchAppleMusicCandidates, type ArtistCandidate } from '$lib/utils/appleMusic';
  import StudioSidebar from '$lib/components/studio/StudioSidebar.svelte';
  import StudioTopBar from '$lib/components/studio/StudioTopBar.svelte';
  import CrateDiggerView from '$lib/components/studio/CrateDiggerView.svelte';
  import HoneycombClusterView from '$lib/components/studio/HoneycombClusterView.svelte';
  import AcousticMatrixView from '$lib/components/studio/AcousticMatrixView.svelte';
  import ListeningQueueView from '$lib/components/studio/ListeningQueueView.svelte';
  import ListeningLogView from '$lib/components/studio/ListeningLogView.svelte';
  import FastPickupModal from '$lib/components/studio/FastPickupModal.svelte';
  import AISettingsModal from '$lib/components/studio/AISettingsModal.svelte';
  import MasterPasswordUnlockModal from '$lib/components/studio/MasterPasswordUnlockModal.svelte';
  import CloudSyncModal from '$lib/components/studio/CloudSyncModal.svelte';
  import { analysisQueue, type QueueState } from '$lib/services/analysisQueue';
  import { loadSecureAISettings } from '$lib/ai/vault';
  import { fetchMoreSimilarArtists, fetchMoreNotableAlbums } from '$lib/ai/client';
  import { listeningQueue } from '$lib/services/listeningQueue';
  import type { NotableAlbum } from '$lib/types/artist';
  import {
    getActiveAccount,
    subscribeSyncState,
    syncFromCloudOnStartup,
    reauthenticateAndSync,
    type CloudSyncState
  } from '$lib/services/onedrive';
  import { CheckCircle2 } from 'lucide-svelte';

  // 狀態管理 (Svelte 5 Runes)
  let artists = $state<ArtistEntry[]>([]);
  let activeStudioView = $state<'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log'>('crate-digger');
  let selectedArtistId = $state<string | null>(null);
  let searchQuery = $state('');
  let isPickupModalOpen = $state(false);
  let pickupModalInitialQuery = $state<string>('');
  let pickupModalInitialCandidates = $state<ArtistCandidate[]>([]);
  let isAISettingsOpen = $state(false);
  let isUnlockModalOpen = $state(false);
  let isCloudSyncOpen = $state(false);
  let isOneDriveConnected = $state(false);
  let isAiConfigured = $state(false);
  let cloudSyncState = $state<CloudSyncState>({ status: 'idle', lastSyncedAt: null });
  let pendingArtistToAnalyze = $state<ArtistEntry | null>(null);
  let toastMessage = $state<string | null>(null);
  let isAnalyzing = $state(false);
  let isRecommendingMore = $state(false);
  let isRecommendingAlbums = $state(false);
  let queueState = $state<QueueState>(analysisQueue.getState());
  let isReauthenticating = $state(false);
  let targetLogArtistId = $state<string | null>(null);

  // 跨視圖跳轉：自展間或外部節點跳轉至聆賞日誌並聚焦該藝人
  function handleOpenInLog(artistId: string) {
    targetLogArtistId = artistId;
    activeStudioView = 'listening-log';
  }

  async function handleQuickReauth() {
    isReauthenticating = true;
    showToast('正在喚起微軟登入視窗...');
    try {
      await reauthenticateAndSync(async () => {
        await reloadArtists();
      });
      showToast('微軟授權驗證成功，雲端資料庫已即時同步！');
    } catch (err: any) {
      if (err?.errorCode !== 'user_cancelled') {
        showToast(err?.message || '重新驗證失敗');
      }
    } finally {
      isReauthenticating = false;
    }
  }

  async function refreshTelemetryStatus() {
    try {
      const account = await getActiveAccount();
      isOneDriveConnected = !!account;
    } catch {
      isOneDriveConnected = false;
    }

    try {
      const { settings, isLocked } = await loadSecureAISettings();
      const hasKey = settings.provider === 'groq' ? !!settings.groqKey : !!settings.geminiKey;
      isAiConfigured = !isLocked && hasKey;
    } catch {
      isAiConfigured = false;
    }
  }

  // 待解剖收件匣計數
  const inboxCount = $derived(artists.filter((a) => a.status === 'inbox').length);

  // 關鍵字搜尋過濾
  const filteredArtists = $derived(
    artists.filter((artist) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inName = artist.name.toLowerCase().includes(q);
      const inAliases = artist.aliases?.some((al) => al.toLowerCase().includes(q)) ?? false;
      const inGenres = artist.analysis?.genres.some((g) => g.toLowerCase().includes(q)) ?? false;
      const inCat = artist.catalogNumber?.toLowerCase().includes(q) ?? false;
      return inName || inAliases || inGenres || inCat;
    })
  );

  onMount(() => {
    // 訂閱雲端即時同步狀態
    const unsubSync = subscribeSyncState((st) => {
      cloudSyncState = st;
    });

    // 訂閱 AI 背景批次分析佇列
    const unsubQueue = analysisQueue.subscribe(async (st) => {
      queueState = st;
      isAnalyzing = st.status === 'processing';
      if (st.lastMessage && st.status !== 'cooling_down') {
        showToast(st.lastMessage);
      }
    });

    // 監聽本機資料庫變更事件，無感即時刷新畫面
    const unsubDb = onDatabaseChange(async (e) => {
      if (e?.type === 'upsert' || e?.type === 'batch') {
        await reloadArtists();
      }
    });

    (async () => {
      // 1. 【樂觀優先】立即自本機 IndexedDB 載入現有快取資料，達成 0 毫秒首頁秒開
      await reloadArtists();
      if (artists.length === 0) {
        await seedInitialSampleIfEmpty();
        await reloadArtists();
      }

      if (artists.length > 0 && !selectedArtistId) {
        selectedArtistId = artists[0].id;
      }

      // 2. 【背景無感同步】於背景刷新遙測狀態與雲端資料庫（不阻塞 UI 首屏渲染）
      refreshTelemetryStatus().catch(console.warn);

      // 若已連結 OneDrive，於背景自雲端同步最新狀態（以雲端為單一真實來源進行雙向時間戳合併）
      syncFromCloudOnStartup()
        .then(async (didRestoreFromCloud) => {
          if (didRestoreFromCloud) {
            await reloadArtists();
            // 確保原本已選中的藝人不會被意外重置
            if (!artists.some((a) => a.id === selectedArtistId)) {
              selectedArtistId = artists[0]?.id || null;
            }
          }
        })
        .catch((err) => {
          console.warn('[CloudSync] 背景啟動同步失敗:', err);
        });

      // 方案 A：支援透過 URL Query 參數（如 iOS 捷徑、Shazam 自動化）快速收錄藝人
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const quickAddParam = urlParams.get('quickAdd') || urlParams.get('artist');
        if (quickAddParam && quickAddParam.trim()) {
          const targetArtist = quickAddParam.trim();
          // 清理網址參數，避免重新整理時重複收錄
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', cleanUrl || '/');

          // 防重檢查：若本機已存在該藝人，直接選取並定位，避免捷徑重複建立
          const existing = artists.find(
            (a) => a.name.trim().toLowerCase() === targetArtist.toLowerCase()
          );
          if (existing) {
            selectedArtistId = existing.id;
            showToast(`藝人已在收藏庫中：${existing.name}`);
          } else {
            await handlePickup(targetArtist);
            showToast(`已透過捷徑知悉藝人：${targetArtist}`);
          }
        }
      }

      // 自動背景修復無效或缺失的封面，無感更新
      const hasUpdated = await autoHealArtistCovers();
      if (hasUpdated) {
        await reloadArtists();
      }
    })();

    return () => {
      unsubSync();
      unsubQueue();
      unsubDb();
    };
  });

  async function reloadArtists() {
    artists = await getArtists();
  }

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2500);
  }

  // 執行知悉
  async function handlePickup(input: string, candidate?: ArtistCandidate) {
    try {
      const newEntry = await quickPickupArtist(input, candidate);
      await reloadArtists();
      selectedArtistId = newEntry.id;
      showToast('已知悉');
    } catch (err: any) {
      showToast(err?.message || '知悉失敗');
    }
  }

  // 刪除藝人
  async function handleDelete(id: string) {
    try {
      await deleteArtist(id);
      await reloadArtists();
      if (selectedArtistId === id) {
        selectedArtistId = artists[0]?.id || null;
      }
      showToast('已自檔案庫刪除');
    } catch (err: any) {
      showToast(err?.message || '刪除失敗');
    }
  }

  // AI 深度聲學解剖 (透過背景批次佇列與 429 智能重試排程)
  async function handleAnalyze(artist: ArtistEntry) {
    try {
      const secureLoaded = await loadSecureAISettings();
      if (secureLoaded.isLocked) {
        pendingArtistToAnalyze = artist;
        isUnlockModalOpen = true;
        showToast('請先解鎖主密碼保管庫');
        return;
      }

      const { settings } = secureLoaded;
      const hasKey = settings.provider === 'groq' ? !!settings.groqKey.trim() : !!settings.geminiKey.trim();
      if (!hasKey) {
        isAISettingsOpen = true;
        showToast('請先設定 AI 金鑰');
        return;
      }

      // 排入背景佇列依序執行，徹底解決 TPM 429 併發擊穿問題
      analysisQueue.enqueue(artist, i18n.locale);
    } catch (err: any) {
      console.error('[AI Analyze Enqueue Error]:', err);
      showToast(err?.message || '排入佇列失敗');
    }
  }

  function handleUnlocked() {
    refreshTelemetryStatus();
    if (pendingArtistToAnalyze) {
      const target = pendingArtistToAnalyze;
      pendingArtistToAnalyze = null;
      handleAnalyze(target);
    }
  }

  // 相似藝人一鍵知悉（支援重複檢查：若已在收藏庫中則直接定位；支援智慧候選無感入庫與同名爭議排歧）
  async function handlePickupSimilar(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;

    const lowerClean = cleanName.toLowerCase();
    const existing = artists.find((a) => a.name.trim().toLowerCase() === lowerClean);
    if (existing) {
      selectedArtistId = existing.id;
      showToast(`「${existing.name}」已在收藏庫中，已為您定位`);
      return;
    }

    try {
      showToast(`檢索「${cleanName}」音樂人資料...`);
      const candidates = await searchAppleMusicCandidates(cleanName);

      if (candidates.length === 1) {
        // 唯一定位：精確無感入庫
        const newEntry = await quickPickupArtist(cleanName, candidates[0]);
        await reloadArtists();
        selectedArtistId = newEntry.id;
        showToast(`已知悉：${newEntry.name}`);
      } else if (candidates.length > 1) {
        // 存在多名同名/相似藝人（例如 Battles）：開啟排歧選單供使用者挑選曲風與封面
        pickupModalInitialQuery = cleanName;
        pickupModalInitialCandidates = candidates;
        isPickupModalOpen = true;
      } else {
        // 查無候選：以藝人名稱直接知悉
        const newEntry = await quickPickupArtist(cleanName);
        await reloadArtists();
        selectedArtistId = newEntry.id;
        showToast(`已知悉：${newEntry.name}`);
      }
    } catch (err: any) {
      console.warn('[handlePickupSimilar] 候選檢索異常，退回純文字知悉:', err);
      const newEntry = await quickPickupArtist(cleanName);
      await reloadArtists();
      selectedArtistId = newEntry.id;
      showToast('已知悉');
    }
  }

  // 一鍵請 AI 推薦更多相似藝人（方案 A：累加擴展池 ＋ 避開排除清單）
  async function handleRecommendMoreSimilar(artist: ArtistEntry) {
    if (isRecommendingMore) return;

    try {
      const secureLoaded = await loadSecureAISettings();
      if (secureLoaded.isLocked) {
        pendingArtistToAnalyze = artist;
        isUnlockModalOpen = true;
        showToast('請先解鎖主密碼保管庫以調用 AI');
        return;
      }

      const { settings } = secureLoaded;
      const hasKey = settings.provider === 'groq' ? !!settings.groqKey.trim() : !!settings.geminiKey.trim();
      if (!hasKey) {
        isAISettingsOpen = true;
        showToast('請先設定 AI 金鑰');
        return;
      }

      isRecommendingMore = true;

      // 收集排除名單：庫存所有藝人名稱、別名，加上當前藝人已推薦之相似名單
      const excludeSet = new Set<string>();
      artists.forEach((a) => {
        excludeSet.add(a.name.trim());
        a.aliases?.forEach((al) => excludeSet.add(al.trim()));
      });
      artist.analysis?.similarArtists?.forEach((sim) => excludeSet.add(sim.trim()));
      excludeSet.add(artist.name.trim());

      const excludeList = Array.from(excludeSet);

      const newSims = await fetchMoreSimilarArtists(
        artist.name,
        artist.analysis?.sector,
        artist.analysis?.subGenre,
        excludeList,
        i18n.locale,
        settings
      );

      if (!newSims || newSims.length === 0) {
        showToast('AI 未探索到更多新相似音樂人，目前星系網絡已相當豐富');
        return;
      }

      // 合併去重並更新回資料庫（累加擴展池）
      const currentSimilar = artist.analysis?.similarArtists || [];
      const mergedSimilar = Array.from(new Set([...currentSimilar, ...newSims]));

      const cleanAnalysis = JSON.parse(JSON.stringify(artist.analysis || {}));
      cleanAnalysis.similarArtists = mergedSimilar;

      await updateArtist(artist.id, {
        analysis: cleanAnalysis
      });

      await reloadArtists();
      showToast(`已成功為「${artist.name}」探索並擴充 ${newSims.length} 位相似音樂人！`);
    } catch (err: any) {
      console.error('[Recommend More Similar Error]:', err);
      showToast(err?.message || '探索推薦失敗');
    } finally {
      isRecommendingMore = false;
    }
  }

  // 一鍵請 AI 推薦更多代表盤與發燒寶藏（累加至 notableAlbums）
  async function handleRecommendMoreAlbums(artist: ArtistEntry) {
    if (isRecommendingAlbums) return;

    try {
      const secureLoaded = await loadSecureAISettings();
      if (secureLoaded.isLocked) {
        pendingArtistToAnalyze = artist;
        isUnlockModalOpen = true;
        showToast('請先解鎖主密碼保管庫以調用 AI');
        return;
      }

      const { settings } = secureLoaded;
      const hasKey = settings.provider === 'groq' ? !!settings.groqKey.trim() : !!settings.geminiKey.trim();
      if (!hasKey) {
        isAISettingsOpen = true;
        showToast('請先設定 AI 金鑰');
        return;
      }

      isRecommendingAlbums = true;

      // 收集該藝人已收錄的專輯名稱作為排除名單
      const existingAlbums = (artist.analysis?.notableAlbums || []).map((alb) => alb.title.trim());

      const newAlbums = await fetchMoreNotableAlbums(
        artist.name,
        artist.analysis?.sector,
        artist.analysis?.subGenre,
        existingAlbums,
        i18n.locale,
        settings
      );

      if (!newAlbums || newAlbums.length === 0) {
        showToast('AI 未探索到更多新專輯，目前收錄之代表盤已相當經典');
        return;
      }

      // 合併去重並更新回資料庫（累加擴展池）
      const currentAlbums = artist.analysis?.notableAlbums || [];
      const mergedAlbums = [...currentAlbums, ...newAlbums];

      const cleanAnalysis = JSON.parse(JSON.stringify(artist.analysis || {}));
      cleanAnalysis.notableAlbums = mergedAlbums;

      await updateArtist(artist.id, {
        analysis: cleanAnalysis
      });

      await reloadArtists();
      showToast(`已成功為「${artist.name}」挖掘並收錄 ${newAlbums.length} 張發燒名盤！`);
    } catch (err: any) {
      console.error('[Recommend More Albums Error]:', err);
      showToast(err?.message || '推薦專輯過程遭遇異常');
    } finally {
      isRecommendingAlbums = false;
    }
  }

  // 將藝人或特定專輯加入聆賞隊列
  function handleAddToQueue(artist: ArtistEntry, album?: NotableAlbum) {
    const res = listeningQueue.add({
      artistId: artist.id,
      artistName: artist.name,
      albumTitle: album?.title,
      albumYear: album?.year,
      tier: album?.tier,
      losslessSpec: album?.losslessSpec || artist.formatSpec,
      description: album?.description,
      rarityReason: album?.rarityReason,
      audiophileHighlight: album?.audiophileHighlight,
      dynamicRangeScore: album?.dynamicRangeScore || artist.dynamicRange,
      appleMusicUrl: album?.appleMusicSearchUrl || artist.appleMusicUrl,
      coverImage: artist.coverImage
    });

    if (res.alreadyExists) {
      showToast(`《${album ? album.title : artist.name}》已在聆賞隊列中`);
    } else {
      showToast(`已將《${album ? album.title : artist.name}》推入聆賞隊列`);
    }
  }

  // 調整藝人聲學引力權重 (Weight: 1 ~ 100)
  async function handleUpdateWeight(id: string, weight: number) {
    await updateArtist(id, { weight });
    // 即時響應更新本地狀態
    const target = artists.find((a) => a.id === id);
    if (target) {
      target.weight = weight;
    }
  }

  // 儲存藝人在星系中的手動拖曳座標 (持久化至 IndexedDB)
  async function handleUpdatePos(id: string, clusterPos: { x: number; y: number }) {
    await updateArtist(id, { clusterPos });
    const target = artists.find((a) => a.id === id);
    if (target) {
      target.clusterPos = clusterPos;
    }
  }

  // 儲存來自聆賞手札的藝人筆記、心頭好專輯與標籤更新
  async function handleUpdateArtistFromLog(updated: ArtistEntry) {
    await updateArtist(updated.id, updated);
    const idx = artists.findIndex((a) => a.id === updated.id);
    if (idx !== -1) {
      artists[idx] = updated;
    }
  }

  // 全域快捷鍵
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('header input') as HTMLInputElement | null;
      searchInput?.focus();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="min-h-screen bg-void text-ink flex flex-col font-sans bg-dot-matrix selection:bg-signal selection:text-white">
  <!-- 429 冷卻倒數提示條 (Rate Limit Cooldown Banner) -->
  {#if queueState.status === 'cooling_down'}
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90vw] sm:w-auto px-4 py-2.5 bg-[#17110e] border border-amber-500 text-amber-200 rounded-[2px] font-mono text-xs shadow-[0_0_24px_rgba(245,158,11,0.35)] flex items-center gap-2.5 animate-in fade-in">
      <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0"></span>
      <span class="break-words leading-relaxed">
        ⏳ API 頻率保護中：將於 <strong>{queueState.cooldownRemainingSeconds}</strong> 秒後自動重試「{queueState.currentArtist?.name}」...
      </span>
    </div>
  {:else if toastMessage}
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90vw] sm:w-auto px-4 py-2.5 bg-chassis border border-signal text-ink rounded-[2px] font-mono text-xs shadow-[0_0_24px_rgba(255,42,60,0.4)] flex items-center gap-2.5">
      <span class="w-2 h-2 rounded-full bg-signal shrink-0"></span>
      <span class="break-words leading-relaxed">{toastMessage}</span>
    </div>
  {/if}

  <!-- 拾音彈窗 (Fast Pickup Modal) -->
  <FastPickupModal
    open={isPickupModalOpen}
    existingArtists={artists}
    initialQuery={pickupModalInitialQuery}
    initialCandidates={pickupModalInitialCandidates}
    onclose={() => {
      isPickupModalOpen = false;
      pickupModalInitialQuery = '';
      pickupModalInitialCandidates = [];
    }}
    onpickup={handlePickup}
    onselectExisting={(artist) => {
      selectedArtistId = artist.id;
      showToast(`已為您定位至既有藝人：${artist.name}`);
    }}
  />

  <!-- AI 設定與金鑰保管庫 Modal -->
  <AISettingsModal
    open={isAISettingsOpen}
    onclose={() => (isAISettingsOpen = false)}
    onsettingsSaved={refreshTelemetryStatus}
  />

  <!-- 主密碼解鎖 Modal -->
  <MasterPasswordUnlockModal
    open={isUnlockModalOpen}
    onclose={() => (isUnlockModalOpen = false)}
    onunlocked={handleUnlocked}
  />

  <!-- OneDrive 雲端同步與備份 Modal -->
  <CloudSyncModal
    isOpen={isCloudSyncOpen}
    onclose={() => (isCloudSyncOpen = false)}
    onRestored={reloadArtists}
    onAccountChange={(conn) => (isOneDriveConnected = conn)}
    localArtistsCount={artists.length}
  />

  <!-- 電腦版 Studio 左側固定舞台導航欄 (Studio Left Sidebar) -->
  <div class="hidden lg:block">
    <StudioSidebar
      activeView={activeStudioView}
      onselectView={(v) => (activeStudioView = v)}
      totalArtistsCount={artists.length}
      {inboxCount}
      {artists}
      {showToast}
    />
  </div>

  <!-- Studio 頂部母帶工作列 (Studio Master TopBar) -->
  <StudioTopBar
    onopenPickupModal={() => (isPickupModalOpen = true)}
    onopenAISettings={() => (isAISettingsOpen = true)}
    onopenCloudSync={() => (isCloudSyncOpen = true)}
    bind:searchQuery
    onsearchChange={(q) => (searchQuery = q)}
    {isOneDriveConnected}
    {isAiConfigured}
    syncStatus={cloudSyncState.status}
    lastSyncedAt={cloudSyncState.lastSyncedAt}
  />

  <!-- Studio 主畫布內容區 (帶左側 60 欄位位移與頂部 16 欄位位移) -->
  <div class="lg:pl-60 pt-16 flex-1 flex flex-col">
    <main class="flex-1 p-4 md:p-6 w-full">
      <!-- Session 過期引導橫幅 (Local-First Fallback & One-Click Re-Auth) -->
      {#if cloudSyncState.status === 'session_expired'}
        <div class="mb-4 p-3.5 bg-[#1a150e]/95 border border-amber-500/50 rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 font-mono text-xs shadow-lg backdrop-blur-sm animate-fadeIn">
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-amber-400 text-lg shrink-0">lock_clock</span>
            <div>
              <span class="font-bold text-amber-300">微軟雲端授權已過期：</span>
              <span class="text-amber-200/90">系統已無縫切換至「本機安全快取」模式，您的閱讀與編輯皆已妥善保存。</span>
            </div>
          </div>
          <button
            type="button"
            onclick={handleQuickReauth}
            disabled={isReauthenticating}
            class="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-void font-bold text-[11px] uppercase tracking-wider rounded-[2px] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span class="material-symbols-outlined text-[15px] {isReauthenticating ? 'animate-spin' : ''}">
              {isReauthenticating ? 'sync' : 'refresh'}
            </span>
            <span>{isReauthenticating ? '正在重新驗證...' : '一鍵重新連線並同步'}</span>
          </button>
        </div>
      {/if}

      {#if activeStudioView === 'crate-digger'}
        <!-- 視圖 1: 藝人展間視圖 (Artist Showroom / Crate Digger View) -->
        <CrateDiggerView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          ondeleteArtist={handleDelete}
          onanalyzeArtist={handleAnalyze}
          onpickupSimilar={handlePickupSimilar}
          onrecommendMoreSimilar={handleRecommendMoreSimilar}
          onrecommendMoreAlbums={handleRecommendMoreAlbums}
          onaddToQueue={handleAddToQueue}
          onopenInLog={handleOpenInLog}
          {queueState}
          {isAnalyzing}
          {isRecommendingMore}
          {isRecommendingAlbums}
        />
      {:else if activeStudioView === 'honeycomb-cluster'}
        <!-- 視圖 2: 藝人星系蜂巢矩陣視圖 (Artist Constellation View) -->
        <HoneycombClusterView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          ondeleteArtist={handleDelete}
          onanalyzeArtist={handleAnalyze}
          onpickupSimilar={handlePickupSimilar}
          onupdateWeight={handleUpdateWeight}
          onupdatePos={handleUpdatePos}
        />
      {:else if activeStudioView === 'acoustic-matrix'}
        <!-- 視圖 3: 風格矩陣視圖 (Acoustic Matrix View) -->
        <AcousticMatrixView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          onopenInCrate={(id) => {
            selectedArtistId = id;
            activeStudioView = 'crate-digger';
          }}
          onlocateInGalaxy={(id) => {
            selectedArtistId = id;
            activeStudioView = 'honeycomb-cluster';
          }}
          ondeleteArtist={handleDelete}
          onanalyzeArtist={handleAnalyze}
          {isAnalyzing}
        />
      {:else if activeStudioView === 'listening-queue'}
        <!-- 視圖 4: 聆賞隊列視圖 (Listening Queue View) -->
        <ListeningQueueView
          artists={artists}
          onselectArtist={(id) => {
            selectedArtistId = id;
            activeStudioView = 'crate-digger';
          }}
          onopenInCrate={(id) => {
            selectedArtistId = id;
            activeStudioView = 'crate-digger';
          }}
          {showToast}
        />
      {:else if activeStudioView === 'listening-log'}
        <!-- 視圖 5: 聆賞日誌視圖 (Listening Log View) -->
        <ListeningLogView
          artists={artists}
          initialTargetArtistId={targetLogArtistId}
          onupdateArtist={handleUpdateArtistFromLog}
          onselectArtist={(id) => {
            selectedArtistId = id;
            activeStudioView = 'crate-digger';
          }}
          onopenInCrate={(id) => {
            selectedArtistId = id;
            activeStudioView = 'crate-digger';
          }}
          {showToast}
        />
      {:else}
        <!-- 其他 Studio 模組待命占位 -->
        <div class="py-24 text-center font-mono text-xs text-[#8E9298] bg-[#0D0E11] rounded-[4px] border border-[#1F2228] p-8">
          <span class="material-symbols-outlined text-[36px] text-[#FEC486] mb-2">settings_input_component</span>
          <div class="text-sm font-bold text-[#EEF0F2] mb-1">
            {String(activeStudioView).toUpperCase()} // MODULE STANDBY
          </div>
          <p class="text-[#52565E]">此聆賞模組電路已接線待命。點擊左側導航「藝人展間」或「藝人星系」切換主視圖。</p>
        </div>
      {/if}
    </main>
  </div>
</div>
