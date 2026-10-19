<script lang="ts">
  import type { AcousticSector, ArtistEntry } from '$lib/types/artist';
  import { ACOUSTIC_SECTORS } from '$lib/constants/sectors';
  import {
    buildMatrixHierarchy,
    type MatrixSortMode,
    type MatrixSectorGroup
  } from '$lib/utils/matrixGrouping';

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId?: string | null;
    onselectArtist?: (id: string) => void;
    onopenInCrate?: (id: string) => void;
    onlocateInGalaxy?: (id: string) => void;
    ondeleteArtist?: (id: string) => void;
    onanalyzeArtist?: (artist: ArtistEntry) => void;
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
    isAnalyzing = false
  }: Props = $props();

  // 搜尋與排序狀態
  let searchQuery = $state('');
  let sortMode = $state<MatrixSortMode>('rating');

  // 階層下鑽狀態：Level 1 (大分類) 與 Level 2 (子分類)
  let activeSectorId = $state<AcousticSector | 'INBOX'>('ROCK');
  let activeSubGenreName = $state<string>('__ALL__');

  // 計算階層式分組
  const hierarchy = $derived(buildMatrixHierarchy(artists, searchQuery, sortMode));

  // 當前選取的大分類物件
  const currentSector = $derived<MatrixSectorGroup>(
    hierarchy.sectors.find((s) => s.id === activeSectorId) ||
      hierarchy.sectors[0] || {
        id: 'ROCK',
        name: 'Rock & Post-Rock',
        nameTw: '搖滾與後搖',
        colorHex: '#f59e0b',
        description: '',
        count: 0,
        subGenres: []
      }
  );

  // 當前子分類所過濾出的藝人列表
  const displayedArtists = $derived.by<ArtistEntry[]>(() => {
    if (!currentSector) return [];
    if (activeSubGenreName === '__ALL__') {
      // 合併該大分類下所有子分類藝人
      const set = new Map<string, ArtistEntry>();
      for (const sub of currentSector.subGenres) {
        for (const a of sub.artists) {
          set.set(a.id, a);
        }
      }
      return Array.from(set.values());
    } else {
      const targetSub = currentSector.subGenres.find((s) => s.name === activeSubGenreName);
      return targetSub ? targetSub.artists : [];
    }
  });

  // 如果當前扇區無藝人但其他扇區有，且 activeSectorId 不在現有扇區中時進行平滑修正
  $effect(() => {
    if (hierarchy.sectors.length > 0) {
      const exists = hierarchy.sectors.some((s) => s.id === activeSectorId);
      if (!exists) {
        activeSectorId = hierarchy.sectors[0].id;
        activeSubGenreName = '__ALL__';
      }
    }
  });

  // 切換大分類時，自動重設子流派為全部
  function handleSelectSector(sectorId: AcousticSector | 'INBOX') {
    activeSectorId = sectorId;
    activeSubGenreName = '__ALL__';
  }

  // 切換子分類
  function handleSelectSubGenre(subName: string) {
    activeSubGenreName = subName;
  }

  // 點擊藝人卡片
  function handleCardClick(artist: ArtistEntry) {
    selectedArtistId = artist.id;
    onselectArtist?.(artist.id);
  }

  // 取得 Apple Music 搜尋連結
  function getAppleMusicUrl(artist: ArtistEntry): string {
    if (artist.appleMusicUrl && artist.appleMusicUrl.trim()) {
      return artist.appleMusicUrl;
    }
    const query = artist.name;
    return `https://music.apple.com/tw/search?term=${encodeURIComponent(query)}`;
  }
</script>

