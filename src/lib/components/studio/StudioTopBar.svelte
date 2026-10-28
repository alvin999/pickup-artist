<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import type { SyncStatus } from '$lib/services/onedrive';
  import type { ArtistEntry } from '$lib/types/artist';

  interface Props {
    onopenPickupModal: () => void;
    onopenLuckyModal?: () => void;
    onopenAISettings?: () => void;
    onopenCloudSync?: () => void;
    searchQuery: string;
    onsearchChange: (q: string) => void;
    artists?: ArtistEntry[];
    onselectArtist?: (id: string) => void;
    onquickPickup?: (query: string) => void;
    isOneDriveConnected?: boolean;
    isAiConfigured?: boolean;
    syncStatus?: SyncStatus;
    lastSyncedAt?: number | null;
    isSidebarCollapsed?: boolean;
    ontoggleSidebar?: () => void;
  }

  let {
    onopenPickupModal,
    onopenLuckyModal,
    onopenAISettings,
    onopenCloudSync,
    searchQuery = $bindable(''),
    onsearchChange,
    artists = [],
    onselectArtist,
    onquickPickup,
    isOneDriveConnected = false,
    isAiConfigured = false,
    syncStatus = 'idle',
    lastSyncedAt = null,
    isSidebarCollapsed = false,
    ontoggleSidebar
  }: Props = $props();

  let searchInputEl = $state<HTMLInputElement | null>(null);
  let searchContainerEl = $state<HTMLDivElement | null>(null);
  let isDropdownOpen = $state(false);

  // 觸發聲學好手氣
  function handleTriggerLucky(e: MouseEvent) {
    e.stopPropagation();
    onopenLuckyModal?.();
  }

  // 本機匹配藝人列表（最多取前 5 筆）
  const matchingArtists = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return artists
      .filter((a) => {
        const inName = a.name.toLowerCase().includes(q);
        const inAliases = a.aliases?.some((al) => al.toLowerCase().includes(q)) ?? false;
        const inGenres = a.analysis?.genres.some((g) => g.toLowerCase().includes(q)) ?? false;
        const inSub = a.analysis?.subGenre?.toLowerCase().includes(q) ?? false;
        return inName || inAliases || inGenres || inSub;
      })
      .slice(0, 5);
  });

  // 是否已存在完全相符的藝人名稱
  const hasExactMatch = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return false;
    return artists.some((a) => a.name.trim().toLowerCase() === q);
  });

  // 選取本機藝人並關閉浮層
  function handleSelectArtist(id: string) {
    onselectArtist?.(id);
    isDropdownOpen = false;
  }

  // 觸發知悉入庫
  function handleTriggerPickup(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    isDropdownOpen = false;
    if (onquickPickup) {
      onquickPickup(trimmed);
    } else {
      onopenPickupModal();
    }
  }

  // 鍵盤導航與回車直通
  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === 'Escape') {
      isDropdownOpen = false;
      searchInputEl?.blur();
      return;
    }

    if (e.key === 'Enter') {
      const currentVal = (searchInputEl?.value || searchQuery).trim();
      if (!currentVal) return;

      // 若有單一精確匹配，直接定位該藝人
      const exactArtist = artists.find((a) => a.name.trim().toLowerCase() === currentVal.toLowerCase());
      if (exactArtist) {
        e.preventDefault();
        handleSelectArtist(exactArtist.id);
        return;
      }

      // 若無完全相符者，直接回車觸發知悉入庫引導
      e.preventDefault();
      handleTriggerPickup(currentVal);
    }
  }

  onMount(() => {
    // 全域 CMD+K / CTRL+K 聚焦搜尋框
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputEl?.focus();
        searchInputEl?.select();
        isDropdownOpen = true;
      }
    };

    // 點擊外部關閉搜尋浮層
    const handleDocumentClick = (e: MouseEvent) => {
      if (searchContainerEl && !searchContainerEl.contains(e.target as Node)) {
        isDropdownOpen = false;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('click', handleDocumentClick);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('click', handleDocumentClick);
    };
  });

  const syncLabel = $derived.by(() => {
    if (!isOneDriveConnected) return t('status_sync_not_synced');
    if (syncStatus === 'session_expired') return t('status_sync_session_expired');
    if (syncStatus === 'syncing') return t('status_sync_syncing');
    if (syncStatus === 'offline') return '離線待命';
    if (syncStatus === 'error') return '同步失敗';
    return t('status_sync_connected');
  });
</script>

<header
  class="fixed top-0 left-0 {isSidebarCollapsed ? 'lg:left-16' : 'lg:left-60'} right-0 h-16 z-30 bg-void/98 border-b border-wire flex items-center justify-between px-2.5 sm:px-6 transition-[left] duration-300 ease-in-out"
  style="transform: translateZ(0); -webkit-transform: translateZ(0);"
