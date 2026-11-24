<script lang="ts">
  import type { AcousticSector, ArtistEntry } from '$lib/types/artist';
  import { t, i18n } from '$lib/i18n';
  import {
    buildMatrixHierarchy,
    type MatrixSortMode,
    type MatrixSectorGroup
  } from '$lib/utils/matrixGrouping';
  import StreamingTrigger from '$lib/components/studio/StreamingTrigger.svelte';

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId?: string | null;
    onselectArtist?: (id: string) => void;
    onopenInCrate?: (id: string) => void;
    onlocateInGalaxy?: (id: string) => void;
    ondeleteArtist?: (id: string) => void;
    onanalyzeArtist?: (artist: ArtistEntry) => void;
    onupdateWeight?: (id: string, weight: number) => void;
    isAnalyzing?: boolean;
  }

  let {
    artists = [],
    selectedArtistId = $bindable(null),
    onselectArtist,
    onopenInCrate,
    onlocateInGalaxy,
    ondeleteArtist,
    onanalyzeArtist,
    onupdateWeight,
    isAnalyzing = false
  }: Props = $props();

  // 搜尋與排序狀態
  let searchQuery = $state('');
  let sortMode = $state<MatrixSortMode>('weight');

  // 逐層下鑽狀態：一頁專注顯示一個 Level (1: 大分類 | 2: 子流派 | 3: 藝人矩陣)
  let currentLevel = $state<1 | 2 | 3>(1);
  let activeSectorId = $state<AcousticSector | 'INBOX'>('ROCK');
  let activeSubGenreName = $state<string>('__ALL__');

  // 防卡手設計 1：麵包屑下拉快切選單狀態 ('sector' | 'subgenre' | null)
  let openDropdown = $state<'sector' | 'subgenre' | null>(null);

  // 外層容器參考，供切換層級時平滑滾回頂端
  let matrixRootEl = $state<HTMLElement | null>(null);

  // 計算階層式分組
  const hierarchy = $derived(buildMatrixHierarchy(artists, searchQuery, sortMode));

  // 防卡手設計 2：只要輸入搜尋關鍵字，自動進入「跨層搜尋直達模式」
  const isSearchActive = $derived(searchQuery.trim().length > 0);

  // 當前選取的大分類物件
  const currentSector = $derived<MatrixSectorGroup>(
    hierarchy.sectors.find((s) => s.id === activeSectorId) ||
      hierarchy.sectors[0] || {
        id: 'ROCK',
        name: 'Rock & Post-Rock',
        nameTw: t('sector_rock_name'),
        colorHex: '#f59e0b',
        description: '',
        count: 0,
        subGenres: []
      }
  );

  // Level 3 當前子分類所過濾出的藝人列表
  const displayedArtists = $derived.by<ArtistEntry[]>(() => {
    if (!currentSector) return [];
    if (activeSubGenreName === '__ALL__') {
      const map = new Map<string, ArtistEntry>();
      for (const sub of currentSector.subGenres) {
        for (const a of sub.artists) {
          map.set(a.id, a);
        }
      }
      return Array.from(map.values());
    } else {
      const targetSub = currentSector.subGenres.find((s) => s.name === activeSubGenreName);
      return targetSub ? targetSub.artists : [];
    }
  });

  // 跨層搜尋直達模式的扁平結果清單（附帶來源大分類與子流派資訊，並依 sortMode 全域排序）
  interface SearchArtistItem {
    artist: ArtistEntry;
    sectorId: AcousticSector | 'INBOX';
    sectorNameTw: string;
    sectorColor: string;
    subGenreName: string;
  }

  const searchDirectItems = $derived.by<SearchArtistItem[]>(() => {
    if (!isSearchActive) return [];
    const seen = new Map<string, SearchArtistItem>();
    for (const sec of hierarchy.sectors) {
      for (const sub of sec.subGenres) {
        for (const artist of sub.artists) {
          if (!seen.has(artist.id)) {
            seen.set(artist.id, {
              artist,
              sectorId: sec.id,
              sectorNameTw: sec.nameTw,
              sectorColor: sec.colorHex,
              subGenreName: sub.name
            });
          }
        }
      }
    }
    const list = Array.from(seen.values());
    list.sort((a, b) => {
      switch (sortMode) {
        case 'weight': {
          const wA = a.artist.weight ?? 20;
          const wB = b.artist.weight ?? 20;
          if (wB !== wA) return wB - wA;
          return (b.artist.addedAt || 0) - (a.artist.addedAt || 0);
        }
        case 'dr': {
          const drA = a.artist.dynamicRange ?? a.artist.analysis?.notableAlbums?.[0]?.dynamicRangeScore ?? 0;
          const drB = b.artist.dynamicRange ?? b.artist.analysis?.notableAlbums?.[0]?.dynamicRangeScore ?? 0;
          if (drB !== drA) return drB - drA;
          return (b.artist.addedAt || 0) - (a.artist.addedAt || 0);
        }
        case 'recent':
          return (b.artist.addedAt || 0) - (a.artist.addedAt || 0);
        case 'name':
          return a.artist.name.localeCompare(b.artist.name, i18n.dateLocale);
        default:
          return 0;
      }
    });
    return list;
  });

  // 若當前扇區因篩選或資料變動已不存在，平滑修正
  $effect(() => {
    if (hierarchy.sectors.length > 0) {
      const exists = hierarchy.sectors.some((s) => s.id === activeSectorId);
      if (!exists) {
        activeSectorId = hierarchy.sectors[0].id;
        activeSubGenreName = '__ALL__';
      }
    }
  });

  // 切換層級時，若頁面已捲動超過工具列，平滑帶回頂端
  function scrollToMatrixTop() {
    if (typeof window === 'undefined' || !matrixRootEl) return;
    const rect = matrixRootEl.getBoundingClientRect();
    if (rect.top < 64) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - 72),
        behavior: 'smooth'
      });
    }
  }

  // 回到 Level 1 (大分類總覽)
  function goToLevel1() {
    openDropdown = null;
    currentLevel = 1;
    scrollToMatrixTop();
  }

  // 進入 Level 2 (指定大分類的子流派矩陣)
  function enterSector(sectorId: AcousticSector | 'INBOX') {
    activeSectorId = sectorId;
    activeSubGenreName = '__ALL__';
    openDropdown = null;
    currentLevel = 2;
    scrollToMatrixTop();
  }

  // 進入 Level 3 (指定子流派的藝人矩陣)
  function enterSubGenre(subName: string) {
    activeSubGenreName = subName;
    openDropdown = null;
    currentLevel = 3;
    scrollToMatrixTop();
  }

  // 捷徑：從 Level 1 卡片熱門標籤或搜尋來源徽章，直接跨層跳入 Level 3
  function jumpDirectToSubGenre(sectorId: AcousticSector | 'INBOX', subName: string) {
    searchQuery = '';
    activeSectorId = sectorId;
    activeSubGenreName = subName;
    openDropdown = null;
    currentLevel = 3;
    scrollToMatrixTop();
  }

  // 防卡手設計：在麵包屑快速切換大分類（若在 Level 3，保留停留在 Level 3 並自動切為該分類全部藝人；若在 Level 2，則留在 Level 2）
  function quickSwitchSector(sectorId: AcousticSector | 'INBOX') {
    activeSectorId = sectorId;
    activeSubGenreName = '__ALL__';
    openDropdown = null;
    if (currentLevel === 1) {
      currentLevel = 2;
    }
    scrollToMatrixTop();
  }

  // 防卡手設計：在麵包屑快速切換子流派，直接更新 Level 3 列表
  function quickSwitchSubGenre(subName: string) {
    activeSubGenreName = subName;
    openDropdown = null;
    currentLevel = 3;
    scrollToMatrixTop();
  }

  // 切換麵包屑下拉選單
  function toggleDropdown(e: MouseEvent, target: 'sector' | 'subgenre') {
    e.stopPropagation();
    openDropdown = openDropdown === target ? null : target;
  }

  // 點擊藝人卡片
  function handleCardClick(artist: ArtistEntry) {
    selectedArtistId = artist.id;
    onselectArtist?.(artist.id);
  }