<div class="flex flex-col h-[calc(100vh-130px)] min-h-[640px] bg-void border border-wire rounded-[4px] overflow-hidden select-none font-sans">
  <!-- 頂部控制與聲學指標儀表板 (Matrix HUD Toolbar) -->
  <header class="flex-none bg-chassis border-b border-wire px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <!-- 左側：視圖識別銘牌 -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-signal shadow-[0_0_8px_rgba(255,42,60,0.8)] animate-pulse"></span>
        <span class="font-mono text-xs font-bold text-ink tracking-wider">03_風格矩陣</span>
      </div>
      <span class="text-wire-bright">/</span>
      <span class="font-mono text-[11px] text-ink-muted uppercase tracking-widest hidden sm:inline">
        HIERARCHICAL ACOUSTIC EXPLORER
      </span>
    </div>

    <!-- 中間：即時統計指標 (Telemetry Stats) -->
    <div class="flex items-center gap-3 font-mono text-[10px] text-ink-dim">
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
      <!-- 關鍵字搜尋 -->
      <div class="relative">
        <span class="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-ink-dim">search</span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="搜尋風格/藝人/標籤..."
          class="w-40 sm:w-52 pl-7 pr-7 py-1 text-xs bg-panel border border-wire rounded text-ink placeholder:text-ink-dim focus:outline-none focus:border-wire-bright focus:ring-1 focus:ring-signal font-mono transition-all"
        />
        {#if searchQuery}
          <button
            type="button"
            onclick={() => (searchQuery = '')}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink text-xs"
            aria-label="Clear search"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- 排序選單 -->
      <select
        bind:value={sortMode}
        class="bg-panel border border-wire rounded px-2 py-1 text-xs font-mono text-ink-muted hover:text-ink focus:outline-none focus:border-wire-bright cursor-pointer"
        aria-label="排序依據"
      >
        <option value="rating">★ 評分優先</option>
        <option value="dr">DR 動態優先</option>
        <option value="recent">最近新增</option>
        <option value="name">字首排序</option>
      </select>
    </div>
  </header>

  <!-- 核心階層下鑽視圖 (3-Column Cascading Workspace) -->
  <div class="flex-1 flex overflow-hidden">
    <!-- ========================================== -->
    <!-- COLUMN 1: 大分類 (Level 1: 8 軸扇區 + INBOX) -->
    <!-- ========================================== -->
    <aside class="w-56 sm:w-64 flex-none border-r border-wire bg-chassis/80 flex flex-col overflow-y-auto">
      <div class="p-3 border-b border-wire flex items-center justify-between">
        <div class="font-mono text-[10px] text-ink-muted uppercase tracking-wider flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px] text-signal">pie_chart</span>
          <span>LEVEL 1 // 大分類</span>
        </div>
        <span class="text-[9px] font-mono text-ink-dim">8-SECTORS</span>
      </div>

      <div class="p-2 space-y-1 flex-1 overflow-y-auto">
        {#each hierarchy.sectors as sector (sector.id)}
          {@const isActive = activeSectorId === sector.id}
          <button
            type="button"
            onclick={() => handleSelectSector(sector.id)}
            class="w-full text-left p-2.5 rounded transition-all group relative flex items-center justify-between border {isActive
              ? 'bg-panel border-wire-bright text-ink shadow-[inset_2px_0_0_0]'
              : 'border-transparent text-ink-muted hover:text-ink hover:bg-panel/40'}"
            style={isActive ? `--tw-shadow-color: ${sector.colorHex}` : ''}
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- 扇區發光色彩指示點 -->
              <span
                class="w-2 h-2 rounded-full flex-none transition-transform group-hover:scale-125"
                style="background-color: {sector.colorHex}; box-shadow: {isActive ? `0 0 8px ${sector.colorHex}` : 'none'};"
              ></span>

              <div class="truncate">
                <div class="text-xs font-bold truncate flex items-center gap-1.5">
                  <span class="{isActive ? 'text-ink' : 'text-ink-muted group-hover:text-ink'}">{sector.nameTw}</span>
                </div>
                <div class="font-mono text-[9px] text-ink-dim truncate uppercase tracking-tight">
                  {sector.name}
                </div>
              </div>
            </div>

            <!-- 藝人數量徽章 -->
            <span
              class="font-mono text-[10px] px-1.5 py-0.5 rounded flex-none {isActive
                ? 'bg-void text-ink font-bold border border-wire'
                : 'text-ink-dim group-hover:text-ink-muted'}"
            >
              {sector.count}
            </span>
          </button>
        {/each}
      </div>

      <!-- 底部扇區聲學說明 -->
      <div class="p-3 border-t border-wire bg-void/60 text-[10px] text-ink-dim font-mono leading-relaxed">
        <div class="text-ink-muted font-bold mb-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px] text-primary">info</span>
          <span>扇區定位</span>
        </div>
        <p class="text-[9px] line-clamp-3">
          {currentSector.description || '請選擇一個大分類以展開其子流派體系。'}
        </p>
      </div>
    </aside>

    <!-- ========================================== -->
    <!-- COLUMN 2: 子分類 (Level 2: AI 解剖子流派)   -->
    <!-- ========================================== -->
    <section class="w-52 sm:w-60 flex-none border-r border-wire bg-panel/30 flex flex-col overflow-y-auto">
      <div class="p-3 border-b border-wire flex items-center justify-between">
        <div class="font-mono text-[10px] text-ink-muted uppercase tracking-wider flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px] text-primary">category</span>
          <span>LEVEL 2 // 子分類</span>
        </div>
        <span class="text-[9px] font-mono text-ink-dim">{currentSector.subGenres.length} 流派</span>
      </div>

      <!-- 子分類清單 -->
      <div class="p-2 space-y-1 flex-1 overflow-y-auto">
        <!-- 全部子流派選項 -->
        <button
          type="button"
          onclick={() => handleSelectSubGenre('__ALL__')}
          class="w-full text-left px-2.5 py-2 rounded text-xs transition-all flex items-center justify-between border {activeSubGenreName === '__ALL__'
            ? 'bg-chassis border-wire-bright text-ink font-bold'
            : 'border-transparent text-ink-muted hover:text-ink hover:bg-panel/60'}"
        >
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10px] text-ink-dim">[ALL]</span>
            <span>全部子風格</span>
          </div>
          <span class="font-mono text-[10px] text-ink-dim">
            {currentSector.count}
          </span>
        </button>

        <div class="h-px bg-wire my-1"></div>

        {#if currentSector.subGenres.length === 0}
          <div class="py-8 text-center text-ink-dim font-mono text-[11px] px-3">
            此大分類目前無收錄藝人
          </div>
        {:else}
          {#each currentSector.subGenres as sub (sub.name)}
            {@const isSubActive = activeSubGenreName === sub.name}
            <button
              type="button"
              onclick={() => handleSelectSubGenre(sub.name)}
              class="w-full text-left px-2.5 py-2 rounded text-xs transition-all group flex items-center justify-between border {isSubActive
                ? 'bg-chassis border-wire-bright text-ink font-bold shadow-sm'
                : 'border-transparent text-ink-muted hover:text-ink hover:bg-panel/60'}"
            >
              <span class="truncate pr-1 group-hover:translate-x-0.5 transition-transform">
                {sub.name}
              </span>
              <span class="font-mono text-[10px] px-1 py-0.2 rounded flex-none {isSubActive ? 'bg-void text-primary font-bold border border-wire' : 'text-ink-dim'}">
                {sub.count}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </section>

    <!-- ========================================== -->
    <!-- COLUMN 3: 藝人矩陣 (Level 3: 藝人卡片與作品) -->
    <!-- ========================================== -->
    <main class="flex-1 flex flex-col bg-void overflow-y-auto">
      <!-- 導航路徑與快捷資訊 (Breadcrumb Bar) -->
      <div class="flex-none px-4 py-2.5 border-b border-wire bg-chassis/40 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 font-mono text-[11px] truncate">
          <span class="text-ink-dim">MATRIX</span>
          <span class="text-wire-bright">&gt;</span>
          <span class="text-ink font-bold" style="color: {currentSector.colorHex}">
            {currentSector.nameTw}
          </span>
          <span class="text-wire-bright">&gt;</span>
          <span class="text-primary font-bold truncate">
            {activeSubGenreName === '__ALL__' ? '全部子風格' : activeSubGenreName}
          </span>
        </div>

        <div class="font-mono text-[10px] text-ink-muted flex-none">
          找到 <span class="text-ink font-bold">{displayedArtists.length}</span> 位藝人
        </div>
      </div>

      <!-- 藝人卡片網格展示區 -->
      <div class="flex-1 p-4 overflow-y-auto">
        {#if displayedArtists.length === 0}
          <div class="h-64 flex flex-col items-center justify-center text-center font-mono">
            <span class="material-symbols-outlined text-[36px] text-ink-dim mb-2">grid_off</span>
            <div class="text-sm font-bold text-ink-muted mb-1">無符合之藝人記錄</div>
            <p class="text-xs text-ink-dim max-w-sm">
              {#if searchQuery}
                未找到與「{searchQuery}」相符的結果，請嘗試清除關鍵字或切換其他分類。
              {:else}
                此子分類尚未指派藝人。可在左側切換其他子分類或於上方搜尋。
              {/if}
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {#each displayedArtists as artist (artist.id)}
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
                <!-- 卡片頂部：藝人名、別名與狀態標籤 -->
                <div>
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

                  <!-- 聲學指標與星級列 -->
                  <div class="flex flex-wrap items-center gap-2 mb-3 font-mono text-[10px]">
                    <!-- 星級評分 -->
                    {#if artist.rating && artist.rating > 0}
                      <span class="text-amber-400 font-bold tracking-tight">
                        {'★'.repeat(artist.rating)}{'☆'.repeat(Math.max(0, 5 - artist.rating))}
                      </span>
                    {/if}

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
                        <span>深埋寶藏</span>
                      </span>
                    {:else if topAlbum?.tier === 'milestone'}
                      <span class="px-1.5 py-0.2 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[9px] flex items-center gap-0.5">
                        <span class="material-symbols-outlined text-[11px]">foundation</span>
                        <span>時代基石</span>
                      </span>
                    {/if}
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
                  <!-- Apple Music 直通按鈕 -->
                  <a
                    href={getAppleMusicUrl(artist)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick={(e) => e.stopPropagation()}
                    class="px-2 py-1 rounded bg-void hover:bg-panel border border-wire hover:border-wire-bright text-ink-muted hover:text-primary transition-all flex items-center gap-1"
                    title="在 Apple Music 中聆賞"
                  >
                    <span class="material-symbols-outlined text-[13px] text-signal">play_circle</span>
                    <span>試聽</span>
                  </a>

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
                        class="px-2 py-1 rounded bg-signal/20 hover:bg-signal/30 text-signal border border-signal/40 font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                        title="執行 AI 深度解剖"
                      >
                        <span class="material-symbols-outlined text-[12px] {isAnalyzing ? 'animate-spin' : ''}">
                          {isAnalyzing ? 'sync' : 'neurology'}
                        </span>
                        <span>解剖</span>
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
                      class="px-2 py-1 rounded bg-chassis hover:bg-panel border border-wire hover:border-wire-bright text-ink-dim hover:text-ink transition-all flex items-center gap-1"
                      title="前往 01_藝人展間 深究檔案"
                    >
                      <span class="material-symbols-outlined text-[12px]">album</span>
                      <span>展間</span>
                    </button>

                    <!-- 移至星系 -->
                    <button
                      type="button"
                      onclick={(e) => {
                        e.stopPropagation();
                        selectedArtistId = artist.id;
                        onlocateInGalaxy?.(artist.id);
                      }}
                      class="px-2 py-1 rounded bg-chassis hover:bg-panel border border-wire hover:border-wire-bright text-ink-dim hover:text-ink transition-all flex items-center gap-1"
                      title="前往 02_藝人星系 鎖定坐標"
                    >
                      <span class="material-symbols-outlined text-[12px]">hub</span>
                      <span>星系</span>
                    </button>

                    <!-- 刪除 -->
                    {#if ondeleteArtist}
                      <button
                        type="button"
                        onclick={(e) => {
                          e.stopPropagation();
                          if (confirm(`確定要將「${artist.name}」自檔案庫移除嗎？`)) {
                            ondeleteArtist(artist.id);
                          }
                        }}
                        class="p-1 rounded text-ink-dim hover:text-signal hover:bg-signal/10 transition-all"
                        title="移除藝人"
                        aria-label="移除藝人"
                      >
                        <span class="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>
