<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n } from '$lib/i18n/index.svelte';
  import {
    getArtists,
    quickPickupArtist,
    deleteArtist,
    updateArtist,
    seedInitialSampleIfEmpty,
    autoHealArtistCovers
  } from '$lib/db';
  import type { ArtistEntry } from '$lib/types/artist';
  import type { ArtistCandidate } from '$lib/utils/appleMusic';
  import StudioSidebar from '$lib/components/studio/StudioSidebar.svelte';
  import StudioTopBar from '$lib/components/studio/StudioTopBar.svelte';
  import CrateDiggerView from '$lib/components/studio/CrateDiggerView.svelte';
  import HoneycombClusterView from '$lib/components/studio/HoneycombClusterView.svelte';
  import FastPickupModal from '$lib/components/studio/FastPickupModal.svelte';
  import AISettingsModal from '$lib/components/studio/AISettingsModal.svelte';
  import MasterPasswordUnlockModal from '$lib/components/studio/MasterPasswordUnlockModal.svelte';
  import CloudSyncModal from '$lib/components/studio/CloudSyncModal.svelte';
  import { analyzeArtistWithAI } from '$lib/ai/client';
  import { loadSecureAISettings } from '$lib/ai/vault';
  import {
    getActiveAccount,
    subscribeSyncState,
    syncFromCloudOnStartup,
    type CloudSyncState
  } from '$lib/services/onedrive';
  import { CheckCircle2 } from 'lucide-svelte';

  // 狀態管理 (Svelte 5 Runes)
  let artists = $state<ArtistEntry[]>([]);
  let activeStudioView = $state<'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log'>('crate-digger');
  let selectedArtistId = $state<string | null>(null);
  let searchQuery = $state('');
  let isPickupModalOpen = $state(false);
  let isAISettingsOpen = $state(false);
  let isUnlockModalOpen = $state(false);
  let isCloudSyncOpen = $state(false);
  let isOneDriveConnected = $state(false);
  let isAiConfigured = $state(false);
  let cloudSyncState = $state<CloudSyncState>({ status: 'idle', lastSyncedAt: null });
  let pendingArtistToAnalyze = $state<ArtistEntry | null>(null);
  let toastMessage = $state<string | null>(null);
  let isAnalyzing = $state(false);

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

    (async () => {
      await refreshTelemetryStatus();

      // 若已連結 OneDrive，啟動時優先自雲端載入最新資料庫（雲端為單一真實來源）
      const didRestoreFromCloud = await syncFromCloudOnStartup();
      if (didRestoreFromCloud) {
        await reloadArtists();
      } else {
        await seedInitialSampleIfEmpty();
        await reloadArtists();
      }

      if (artists.length > 0 && !selectedArtistId) {
        selectedArtistId = artists[0].id;
      }

      // 方案 A：支援透過 URL Query 參數（如 iOS 捷徑、Shazam 自動化）快速收錄藝人
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const quickAddParam = urlParams.get('quickAdd') || urlParams.get('artist');
        if (quickAddParam && quickAddParam.trim()) {
          const targetArtist = quickAddParam.trim();
          // 清理網址參數，避免重新整理時重複收錄
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', cleanUrl || '/');

          await handlePickup(targetArtist);
          showToast(`已透過捷徑知悉藝人：${targetArtist}`);
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

  // AI 深度聲學解剖 (使用 BYOK AI 引擎與安全保管庫)
  async function handleAnalyze(artist: ArtistEntry) {
    if (isAnalyzing) return;
    isAnalyzing = true;
    showToast(`啟動 AI 聲學解剖: ${artist.name}...`);

    try {
      const result = await analyzeArtistWithAI(artist.name, i18n.locale);

      await updateArtist(artist.id, {
        status: 'analyzed',
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
          aestheticTags: result.aestheticTags || [],
          genres: result.genres,
          summary: result.summary,
          instrumentationNotes: result.instrumentationNotes || '',
          similarArtists: result.similarArtists || [],
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
            appleMusicSearchUrl:
              alb.appleMusicSearchUrl ||
              `https://music.apple.com/search?term=${encodeURIComponent(artist.name + ' ' + alb.title)}`
          }))
        }
      });
      await reloadArtists();
      showToast(`已完成「${artist.name}」聲學解剖！`);
    } catch (err: any) {
      console.error('[AI Analyze Error]:', err);
      const msg = err?.message || String(err);
      if (msg.includes('MASTER_PASSWORD_LOCKED')) {
        pendingArtistToAnalyze = artist;
        isUnlockModalOpen = true;
        showToast('請先解鎖主密碼保管庫');
      } else if (
        msg.includes('未設定') ||
        msg.includes('API Key 為空') ||
        msg.includes('未設定 Groq') ||
        msg.includes('未設定 Gemini')
      ) {
        isAISettingsOpen = true;
        showToast('請先設定 AI 金鑰');
      } else {
        showToast(`解剖失敗: ${msg}`);
      }
    } finally {
      isAnalyzing = false;
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

  // 相似藝人一鍵知悉
  async function handlePickupSimilar(name: string) {
    const newEntry = await quickPickupArtist(name);
    await reloadArtists();
    selectedArtistId = newEntry.id;
    showToast('已知悉');
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
  <!-- Toast 通知 -->
  {#if toastMessage}
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90vw] sm:w-auto px-4 py-2.5 bg-chassis border border-signal text-ink rounded-[2px] font-mono text-xs shadow-[0_0_24px_rgba(255,42,60,0.4)] flex items-center gap-2.5">
      <span class="w-2 h-2 rounded-full bg-signal shrink-0"></span>
      <span class="break-words leading-relaxed">{toastMessage}</span>
    </div>
  {/if}

  <!-- 拾音彈窗 (Fast Pickup Modal) -->
  <FastPickupModal
    open={isPickupModalOpen}
    onclose={() => (isPickupModalOpen = false)}
    onpickup={handlePickup}
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
      {#if activeStudioView === 'crate-digger'}
        <!-- 視圖 1: 藝人展間視圖 (Artist Showroom / Crate Digger View) -->
        <CrateDiggerView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          ondeleteArtist={handleDelete}
          onanalyzeArtist={handleAnalyze}
          onpickupSimilar={handlePickupSimilar}
          {isAnalyzing}
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
      {:else}
        <!-- 其他 Studio 模組待命占位 -->
        <div class="py-24 text-center font-mono text-xs text-[#8E9298] bg-[#0D0E11] rounded-[4px] border border-[#1F2228] p-8">
          <span class="material-symbols-outlined text-[36px] text-[#FEC486] mb-2">settings_input_component</span>
          <div class="text-sm font-bold text-[#EEF0F2] mb-1">
            {activeStudioView.toUpperCase()} // MODULE STANDBY
          </div>
          <p class="text-[#52565E]">此聆賞模組電路已接線待命。點擊左側導航「藝人展間」或「藝人星系」切換主視圖。</p>
        </div>
      {/if}
    </main>
  </div>
</div>
