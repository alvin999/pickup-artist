<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import type { SyncStatus } from '$lib/services/onedrive';

  interface Props {
    onopenPickupModal: () => void;
    onopenAISettings?: () => void;
    onopenCloudSync?: () => void;
    searchQuery: string;
    onsearchChange: (q: string) => void;
    isOneDriveConnected?: boolean;
    isAiConfigured?: boolean;
    syncStatus?: SyncStatus;
    lastSyncedAt?: number | null;
  }

  let {
    onopenPickupModal,
    onopenAISettings,
    onopenCloudSync,
    searchQuery = $bindable(''),
    onsearchChange,
    isOneDriveConnected = false,
    isAiConfigured = false,
    syncStatus = 'idle',
    lastSyncedAt = null
  }: Props = $props();

  const syncLabel = $derived.by(() => {
    if (!isOneDriveConnected) return t('status_sync_not_synced');
    if (syncStatus === 'syncing') return t('status_sync_syncing');
    if (syncStatus === 'offline') return '離線待命';
    if (syncStatus === 'error') return '同步失敗';
    return t('status_sync_connected');
  });
</script>

<header class="fixed top-0 left-0 lg:left-60 right-0 h-16 z-30 bg-void/90 backdrop-blur-md border-b border-wire flex items-center justify-between px-4 sm:px-6">
  <!-- 品牌銘牌 -->
  <div class="flex items-center gap-4 sm:gap-6 shrink-0">
    <div class="flex items-baseline gap-3">
      <h1 class="font-serif text-xl sm:text-2xl font-black tracking-tighter text-ink">{t('app_title')}</h1>
      <div class="hidden sm:flex flex-col">
        <span class="font-dot text-[11px] text-signal tracking-[0.2em] uppercase">PICKUP_ARTIST // LAB</span>
        <span class="font-mono text-[8px] text-ink-muted tracking-widest">TRANSPARENT ACOUSTIC ARCHITECTURE</span>
      </div>
    </div>
  </div>

  <!-- 中央指令列搜尋器（強化對比度與視覺層次） -->
  <div class="flex-1 max-w-sm sm:max-w-md lg:max-w-xl mx-3 sm:mx-6">
    <div class="flex items-center px-3.5 py-2 bg-[#121318] border border-[#2b2d36] hover:border-[#434755] focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30 focus-within:bg-[#16171f] transition-all font-mono rounded-[2px] shadow-inner">
      <span class="text-signal font-bold text-xs mr-2.5 select-none tracking-tighter">&gt;_</span>
      <input
        type="text"
        bind:value={searchQuery}
        oninput={(e) => onsearchChange((e.target as HTMLInputElement).value)}
        placeholder="QUERY: 搜尋藝人、母帶標籤、流派或別名..."
        class="bg-transparent text-xs text-[#f4f4f6] placeholder-[#8e929d] focus:outline-none w-full font-sans tracking-wide"
      />
      <kbd class="hidden sm:inline-flex items-center px-1.5 py-0.5 bg-[#1b1c24] border border-[#373a46] text-[#b4b7c2] text-[9px] font-mono tracking-wider ml-2 shrink-0 select-none">CMD+K</kbd>
    </div>
  </div>

  <!-- 右側硬體遙測與按鈕 -->
  <div class="flex items-center gap-2 sm:gap-3 font-mono">
    <!-- AI 引擎狀態與設定按鈕（可點擊喚起金鑰保管庫） -->
    <button
      type="button"
      onclick={onopenAISettings}
      title="點擊設定 BYOK AI 金鑰與模型保管庫"
      class="group flex items-center gap-2 px-2.5 py-1 bg-chassis hover:bg-[#15161e] border border-wire hover:border-signal border-dashed text-[10px] text-ink-muted hover:text-ink transition-all cursor-pointer"
    >
      <span class="w-1.5 h-1.5 rounded-full {isAiConfigured ? 'bg-signal animate-pulse' : 'bg-wire group-hover:bg-signal transition-colors'}"></span>
      <span class="hidden xl:inline">{isAiConfigured ? t('status_ai_ready') : t('status_ai_unconfigured')}</span>
      <span class="material-symbols-outlined text-[13px] {isAiConfigured ? 'text-signal' : 'text-ink-dim group-hover:text-signal transition-colors'}">key</span>
    </button>

    <!-- 雲端同步狀態與控制台 -->
    <button
      type="button"
      onclick={onopenCloudSync}
      title={isOneDriveConnected ? (syncStatus === 'syncing' ? '正在即時同步資料至雲端...' : '雲端即時同步已啟動，點擊管理') : '點擊設定 OneDrive 雲端即時同步'}
      class="group hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-chassis hover:bg-[#15161e] border {syncStatus === 'error' ? 'border-red-500/70 text-red-400' : syncStatus === 'syncing' ? 'border-amber-400/70 text-amber-300' : isOneDriveConnected ? 'border-[#2d3a33] text-emerald-400/90 hover:border-emerald-500' : 'border-wire hover:border-signal text-ink-muted hover:text-ink'} text-[10px] transition-all cursor-pointer"
    >
      {#if !isOneDriveConnected}
        <span class="material-symbols-outlined text-[13px] text-ink-dim group-hover:text-signal transition-colors">cloud_off</span>
      {:else if syncStatus === 'syncing'}
        <span class="material-symbols-outlined text-[13px] text-amber-400 animate-spin">sync</span>
      {:else if syncStatus === 'error'}
        <span class="material-symbols-outlined text-[13px] text-red-400">cloud_alert</span>
      {:else if syncStatus === 'offline'}
        <span class="material-symbols-outlined text-[13px] text-neutral-400">wifi_off</span>
      {:else}
        <span class="material-symbols-outlined text-[13px] text-emerald-400">cloud_done</span>
      {/if}
      <span>{syncLabel}</span>
    </button>

    <button
      type="button"
      onclick={onopenPickupModal}
      class="corner-cut-sm flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)]"
    >
      <span class="material-symbols-outlined text-[15px]">add</span>
      <span>知悉</span>
    </button>
    <div class="hidden sm:block">
      <LanguageToggle />
    </div>
  </div>
</header>