</script>

<!-- 點擊外部或按 Esc 自動收合麵包屑下拉快切選單 -->
<svelte:window
  onclick={() => {
    if (openDropdown) openDropdown = null;
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && openDropdown) {
      openDropdown = null;
    }
  }}
/>

<!-- 共用藝人卡片片段：供 Level 3 與跨層搜尋直達模式共用 -->
{#snippet artistCard(artist: ArtistEntry, sourceMeta?: { sectorId: AcousticSector | 'INBOX'; sectorNameTw: string; sectorColor: string; subGenreName: string })}
  {@const isSelected = selectedArtistId === artist.id}
  {@const topAlbum = artist.analysis?.notableAlbums?.[0]}
  {@const isInbox = artist.status === 'inbox'}

  <div
    role="button"
    tabindex="0"
    onclick={() => handleCardClick(artist)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardClick(artist);
      }
    }}
    class="group flex flex-col justify-between bg-panel border rounded p-3.5 transition-all text-left relative cursor-pointer {isSelected
      ? 'border-signal ring-1 ring-signal bg-panel/90 shadow-[0_0_15px_rgba(255,42,60,0.12)]'
      : 'border-wire hover:border-wire-bright hover:bg-panel/70'}"
  >
    <div>
      <!-- 跨層搜尋直達模式時，顯示來源分類路徑徽章，點擊可直接定位至該子流派 -->
      {#if sourceMeta}
        <div class="mb-2 pb-1.5 border-b border-wire/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              jumpDirectToSubGenre(sourceMeta.sectorId, sourceMeta.subGenreName);
            }}
            class="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-muted hover:text-ink transition-colors truncate cursor-pointer"
            title={`${sourceMeta.sectorNameTw} > ${sourceMeta.subGenreName}`}
          >
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0"
              style="background-color: {sourceMeta.sectorColor};"
            ></span>
            <span class="font-bold shrink-0" style="color: {sourceMeta.sectorColor};">
              {sourceMeta.sectorNameTw}
            </span>
            <span class="text-wire-bright">/</span>
            <span class="truncate text-ink-muted group-hover:text-ink">{sourceMeta.subGenreName}</span>
          </button>
        </div>
      {/if}

      <!-- 卡片頂部：藝人名、別名與狀態標籤 -->
      <div class="flex items-start justify-between gap-2 mb-1.5">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-ink group-hover:text-primary transition-colors truncate">
            {artist.name}
          </div>
          {#if artist.aliases && artist.aliases.length > 0}
            <div class="text-[10px] font-mono text-ink-muted truncate">
              // {artist.aliases.join(' · ')}
            </div>
          {/if}
        </div>

        <!-- 狀態或身分膠囊 -->
        <div class="flex items-center gap-1 flex-none font-mono text-[9px]">
          {#if isInbox}
            <span class="px-1.5 py-0.5 rounded bg-signal/20 text-signal border border-signal/40 font-bold">
              INBOX
            </span>
          {:else if artist.entityType}
            <span class="px-1.5 py-0.5 rounded bg-chassis border border-wire text-ink-muted uppercase">
              {artist.entityType}
            </span>
          {/if}
        </div>
      </div>

      <!-- 核心定位 / 專精角色 (Artist Role) -->
      {#if artist.analysis?.artistRole}
        <div class="text-[11px] text-ink-muted font-mono mb-2 flex items-center gap-1">
          <span class="material-symbols-outlined text-[13px] text-ink-dim">tune</span>
          <span class="truncate">{artist.analysis.artistRole}</span>
        </div>
      {/if}

      <!-- 聲學指標列 -->
      <div class="flex flex-wrap items-center gap-2 mb-3 font-mono text-[10px]">
        <!-- DR 動態指標 -->
        {#if artist.dynamicRange || topAlbum?.dynamicRangeScore}
          {@const drVal = artist.dynamicRange || topAlbum?.dynamicRangeScore}
          <span class="px-1.5 py-0.2 rounded bg-void border border-wire text-ink font-bold">
            DR {drVal}
          </span>
        {/if}

        <!-- 發燒等第 -->
        {#if artist.audiophileGrade}
          <span class="px-1.5 py-0.2 rounded bg-chassis border border-wire text-primary font-bold text-[9px]">
            {artist.audiophileGrade}
          </span>
        {/if}

        <!-- 挖寶層級標記 (Milestone / Treasure) -->
        {#if topAlbum?.tier === 'hidden-treasure'}
          <span class="px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-800/40 text-[9px] flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[11px]">diamond</span>
            <span>{t('badge_hidden_treasure')}</span>
          </span>
        {:else if topAlbum?.tier === 'milestone'}
          <span class="px-1.5 py-0.2 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[9px] flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[11px]">foundation</span>
            <span>{t('badge_milestone')}</span>
          </span>
        {/if}

        <!-- 聲學引力 Weight 微步進器 (1 ~ 100) -->
        <div class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-void border border-wire text-ink font-mono text-[9px]">
          <span class="text-ink-dim font-bold">W:</span>
          {#if onupdateWeight}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onupdateWeight(artist.id, Math.max(1, (artist.weight ?? 20) - 5));
              }}
              class="text-ink-dim hover:text-signal px-0.5 font-bold cursor-pointer transition-colors"
              title={t('matrix_weight_down')}
            >-</button>
          {/if}
          <span class="font-bold {(artist.weight ?? 20) >= 70 ? 'text-[#FEC486]' : 'text-ink'} font-tabular">
            {artist.weight ?? 20}
          </span>
          {#if onupdateWeight}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onupdateWeight(artist.id, Math.min(100, (artist.weight ?? 20) + 5));
              }}
              class="text-ink-dim hover:text-signal px-0.5 font-bold cursor-pointer transition-colors"
              title={t('matrix_weight_up')}
            >+</button>
          {/if}
        </div>
      </div>

      <!-- 代表專輯或核心錄音 -->
      {#if topAlbum}
        <div class="p-2 rounded bg-void/70 border border-wire mb-3">
          <div class="flex items-center justify-between text-[11px] mb-0.5">
            <span class="font-bold text-ink truncate flex-1 pr-1">
              {topAlbum.title}
            </span>
            {#if topAlbum.year}
              <span class="font-mono text-[10px] text-ink-dim flex-none">
                {topAlbum.year}
              </span>
            {/if}
          </div>

          {#if topAlbum.audiophileHighlight || topAlbum.description}
            <p class="text-[10px] text-ink-dim line-clamp-2 leading-relaxed">
              {topAlbum.audiophileHighlight || topAlbum.description}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- 卡片底座工具列 (Action Hub) -->
    <div class="pt-2 border-t border-wire flex items-center justify-between gap-1 text-[10px] font-mono">
      <!-- 串流直通觸發器 -->
      <StreamingTrigger
        artistName={artist.name}
        appleMusicUrl={artist.appleMusicUrl}
        variant="subtle"
      />

      <div class="flex items-center gap-1">
        {#if isInbox}
          <!-- 快速解剖按鈕 -->
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              onanalyzeArtist?.(artist);
            }}
            disabled={isAnalyzing}
            class="px-2 py-1 rounded bg-signal/20 hover:bg-signal/30 text-signal border border-signal/40 font-bold transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            title={t('matrix_analyze_title')}
          >
            <span class="material-symbols-outlined text-[12px] {isAnalyzing ? 'animate-spin' : ''}">
              {isAnalyzing ? 'sync' : 'neurology'}
            </span>
            <span>{t('matrix_analyze_btn')}</span>
          </button>
        {/if}

        <!-- 移至展間 -->
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            selectedArtistId = artist.id;
            onopenInCrate?.(artist.id);
          }}
          class="px-2 py-1 rounded bg-chassis hover:bg-panel border border-wire hover:border-wire-bright text-ink-dim hover:text-ink transition-all flex items-center gap-1 cursor-pointer"
          title={t('matrix_crate_title')}
        >
          <span class="material-symbols-outlined text-[12px]">album</span>
          <span>{t('matrix_crate_btn')}</span>
        </button>

        <!-- 移至星系 -->
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            selectedArtistId = artist.id;
            onlocateInGalaxy?.(artist.id);
          }}
          class="px-2 py-1 rounded bg-chassis hover:bg-panel border border-wire hover:border-wire-bright text-ink-dim hover:text-ink transition-all flex items-center gap-1 cursor-pointer"
          title={t('matrix_galaxy_title')}
        >
          <span class="material-symbols-outlined text-[12px]">hub</span>
          <span>{t('matrix_galaxy_btn')}</span>
        </button>

        <!-- 刪除 -->
        {#if ondeleteArtist}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              if (confirm(t('matrix_delete_confirm', { name: artist.name }))) {
                ondeleteArtist(artist.id);
              }
            }}
            class="p-1 rounded text-ink-dim hover:text-signal hover:bg-signal/10 transition-all cursor-pointer"
            title={t('matrix_delete_aria')}
            aria-label={t('matrix_delete_aria')}
          >
            <span class="material-symbols-outlined text-[14px]">delete</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