>
  <!-- 品牌銘牌 -->
  <div class="flex items-center gap-2 sm:gap-6 shrink-0">
    <div class="flex items-baseline gap-2 sm:gap-3">
      <h1 class="font-serif text-lg sm:text-2xl font-black tracking-tighter text-ink truncate max-w-[100px] xs:max-w-none">{t('app_title')}</h1>
      <div class="hidden md:flex flex-col">
        <span class="font-dot text-[11px] text-signal tracking-[0.2em] uppercase">PICKUP_ARTIST // LAB</span>
        <span class="font-mono text-[8px] text-ink-muted tracking-widest">TRANSPARENT ACOUSTIC ARCHITECTURE</span>
      </div>
    </div>
  </div>

  <!-- 中央指令列搜尋器（響應式伸縮寬度與智慧知悉下拉選單） -->
  <div class="relative flex-1 max-w-[180px] xs:max-w-xs sm:max-w-md lg:max-w-xl mx-1.5 sm:mx-6 min-w-0" bind:this={searchContainerEl}>
    <div class="flex items-center px-2 sm:px-3.5 py-1.5 sm:py-2 bg-[#121318] border border-[#2b2d36] hover:border-[#434755] focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30 focus-within:bg-[#16171f] transition-all font-mono rounded-[2px] shadow-inner">
      <span class="text-signal font-bold text-xs mr-1.5 sm:mr-2.5 select-none tracking-tighter">&gt;_</span>
      <input
        type="text"
        bind:this={searchInputEl}
        bind:value={searchQuery}
        oninput={(e) => {
          onsearchChange((e.target as HTMLInputElement).value);
          isDropdownOpen = true;
        }}
        onfocus={() => {
          if (searchQuery.trim()) isDropdownOpen = true;
        }}
        onkeydown={handleSearchKeyDown}
        placeholder="搜尋藝人、流派或別名..."
        class="bg-transparent text-xs text-[#f4f4f6] placeholder-[#8e929d] focus:outline-none w-full font-sans tracking-wide min-w-0"
      />
      <!-- 聲學好手氣快捷按鈕 (Acoustic Serendipity) -->
      <button
        type="button"
        onclick={handleTriggerLucky}
        title="聲學好手氣 // 隨機探勘未入庫藝人"
        class="group/lucky flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition-all cursor-pointer shrink-0 ml-1.5"
      >
        <span class="inline-block text-xs select-none group-hover/lucky:rotate-12 group-hover/lucky:scale-110 transition-transform duration-200">
          🎲
        </span>
        <span class="hidden xl:inline text-[10px] tracking-wider uppercase text-amber-400/90 group-hover/lucky:text-amber-200">
          好手氣
        </span>
      </button>
      <kbd class="hidden md:inline-flex items-center px-1.5 py-0.5 bg-[#1b1c24] border border-[#373a46] text-[#b4b7c2] text-[9px] font-mono tracking-wider ml-1.5 shrink-0 select-none">CMD+K</kbd>
    </div>

    <!-- 即時搜尋與知悉引導下拉面板 (Smart Search & Fast Pickup Palette) -->
    {#if isDropdownOpen && searchQuery.trim()}
      <div class="absolute left-0 right-0 top-full mt-1.5 bg-[#0e1015]/98 backdrop-blur-md border border-[#2b2d36] rounded-[2px] shadow-2xl z-50 overflow-hidden font-mono divide-y divide-[#1e2029] animate-fadeIn">
        <!-- 本機收藏庫相符藝人 -->
        {#if matchingArtists.length > 0}
          <div class="p-1.5">
            <div class="px-2 py-1 text-[10px] text-ink-muted uppercase tracking-wider flex items-center justify-between">
              <span>ARCHIVED // 既有收錄 ({matchingArtists.length})</span>
              <span class="text-[9px] text-[#6b7080]">點擊直接定位</span>
            </div>
            <div class="flex flex-col gap-0.5 mt-0.5">
              {#each matchingArtists as artist (artist.id)}
                <button
                  type="button"
                  onclick={() => handleSelectArtist(artist.id)}
                  class="w-full text-left px-2.5 py-2 rounded-[2px] hover:bg-[#181a24] hover:border-l-2 hover:border-l-signal flex items-center justify-between gap-2.5 transition-all cursor-pointer group"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-7 h-7 rounded-full bg-[#181a22] border border-[#2c2f3d] overflow-hidden shrink-0 flex items-center justify-center">
                      {#if artist.coverImage}
                        <img src={artist.coverImage} alt={artist.name} class="w-full h-full object-cover" />
                      {:else}
                        <span class="material-symbols-outlined text-[14px] text-ink-muted">album</span>
                      {/if}
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-bold text-ink group-hover:text-white truncate">
                        {artist.name}
                      </span>
                      <span class="text-[10px] text-[#8e929d] truncate">
                        {artist.analysis?.subGenre || artist.analysis?.sector || '未定流派'}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[9px] px-1 py-0.5 bg-[#14151e] border border-[#2b2d3a] text-ink-muted rounded">
                      W{artist.weight ?? 20}
                    </span>
                    <span class="material-symbols-outlined text-[13px] text-ink-muted group-hover:text-signal transition-colors">
                      arrow_forward
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 知悉引導 (Fast Pickup) 入口：無完全符合時特別加強提示 -->
        <div class="p-1.5 bg-[#12131b]">
          <button
            type="button"
            onclick={() => handleTriggerPickup(searchQuery)}
            class="w-full text-left px-3 py-2.5 bg-signal/10 hover:bg-signal/20 border border-signal/30 hover:border-signal/70 rounded-[2px] flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-sm"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-7 h-7 rounded-full bg-signal text-white flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(255,42,60,0.5)]">
                <span class="material-symbols-outlined text-[16px]">person_add</span>
              </div>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-white group-hover:text-signal transition-colors truncate">
                    知悉「{searchQuery.trim()}」入庫
                  </span>
                  {#if !hasExactMatch}
                    <span class="text-[9px] px-1 bg-signal/30 text-red-200 border border-signal/40 rounded uppercase tracking-tighter">新藝人</span>
                  {/if}
                </div>
                <span class="text-[10px] text-[#b3b7c4] truncate">
                  自 Apple Music 智慧檢索並建立發燒友解剖檔案
                </span>
              </div>
            </div>
            <kbd class="shrink-0 px-2 py-1 bg-[#1a1c26] border border-[#3b3e4f] text-ink text-[10px] rounded group-hover:border-signal transition-colors font-mono">
              Enter ↵
            </kbd>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- 右側硬體遙測與操作按鈕 -->
  <div class="flex items-center gap-1.5 sm:gap-3 font-mono shrink-0">
    <!-- AI 引擎狀態與設定按鈕（可點擊喚起金鑰保管庫） -->
    <button
      type="button"
      onclick={onopenAISettings}
      title="點擊設定 BYOK AI 金鑰與模型保管庫"
      class="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1 bg-chassis hover:bg-[#15161e] border border-wire hover:border-signal border-dashed text-[10px] text-ink-muted hover:text-ink transition-all cursor-pointer"
    >
      <span class="w-1.5 h-1.5 rounded-full {isAiConfigured ? 'bg-signal animate-pulse' : 'bg-wire group-hover:bg-signal transition-colors'}"></span>
      <span class="hidden xl:inline">{isAiConfigured ? t('status_ai_ready') : t('status_ai_unconfigured')}</span>
      <span class="material-symbols-outlined text-[13px] {isAiConfigured ? 'text-signal' : 'text-ink-dim group-hover:text-signal transition-colors'}">key</span>
    </button>

    <!-- 雲端同步狀態與控制台 (全尺寸皆常駐顯示，小螢幕隱藏文字僅留圖示) -->
    <button
      type="button"
      onclick={onopenCloudSync}
      title={syncStatus === 'session_expired' ? '微軟帳戶登入已過期，點擊以重新驗證並同步' : isOneDriveConnected ? (syncStatus === 'syncing' ? '正在即時同步資料至雲端...' : '雲端即時同步已啟動，點擊管理') : '點擊設定 OneDrive 雲端即時同步'}
      class="group flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-chassis hover:bg-[#15161e] border {syncStatus === 'session_expired' ? 'border-amber-500/80 text-amber-300 hover:border-amber-400 bg-amber-500/10' : syncStatus === 'error' ? 'border-red-500/70 text-red-400' : syncStatus === 'syncing' ? 'border-amber-400/70 text-amber-300' : isOneDriveConnected ? 'border-[#2d3a33] text-emerald-400/90 hover:border-emerald-500' : 'border-wire hover:border-signal text-ink-muted hover:text-ink'} text-[10px] transition-all cursor-pointer"
    >
      {#if !isOneDriveConnected}
        <span class="material-symbols-outlined text-[13px] text-ink-dim group-hover:text-signal transition-colors">cloud_off</span>
      {:else if syncStatus === 'session_expired'}
        <span class="material-symbols-outlined text-[13px] text-amber-400 animate-pulse">lock_clock</span>
      {:else if syncStatus === 'syncing'}
        <span class="material-symbols-outlined text-[13px] text-amber-400 animate-spin">sync</span>
      {:else if syncStatus === 'error'}
        <span class="material-symbols-outlined text-[13px] text-red-400">cloud_alert</span>
      {:else if syncStatus === 'offline'}
        <span class="material-symbols-outlined text-[13px] text-neutral-400">wifi_off</span>
      {:else}
        <span class="material-symbols-outlined text-[13px] text-emerald-400">cloud_done</span>
      {/if}
      <span class="hidden md:inline">{syncLabel}</span>
    </button>

    <!-- 知悉按鈕 -->
    <button
      type="button"
      onclick={onopenPickupModal}
      class="corner-cut-sm flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)] shrink-0"
    >
      <span class="material-symbols-outlined text-[14px] sm:text-[15px]">add</span>
      <span>知悉</span>
    </button>

    <!-- 語言切換選單 (全尺寸皆可見) -->
    <div class="shrink-0">
      <LanguageToggle />
    </div>
  </div>
</header>