<!-- 防卡手設計 3：取消鎖死高度與巢狀捲軸，改為自然整頁捲動 + Sticky 導航頭 -->
<div
  bind:this={matrixRootEl}
  class="flex flex-col min-h-[640px] bg-void border border-wire rounded-[4px] select-none font-sans"
>
  <!-- 頂部固定導航與控制區 (Sticky HUD + Breadcrumb Bar) -->
  <div class="sticky top-16 z-20 bg-chassis/95 backdrop-blur-md border-b border-wire rounded-t-[4px]">
    <!-- 第一列：視圖識別、統計指標、搜尋與排序 -->
    <header class="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-wire/70">
      <!-- 左側：視圖識別銘牌 -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-signal shadow-[0_0_8px_rgba(255,42,60,0.8)] animate-pulse"></span>
          <span class="font-mono text-xs font-bold text-ink tracking-wider">{t('matrix_title')}</span>
        </div>
        <span class="text-wire-bright">/</span>
        <span class="font-mono text-[11px] text-ink-muted uppercase tracking-widest hidden sm:inline">
          HIERARCHICAL ACOUSTIC EXPLORER
        </span>
      </div>

      <!-- 中間：即時統計指標 (Telemetry Stats) -->
      <div class="flex items-center gap-2.5 font-mono text-[10px] text-ink-dim">
        <div class="border border-wire px-2 py-1 bg-panel/60 rounded flex items-center gap-1.5">
          <span class="text-ink-muted">TOTAL:</span>
          <span class="text-ink font-bold">{hierarchy.totalArtists}</span>
        </div>
        <div class="border border-wire px-2 py-1 bg-panel/60 rounded flex items-center gap-1.5">
          <span class="text-ink-muted">SECTORS:</span>
          <span class="text-signal font-bold">{hierarchy.sectors.filter((s) => s.count > 0).length}</span>
        </div>
        <div class="border border-wire px-2 py-1 bg-panel/60 rounded flex items-center gap-1.5 hidden md:flex">
          <span class="text-ink-muted">SUB-GENRES:</span>
          <span class="text-primary font-bold">{hierarchy.totalSubGenres}</span>
        </div>
      </div>

      <!-- 右側：搜尋與排序控制 -->
      <div class="flex items-center gap-2">
        <!-- 關鍵字搜尋（輸入即自動切換至跨層直達模式） -->
        <div class="relative">
          <span class="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-ink-dim">search</span>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder={t('matrix_search_placeholder')}
            class="w-40 sm:w-56 pl-7 pr-7 py-1 text-xs bg-panel border rounded text-ink placeholder:text-ink-dim focus:outline-none focus:border-wire-bright focus:ring-1 focus:ring-signal font-mono transition-all {isSearchActive ? 'border-signal' : 'border-wire'}"
          />
          {#if searchQuery}
            <button
              type="button"
              onclick={() => (searchQuery = '')}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink text-xs cursor-pointer"
              aria-label={t('matrix_clear_search')}
            >
              ✕
            </button>
          {/if}
        </div>

        <!-- 排序選單 -->
        <select
          bind:value={sortMode}
          style="color-scheme: dark;"
          class="bg-panel border border-wire rounded px-2 py-1 text-xs font-mono text-ink-muted hover:text-ink focus:outline-none focus:border-wire-bright cursor-pointer [color-scheme:dark]"
          aria-label={t('matrix_sort_aria')}
        >
          <option value="weight" class="bg-[#0a0a0c] text-ink">{t('matrix_sort_weight')}</option>
          <option value="dr" class="bg-[#0a0a0c] text-ink">{t('matrix_sort_dr')}</option>
          <option value="recent" class="bg-[#0a0a0c] text-ink">{t('matrix_sort_recent')}</option>
          <option value="name" class="bg-[#0a0a0c] text-ink">{t('matrix_sort_name')}</option>
        </select>
      </div>
    </header>

    <!-- 第二列：麵包屑導航與下拉快切列 (Interactive Breadcrumb + Quick Switcher) -->
    <nav
      aria-label="Matrix Hierarchy Navigation"
      class="px-4 py-2 bg-void/70 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]"
    >
      {#if isSearchActive}
        <!-- 跨層搜尋直達狀態列 -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="px-2 py-0.5 rounded bg-signal/20 border border-signal/50 text-signal font-bold text-[10px] flex items-center gap-1 shrink-0">
            <span class="material-symbols-outlined text-[12px]">bolt</span>
            <span>{t('matrix_search_direct_badge')}</span>
          </span>
          <span class="text-ink truncate">
            "{searchQuery.trim()}"
          </span>
          <button
            type="button"
            onclick={() => (searchQuery = '')}
            class="px-2 py-0.5 rounded border border-wire bg-panel hover:border-signal text-ink-muted hover:text-signal text-[10px] transition-colors cursor-pointer shrink-0"
          >
            {t('matrix_clear_search')}
          </button>
        </div>

        <div class="text-[10px] text-ink-muted shrink-0">
          {t('matrix_artists_found')} <span class="text-ink font-bold">{searchDirectItems.length}</span> {t('matrix_artists_unit')}
        </div>
      {:else}
        <!-- 正常逐層麵包屑 + 下拉快切 -->
        <div class="flex items-center flex-wrap gap-1.5 min-w-0">
          <!-- 返回上一層快捷鍵（在 Level 2 / 3 時顯示） -->
          {#if currentLevel > 1}
            <button
              type="button"
              onclick={() => {
                openDropdown = null;
                currentLevel = currentLevel === 3 ? 2 : 1;
                scrollToMatrixTop();
              }}
              class="mr-1 px-2 py-1 rounded bg-panel hover:bg-chassis border border-wire hover:border-signal text-ink-muted hover:text-signal flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
              title={currentLevel === 3 ? t('matrix_back_to_subgenres') : t('matrix_back_to_sectors')}
            >
              <span class="material-symbols-outlined text-[13px]">arrow_back</span>
              <span class="hidden sm:inline">
                {currentLevel === 3 ? t('matrix_back_to_subgenres') : t('matrix_back_to_sectors')}
              </span>
            </button>
          {/if}

          <!-- Level 1 節點：MATRIX 根目錄 -->
          <button
            type="button"
            onclick={goToLevel1}
            class="px-2 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer {currentLevel === 1
              ? 'bg-signal text-white font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-panel'}"
          >
            <span class="material-symbols-outlined text-[13px]">pie_chart</span>
            <span>{t('matrix_tab_sector')}</span>
          </button>

          <!-- Level 2 節點：大分類 + 下拉快切器 -->
          {#if currentLevel >= 2}
            <span class="text-wire-bright">&gt;</span>
            <div class="relative inline-flex items-center">
              <div
                class="inline-flex items-center rounded border overflow-hidden transition-colors {currentLevel === 2
                  ? 'bg-panel border-wire-bright text-ink font-bold'
                  : 'bg-panel/60 border-wire text-ink-muted hover:text-ink'}"
              >
                <button
                  type="button"
                  onclick={() => {
                    openDropdown = null;
                    currentLevel = 2;
                    scrollToMatrixTop();
                  }}
                  class="px-2 py-1 flex items-center gap-1.5 hover:bg-chassis/80 transition-colors cursor-pointer"
                >
                  <span
                    class="w-2 h-2 rounded-full shrink-0"
                    style="background-color: {currentSector.colorHex};"
                  ></span>
                  <span style="color: {currentLevel === 2 ? currentSector.colorHex : ''};">
                    {currentSector.nameTw}
                  </span>
                </button>
                <button
                  type="button"
                  onclick={(e) => toggleDropdown(e, 'sector')}
                  class="px-1.5 py-1 border-l border-wire/70 hover:bg-chassis hover:text-signal transition-colors cursor-pointer flex items-center"
                  title={t('matrix_quick_switch_sector')}
                  aria-label={t('matrix_quick_switch_sector')}
                >
                  <span class="material-symbols-outlined text-[14px] transition-transform {openDropdown === 'sector' ? 'rotate-180 text-signal' : ''}">
                    expand_more
                  </span>
                </button>
              </div>

              <!-- 大分類快切下拉選單 -->
              {#if openDropdown === 'sector'}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={(e) => e.stopPropagation()}
                  class="absolute left-0 top-full mt-1.5 w-60 max-h-80 overflow-y-auto bg-chassis border border-wire-bright rounded shadow-[0_12px_32px_rgba(0,0,0,0.75)] py-1 z-40"
                >
                  <div class="px-2.5 py-1 text-[9px] text-ink-dim uppercase tracking-wider border-b border-wire/60">
                    {t('matrix_quick_switch_sector')}
                  </div>
                  {#each hierarchy.sectors as sec (sec.id)}
                    {@const isSecActive = sec.id === activeSectorId}
                    <button
                      type="button"
                      onclick={() => quickSwitchSector(sec.id)}
                      class="w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer {isSecActive
                        ? 'bg-panel text-ink font-bold'
                        : 'text-ink-muted hover:bg-panel/60 hover:text-ink'}"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          style="background-color: {sec.colorHex};"
                        ></span>
                        <span class="truncate">{sec.nameTw}</span>
                      </div>
                      <span class="text-[10px] text-ink-dim shrink-0">{sec.count}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Level 3 節點：子流派 + 下拉快切器 -->
          {#if currentLevel === 3}
            <span class="text-wire-bright">&gt;</span>
            <div class="relative inline-flex items-center max-w-full">
              <div class="inline-flex items-center rounded border bg-panel border-signal/60 text-ink font-bold overflow-hidden max-w-full">
                <span class="px-2.5 py-1 text-primary truncate max-w-[200px] sm:max-w-[280px]">
                  {activeSubGenreName === '__ALL__' ? t('matrix_all_substyles') : activeSubGenreName}
                </span>
                <button
                  type="button"
                  onclick={(e) => toggleDropdown(e, 'subgenre')}
                  class="px-1.5 py-1 border-l border-wire/70 hover:bg-chassis hover:text-signal transition-colors cursor-pointer flex items-center shrink-0"
                  title={t('matrix_quick_switch_subgenre')}
                  aria-label={t('matrix_quick_switch_subgenre')}
                >
                  <span class="material-symbols-outlined text-[14px] transition-transform {openDropdown === 'subgenre' ? 'rotate-180 text-signal' : ''}">
                    expand_more
                  </span>
                </button>
              </div>

              <!-- 子流派快切下拉選單 -->
              {#if openDropdown === 'subgenre'}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={(e) => e.stopPropagation()}
                  class="absolute left-0 top-full mt-1.5 w-64 sm:w-72 max-h-80 overflow-y-auto bg-chassis border border-wire-bright rounded shadow-[0_12px_32px_rgba(0,0,0,0.75)] py-1 z-40"
                >
                  <div class="px-2.5 py-1 text-[9px] text-ink-dim uppercase tracking-wider border-b border-wire/60">
                    {t('matrix_quick_switch_subgenre')}
                  </div>
                  <button
                    type="button"
                    onclick={() => quickSwitchSubGenre('__ALL__')}
                    class="w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer border-b border-wire/50 {activeSubGenreName === '__ALL__'
                      ? 'bg-panel text-ink font-bold'
                      : 'text-ink-muted hover:bg-panel/60 hover:text-ink'}"
                  >
                    <span class="truncate">[ALL] {t('matrix_all_substyles')}</span>
                    <span class="text-[10px] text-ink-dim shrink-0">{currentSector.count}</span>
                  </button>
                  {#each currentSector.subGenres as sub (sub.name)}
                    {@const isSubActive = activeSubGenreName === sub.name}
                    <button
                      type="button"
                      onclick={() => quickSwitchSubGenre(sub.name)}
                      class="w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer {isSubActive
                        ? 'bg-panel text-primary font-bold'
                        : 'text-ink-muted hover:bg-panel/60 hover:text-ink'}"
                    >
                      <span class="truncate">{sub.name}</span>
                      <span class="text-[10px] text-ink-dim shrink-0">{sub.count}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 右側層級進度提示 -->
        <div class="text-[10px] text-ink-muted shrink-0 flex items-center gap-2">
          {#if currentLevel === 1}
            <span class="text-ink-dim">LEVEL 1 / 3</span>
          {:else if currentLevel === 2}
            <span>{t('matrix_subgenre_count', { count: currentSector.subGenres.length })}</span>
            <span class="text-wire-bright">·</span>
            <span class="text-ink-dim">LEVEL 2 / 3</span>
          {:else}
            <span>
              {t('matrix_artists_found')} <span class="text-ink font-bold">{displayedArtists.length}</span> {t('matrix_artists_unit')}
            </span>
            <span class="text-wire-bright">·</span>
            <span class="text-ink-dim">LEVEL 3 / 3</span>
          {/if}
        </div>
      {/if}
    </nav>
  </div>

  <!-- 主內容舞台：一次只專注呈現一個層級（或跨層搜尋直達結果） -->
  <main class="flex-1 p-4 sm:p-5">
    {#if isSearchActive}
      <!-- ============================================== -->
      <!-- 跨層搜尋直達模式 (Cross-Matrix Direct Results)  -->
      <!-- ============================================== -->
      {#if searchDirectItems.length === 0}
        <div class="py-20 flex flex-col items-center justify-center text-center font-mono">
          <span class="material-symbols-outlined text-[40px] text-ink-dim mb-2">search_off</span>
          <div class="text-sm font-bold text-ink-muted mb-1">{t('matrix_empty_title')}</div>
          <p class="text-xs text-ink-dim max-w-md mb-4">
            {t('matrix_empty_search', { query: searchQuery })}
          </p>
          <button
            type="button"
            onclick={() => (searchQuery = '')}
            class="px-3 py-1.5 rounded bg-panel hover:bg-chassis border border-wire hover:border-signal text-xs text-ink-muted hover:text-signal transition-colors cursor-pointer"
          >
            {t('matrix_clear_search')}
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          {#each searchDirectItems as item (item.artist.id)}
            {@render artistCard(item.artist, {
              sectorId: item.sectorId,
              sectorNameTw: item.sectorNameTw,
              sectorColor: item.sectorColor,
              subGenreName: item.subGenreName
            })}
          {/each}
        </div>
      {/if}

    {:else if currentLevel === 1}
      <!-- ============================================== -->
      <!-- LEVEL 1: 8 軸聲學板塊大卡片總覽                 -->
      <!-- ============================================== -->
      <div class="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div class="font-mono text-[11px] text-ink-muted flex items-center gap-2">
          <span class="text-signal font-bold">{t('matrix_col1_header')}</span>
          <span class="text-wire-bright hidden sm:inline">//</span>
          <span class="text-ink-dim text-[11px] font-sans hidden sm:inline">{t('matrix_level1_hint')}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#each hierarchy.sectors as sector (sector.id)}
          {@const isEmpty = sector.count === 0}
          {@const isInboxSector = sector.id === 'INBOX'}
          {@const previewSubGenres = sector.subGenres.slice(0, 3)}
          {@const extraSubCount = Math.max(0, sector.subGenres.length - 3)}

          <div
            role="button"
            tabindex="0"
            onclick={() => enterSector(sector.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                enterSector(sector.id);
              }
            }}
            class="group relative flex flex-col justify-between bg-panel border rounded p-4 text-left transition-all cursor-pointer overflow-hidden {isInboxSector
              ? 'border-signal/50 hover:border-signal bg-signal/[0.03]'
              : isEmpty
                ? 'border-wire/60 opacity-60 hover:opacity-90 hover:border-wire-bright'
                : 'border-wire hover:border-wire-bright hover:bg-panel/80 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]'}"
          >
            <!-- 頂部聲學代表色光條 -->
            <div
              class="absolute top-0 inset-x-0 h-[3px] transition-opacity {isEmpty ? 'opacity-30' : 'opacity-85 group-hover:opacity-100'}"
              style="background-color: {sector.colorHex};"
            ></div>

            <div>
              <!-- 卡片標頭：名稱與藝人總數 -->
              <div class="flex items-start justify-between gap-3 mb-2.5 pt-1">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span
                      class="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style="background-color: {sector.colorHex}; box-shadow: {isEmpty ? 'none' : `0 0 10px ${sector.colorHex}80`};"
                    ></span>
                    <h3 class="text-base font-bold text-ink truncate group-hover:text-white transition-colors">
                      {sector.nameTw}
                    </h3>
                  </div>
                  <div class="font-mono text-[10px] text-ink-dim uppercase tracking-wider truncate pl-4.5">
                    {sector.name}
                  </div>
                </div>

                <!-- 大字體藝人數量儀表 -->
                <div class="text-right shrink-0 font-mono">
                  <div
                    class="text-2xl font-black leading-none font-tabular"
                    style="color: {isEmpty ? '' : sector.colorHex};"
                  >
                    {sector.count}
                  </div>
                  <div class="text-[9px] text-ink-dim mt-1">
                    {t('matrix_subgenre_count', { count: sector.subGenres.length })}
                  </div>
                </div>
              </div>

              <!-- 聲學定位描述 -->
              <p class="text-xs text-ink-muted leading-relaxed line-clamp-2 mb-3.5 min-h-[2.25rem]">
                {sector.description || t('matrix_sector_fallback_desc')}
              </p>
            </div>

            <!-- 底部熱門子流派預覽膠囊（點擊膠囊可直接跳進 Level 3！） -->
            <div class="pt-3 border-t border-wire/70 flex items-center justify-between gap-2">
              {#if previewSubGenres.length > 0}
                <div class="flex flex-wrap gap-1.5 min-w-0">
                  {#each previewSubGenres as sub (sub.name)}
                    <button
                      type="button"
                      onclick={(e) => {
                        e.stopPropagation();
                        jumpDirectToSubGenre(sector.id, sub.name);
                      }}
                      class="px-2 py-0.5 rounded bg-void/80 hover:bg-chassis border border-wire hover:border-signal text-[10px] font-mono text-ink-muted hover:text-ink transition-colors truncate max-w-[140px] cursor-pointer"
                      title={`${sub.name} (${sub.count})`}
                    >
                      {sub.name} <span class="text-ink-dim">{sub.count}</span>
                    </button>
                  {/each}
                  {#if extraSubCount > 0}
                    <span class="px-1.5 py-0.5 text-[10px] font-mono text-ink-dim">
                      {t('matrix_more_subgenres', { count: extraSubCount })}
                    </span>
                  {/if}
                </div>
              {:else}
                <span class="text-[10px] font-mono text-ink-dim">{t('matrix_sector_empty')}</span>
              {/if}

              <span class="material-symbols-outlined text-[16px] text-ink-dim group-hover:text-ink group-hover:translate-x-0.5 transition-all shrink-0">
                arrow_forward
              </span>
            </div>
          </div>
        {/each}
      </div>

    {:else if currentLevel === 2}
      <!-- ============================================== -->
      <!-- LEVEL 2: 子流派矩陣（含完整名稱與代表藝人預覽） -->
      <!-- ============================================== -->
      <!-- 頂部扇區資訊橫幅 -->
      <div
        class="mb-5 p-4 rounded bg-chassis/70 border border-wire flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative overflow-hidden"
      >
        <div
          class="absolute left-0 top-0 bottom-0 w-1"
          style="background-color: {currentSector.colorHex};"
        ></div>

        <div class="pl-2 min-w-0">
          <div class="flex items-center gap-2.5 flex-wrap mb-1">
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              style="background-color: {currentSector.colorHex}; box-shadow: 0 0 8px {currentSector.colorHex};"
            ></span>
            <h2 class="text-lg font-bold text-ink">{currentSector.nameTw}</h2>
            <span class="font-mono text-xs text-ink-dim uppercase">{currentSector.name}</span>
          </div>
          <p class="text-xs text-ink-muted leading-relaxed max-w-3xl">
            {currentSector.description || t('matrix_level2_hint')}
          </p>
        </div>

        <div class="flex items-center gap-3 shrink-0 font-mono pl-2 sm:pl-0">
          <div class="px-3 py-1.5 rounded bg-void border border-wire text-center">
            <div class="text-base font-black leading-none" style="color: {currentSector.colorHex};">
              {currentSector.count}
            </div>
            <div class="text-[9px] text-ink-dim mt-0.5">{t('matrix_artists_unit')}</div>
          </div>
          <div class="px-3 py-1.5 rounded bg-void border border-wire text-center">
            <div class="text-base font-black text-ink leading-none">
              {currentSector.subGenres.length}
            </div>
            <div class="text-[9px] text-ink-dim mt-0.5">{t('matrix_tab_subgenre')}</div>
          </div>
        </div>
      </div>

      {#if currentSector.count === 0}
        <div class="py-16 flex flex-col items-center justify-center text-center font-mono border border-dashed border-wire rounded bg-panel/20">
          <span class="material-symbols-outlined text-[36px] text-ink-dim mb-2">category</span>
          <div class="text-sm font-bold text-ink-muted mb-1">{t('matrix_sector_empty')}</div>
          <button
            type="button"
            onclick={goToLevel1}
            class="mt-3 px-3 py-1.5 rounded bg-panel hover:bg-chassis border border-wire hover:border-signal text-xs text-ink-muted hover:text-signal transition-colors cursor-pointer flex items-center gap-1"
          >
            <span class="material-symbols-outlined text-[14px]">arrow_back</span>
            <span>{t('matrix_back_to_sectors')}</span>
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          <!-- 第一張特殊卡片：全部子風格 -->
          <button
            type="button"
            onclick={() => enterSubGenre('__ALL__')}
            class="group flex flex-col justify-between p-4 rounded bg-chassis/80 hover:bg-panel border border-wire-bright hover:border-signal text-left transition-all cursor-pointer hover:-translate-y-0.5"
          >
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="font-mono text-[10px] px-2 py-0.5 rounded bg-signal/15 text-signal border border-signal/40 font-bold">
                  ALL_SECTOR
                </span>
                <span class="font-mono text-lg font-black text-ink font-tabular">
                  {currentSector.count}
                </span>
              </div>
              <div class="text-sm font-bold text-ink group-hover:text-signal transition-colors mb-1">
                {t('matrix_all_substyles')}
              </div>
              <p class="text-[11px] text-ink-dim leading-relaxed">
                {t('matrix_all_sector_desc')}
              </p>
            </div>

            <div class="mt-4 pt-2.5 border-t border-wire/70 flex items-center justify-between font-mono text-[10px] text-ink-muted group-hover:text-signal">
              <span>{t('matrix_tab_artists', { count: currentSector.count })}</span>
              <span class="material-symbols-outlined text-[15px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
            </div>
          </button>

          <!-- 其餘子流派卡片 -->
          {#each currentSector.subGenres as sub (sub.name)}
            {@const ratio = currentSector.count > 0 ? Math.round((sub.count / currentSector.count) * 100) : 0}
            {@const featuredArtists = sub.artists.slice(0, 3)}

            <button
              type="button"
              onclick={() => enterSubGenre(sub.name)}
              class="group flex flex-col justify-between p-4 rounded bg-panel hover:bg-panel/80 border border-wire hover:border-wire-bright text-left transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
            >
              <div class="w-full">
                <!-- 子流派完整名稱（不再硬截斷）與人數 -->
                <div class="flex items-start justify-between gap-2 mb-2">
                  <h3 class="text-sm font-bold text-ink group-hover:text-primary transition-colors leading-snug break-words">
                    {sub.name}
                  </h3>
                  <span class="font-mono text-xs px-2 py-0.5 rounded bg-void border border-wire text-ink font-bold shrink-0 font-tabular">
                    {sub.count}
                  </span>
                </div>

                <!-- 佔比視覺刻度條 -->
                <div class="w-full h-1 bg-void rounded-full overflow-hidden mb-3">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    style="width: {Math.max(6, ratio)}%; background-color: {currentSector.colorHex};"
                  ></div>
                </div>

                <!-- 代表藝人預覽 -->
                {#if featuredArtists.length > 0}
                  <div class="text-[10px] text-ink-dim font-mono mb-1">
                    {t('matrix_top_artists_preview')} //
                  </div>
                  <div class="flex flex-wrap gap-1">
                    {#each featuredArtists as fa (fa.id)}
                      <span class="px-1.5 py-0.5 rounded bg-void/80 border border-wire/80 text-[10px] text-ink-muted truncate max-w-[140px]">
                        {fa.name}
                      </span>
                    {/each}
                    {#if sub.artists.length > 3}
                      <span class="px-1 py-0.5 text-[10px] font-mono text-ink-dim">
                        +{sub.artists.length - 3}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="w-full mt-3.5 pt-2.5 border-t border-wire/60 flex items-center justify-between font-mono text-[10px] text-ink-dim group-hover:text-ink">
                <span>{ratio}% OF SECTOR</span>
                <span class="material-symbols-outlined text-[15px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

    {:else}
      <!-- ============================================== -->
      <!-- LEVEL 3: 藝人卡片全寬矩陣                       -->
      <!-- ============================================== -->
      {#if displayedArtists.length === 0}
        <div class="py-20 flex flex-col items-center justify-center text-center font-mono">
          <span class="material-symbols-outlined text-[36px] text-ink-dim mb-2">grid_off</span>
          <div class="text-sm font-bold text-ink-muted mb-1">{t('matrix_empty_title')}</div>
          <p class="text-xs text-ink-dim max-w-sm mb-4">
            {t('matrix_empty_subgenre')}
          </p>
          <button
            type="button"
            onclick={() => {
              currentLevel = 2;
              scrollToMatrixTop();
            }}
            class="px-3 py-1.5 rounded bg-panel hover:bg-chassis border border-wire hover:border-signal text-xs text-ink-muted hover:text-signal transition-colors cursor-pointer"
          >
            {t('matrix_back_to_subgenres')}
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          {#each displayedArtists as artist (artist.id)}
            {@render artistCard(artist)}
          {/each}
        </div>
      {/if}
    {/if}
  </main>
</div>
