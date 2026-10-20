<script lang="ts">
  import type { ArtistEntry, NotableAlbum } from '$lib/types/artist';
  import { t } from '$lib/i18n/index.svelte';
  import {
    Music,
    Sparkles,
    Trash2,
    ArrowUpRight,
    Disc3,
    Flame,
    ExternalLink
  } from 'lucide-svelte';
  import { ACOUSTIC_SECTORS } from '$lib/constants/sectors';

  // 聲學腕錶風格 8 軸羅盤幾何參數 (中心 140, 140)
  const DIAL_CENTER = 140;

  // 24 根極細精密刻度（每 15° 一根，8 個 45° 主方位刻度加長）
  const DIAL_TICKS = Array.from({ length: 24 }, (_, i) => {
    const deg = i * 15;
    const rad = ((deg - 90) * Math.PI) / 180;
    const isMajor = deg % 45 === 0;
    const rOuter = 126;
    const rInner = isMajor ? 112 : 119;
    return {
      deg,
      isMajor,
      x1: DIAL_CENTER + rOuter * Math.cos(rad),
      y1: DIAL_CENTER + rOuter * Math.sin(rad),
      x2: DIAL_CENTER + rInner * Math.cos(rad),
      y2: DIAL_CENTER + rInner * Math.sin(rad)
    };
  });

  // 8 個方位主文字標籤 (r = 96)
  const DIAL_SECTORS = [
    { id: 'ROCK', label: 'ROCK', deg: 0, x: 140, y: 46 },
    { id: 'METAL', label: 'METAL', deg: 45, x: 206, y: 74 },
    { id: 'CLASSICAL', label: 'CLASSIC', deg: 90, x: 234, y: 140 },
    { id: 'JAZZ', label: 'JAZZ', deg: 135, x: 206, y: 206 },
    { id: 'AMBIENT', label: 'AMBIENT', deg: 180, x: 140, y: 234 },
    { id: 'ELECTRONIC', label: 'ELECTRO', deg: 225, x: 74, y: 206 },
    { id: 'GROOVE', label: 'GROOVE', deg: 270, x: 46, y: 140 },
    { id: 'WORLD', label: 'WORLD', deg: 315, x: 74, y: 74 }
  ] as const;

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId: string | null;
    onselectArtist: (id: string) => void;
    ondeleteArtist: (id: string) => void;
    onanalyzeArtist: (artist: ArtistEntry) => void;
    onpickupSimilar: (name: string) => void;
    onrecommendMoreSimilar?: (artist: ArtistEntry) => Promise<void> | void;
    onrecommendMoreAlbums?: (artist: ArtistEntry) => Promise<void> | void;
    onaddToQueue?: (artist: ArtistEntry, album?: NotableAlbum) => void;
    isAnalyzing?: boolean;
    isRecommendingMore?: boolean;
    isRecommendingAlbums?: boolean;
  }

  let {
    artists = [],
    selectedArtistId = $bindable(null),
    onselectArtist,
    ondeleteArtist,
    onanalyzeArtist,
    onpickupSimilar,
    onrecommendMoreSimilar,
    onrecommendMoreAlbums,
    onaddToQueue,
    isAnalyzing = false,
    isRecommendingMore = false,
    isRecommendingAlbums = false
  }: Props = $props();

  // 篩選與排序狀態
  let activeFilter = $state<string>('all');
  let sortBy = $state<'recent' | 'cat' | 'dr' | 'audiophile' | 'weight'>('recent');

  // 刪除二次確認計時器狀態
  let deleteConfirmPending = $state(false);
  let deleteCountdown = $state(3);
  let deleteTimer: ReturnType<typeof setInterval> | null = null;

  // 卡片快捷刪除二次確認計時器狀態
  let cardDeleteConfirmId = $state<string | null>(null);
  let cardDeleteCountdown = $state(3);
  let cardDeleteTimer: ReturnType<typeof setInterval> | null = null;

  function resetCardDeleteConfirm() {
    cardDeleteConfirmId = null;
    cardDeleteCountdown = 3;
    if (cardDeleteTimer) {
      clearInterval(cardDeleteTimer);
      cardDeleteTimer = null;
    }
  }

  function handleStartCardDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (cardDeleteConfirmId === id) return;
    resetCardDeleteConfirm();
    cardDeleteConfirmId = id;
    cardDeleteCountdown = 3;
    cardDeleteTimer = setInterval(() => {
      cardDeleteCountdown -= 1;
      if (cardDeleteCountdown <= 0) {
        resetCardDeleteConfirm();
      }
    }, 1000);
  }

  function handleConfirmCardDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    resetCardDeleteConfirm();
    ondeleteArtist(id);
  }

  $effect(() => {
    if (selectedArtistId) {
      resetDeleteConfirm();
      resetCardDeleteConfirm();
    }
    return () => {
      resetDeleteConfirm();
      resetCardDeleteConfirm();
    };
  });

  function resetDeleteConfirm() {
    deleteConfirmPending = false;
    deleteCountdown = 3;
    if (deleteTimer) {
      clearInterval(deleteTimer);
      deleteTimer = null;
    }
  }

  function handleTriggerDelete() {
    if (!selectedArtist) return;
    if (!deleteConfirmPending) {
      deleteConfirmPending = true;
      deleteCountdown = 3;
      deleteTimer = setInterval(() => {
        deleteCountdown -= 1;
        if (deleteCountdown <= 0) {
          resetDeleteConfirm();
        }
      }, 1000);
    } else {
      const idToDelete = selectedArtist.id;
      resetDeleteConfirm();
      ondeleteArtist(idToDelete);
    }
  }

  const selectedArtist = $derived(
    artists.find((a) => a.id === selectedArtistId) || artists[0] || null
  );

  // 相似藝人輪播偏移量（當未收錄藝人超過 3 位時支援純前端翻頁）
  let similarOffset = $state(0);
  // 代表專輯輪播偏移量（當收錄專輯超過 2 張時支援純前端翻頁）
  let albumOffset = $state(0);

  $effect(() => {
    if (selectedArtistId) {
      similarOffset = 0;
      albumOffset = 0;
    }
  });

  function handleNextAlbumBatch(totalCount: number) {
    if (totalCount <= 2) return;
    albumOffset = (albumOffset + 2) % totalCount;
  }

  // 本地已收錄藝人字典（比對 name 與 aliases，全轉小寫以避免大小寫重複誤判）
  const collectedNamesMap = $derived.by(() => {
    const map = new Map<string, ArtistEntry>();
    for (const a of artists) {
      map.set(a.name.toLowerCase().trim(), a);
      a.aliases?.forEach((al) => map.set(al.toLowerCase().trim(), a));
    }
    return map;
  });

  // 原始推薦清單去重
  const rawSimilarList = $derived(
    Array.from(new Set(selectedArtist?.analysis?.similarArtists || []))
  );

  // 拆分為「未在庫 (uncollected)」與「已在庫 (collected)」
  const uncollectedSimilar = $derived(
    rawSimilarList.filter((name) => !collectedNamesMap.has(name.toLowerCase().trim()))
  );

  const collectedSimilar = $derived(
    rawSimilarList.filter((name) => collectedNamesMap.has(name.toLowerCase().trim()))
  );

  // 本地換一批輪播切換（純前端分頁，不耗費 AI API Token）
  function handleNextSimilarBatch() {
    if (uncollectedSimilar.length <= 3) return;
    similarOffset = (similarOffset + 3) % uncollectedSimilar.length;
  }

  // 計算最終要呈現在 3 個 Slot 的推薦卡片（優先以未收錄填滿，不足 3 個才由已收錄遞補）
  const displaySimilarSlots = $derived.by(() => {
    const slots: { name: string; isCollected: boolean; existingArtist?: ArtistEntry }[] = [];

    // 若未收錄藝人有資料，以輪播 offset 開始取最多 3 位
    if (uncollectedSimilar.length > 0) {
      for (let i = 0; i < Math.min(3, uncollectedSimilar.length); i++) {
        const idx = (similarOffset + i) % uncollectedSimilar.length;
        slots.push({
          name: uncollectedSimilar[idx],
          isCollected: false
        });
      }
    }

    // 若未收錄不足 3 位，由已收錄清單遞補
    if (slots.length < 3) {
      for (const sim of collectedSimilar) {
        if (slots.length >= 3) break;
        if (!slots.some((s) => s.name.toLowerCase().trim() === sim.toLowerCase().trim())) {
          slots.push({
            name: sim,
            isCollected: true,
            existingArtist: collectedNamesMap.get(sim.toLowerCase().trim())
          });
        }
      }
    }

    return slots;
  });

  // 藝人角色標籤：優先使用 AI 精析的 artistRole，舊資料則退回 entityType
  const roleLabel = $derived(
    selectedArtist?.analysis?.artistRole ||
      (selectedArtist?.entityType ? selectedArtist.entityType.replace('-', ' ').toUpperCase() : '')
  );

  // 當前藝人的 8 軸聲學板塊定義
  const currentSectorDef = $derived(
    selectedArtist?.analysis?.sector ? ACOUSTIC_SECTORS[selectedArtist.analysis.sector] : null
  );

  // 懸停預覽的樂風 ID（滑鼠 hover 錶盤節點或下方標籤時觸發）
  let hoveredSectorId = $state<import('$lib/types/artist').AcousticSector | null>(null);

  // 防抖計時器 (Debounce Timers)
  let enterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let leaveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setHoveredSectorDebounced(sectorId: import('$lib/types/artist').AcousticSector | null) {
    if (enterDebounceTimer) {
      clearTimeout(enterDebounceTimer);
      enterDebounceTimer = null;
    }
    if (leaveDebounceTimer) {
      clearTimeout(leaveDebounceTimer);
      leaveDebounceTimer = null;
    }

    if (sectorId === null) {
      // 滑鼠移開時微延遲 150ms，避免在相鄰樂風之間移動時畫面先閃退回原本藝人
      leaveDebounceTimer = setTimeout(() => {
        hoveredSectorId = null;
        leaveDebounceTimer = null;
      }, 150);
    } else {
      // 滑鼠滑入某個樂風時延遲 110ms，過濾快速劃過的晃動
      enterDebounceTimer = setTimeout(() => {
        hoveredSectorId = sectorId;
        enterDebounceTimer = null;
      }, 110);
    }
  }

  function toggleHoverImmediate(sectorId: import('$lib/types/artist').AcousticSector) {
    if (enterDebounceTimer) clearTimeout(enterDebounceTimer);
    if (leaveDebounceTimer) clearTimeout(leaveDebounceTimer);
    hoveredSectorId = hoveredSectorId === sectorId ? null : sectorId;
  }

  // 當前預覽或鎖定的流派定義
  const activeSectorDef = $derived(
    hoveredSectorId ? ACOUSTIC_SECTORS[hoveredSectorId] : currentSectorDef
  );

  // 腕錶指針目標角度（Hover 時平滑轉動至目標方位，移開時彈回藝人方位）
  const needleBearing = $derived(activeSectorDef ? activeSectorDef.angleDeg : 0);

  // 待解剖收件匣計數
  const inboxCount = $derived(artists.filter((a) => a.status === 'inbox').length);

  // 計算流派分布計數
  const genreCounts = $derived({
    math: artists.filter((a) => a.analysis?.genres.some((g) => /math|instrumental/i.test(g))).length,
    jazz: artists.filter((a) => a.analysis?.genres.some((g) => /jazz|modal/i.test(g))).length,
    ambient: artists.filter((a) => a.analysis?.genres.some((g) => /ambient|folk|drone/i.test(g))).length
  });

  // 篩選與排序邏輯
  const processedArtists = $derived(
    artists
      .filter((a) => {
        if (activeFilter === 'inbox') return a.status === 'inbox';
        if (activeFilter === 'math') return a.analysis?.genres.some((g) => /math|instrumental/i.test(g));
        if (activeFilter === 'jazz') return a.analysis?.genres.some((g) => /jazz|modal/i.test(g));
        if (activeFilter === 'ambient') return a.analysis?.genres.some((g) => /ambient|folk|drone/i.test(g));
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'weight') return (b.weight ?? 20) - (a.weight ?? 20);
        if (sortBy === 'dr') return (b.dynamicRange || 0) - (a.dynamicRange || 0);
        if (sortBy === 'cat') return (a.catalogNumber || '').localeCompare(b.catalogNumber || '');
        if (sortBy === 'audiophile') {
          const rank = { Reference: 3, 'Hi-Res Lossless': 2, Standard: 1, undefined: 0 };
          return (rank[b.audiophileGrade || 'Standard'] || 0) - (rank[a.audiophileGrade || 'Standard'] || 0);
        }
        return b.updatedAt - a.updatedAt;
      })
  );

  const DEFAULT_COVER = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80';

  function getSafeCover(url?: string): string {
    if (!url || url.includes('lh3.googleusercontent.com')) {
      return DEFAULT_COVER;
    }
    return url;
  }

  // 舞台聚光燈與氛圍光暈運算 (Stage Aura Calculation)
  function getStageAuraStyle(sector?: string, isHighlighted: boolean = false) {
    const s = sector?.toUpperCase() || '';
    if (s === 'ROCK' || s === 'METAL') {
      return {
        auraGlow: isHighlighted ? 'rgba(255, 42, 60, 0.4)' : 'rgba(255, 42, 60, 0.18)',
        spotlight: isHighlighted ? 'rgba(255, 42, 60, 0.25)' : 'rgba(255, 42, 60, 0.08)',
        accentColor: '#ff2a3c',
        stageSector: 'ROCK / METAL STAGE'
      };
    }
    if (s === 'JAZZ' || s === 'GROOVE') {
      return {
        auraGlow: isHighlighted ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.18)',
        spotlight: isHighlighted ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.08)',
        accentColor: '#f59e0b',
        stageSector: 'JAZZ & GROOVE CLUB'
      };
    }
    if (s === 'AMBIENT' || s === 'CLASSICAL') {
      return {
        auraGlow: isHighlighted ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.18)',
        spotlight: isHighlighted ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.08)',
        accentColor: '#38bdf8',
        stageSector: 'ACOUSTIC HALL'
      };
    }
    if (s === 'ELECTRONIC') {
      return {
        auraGlow: isHighlighted ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.18)',
        spotlight: isHighlighted ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.08)',
        accentColor: '#a855f7',
        stageSector: 'MODULAR SYNTH LAB'
      };
    }
    return {
      auraGlow: isHighlighted ? 'rgba(255, 42, 60, 0.35)' : 'rgba(255, 42, 60, 0.12)',
      spotlight: isHighlighted ? 'rgba(255, 42, 60, 0.2)' : 'rgba(255, 42, 60, 0.06)',
      accentColor: '#ff2a3c',
      stageSector: 'SOUNDSTAGE'
    };
  }

  function handleImageError(e: Event) {
    const el = e.currentTarget as HTMLImageElement;
    if (el && el.src !== DEFAULT_COVER) {
      el.src = DEFAULT_COVER;
    }
  }
</script>

<div class="flex flex-col w-full text-ink select-none font-sans">
  <!-- 頂部次級濾鏡尺規列 (Filter Matrix Bar) -->
  <div class="bg-chassis/80 border-b border-wire px-4 sm:px-6 py-2.5 mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-3 font-mono">
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
      <span class="text-[9px] text-ink-dim uppercase tracking-widest mr-2 shrink-0">FILTER_BUS //</span>

      <button
        type="button"
        onclick={() => (activeFilter = activeFilter === 'inbox' ? 'all' : 'inbox')}
        class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] shrink-0 cursor-pointer transition-colors {activeFilter === 'inbox' ? 'border border-signal bg-signal-dim text-signal font-bold' : 'border border-wire bg-void text-ink-muted hover:border-ink hover:text-ink'}"
      >
        <span class="w-1.5 h-1.5 bg-signal"></span>
        <span>INBOX_待解剖 [{inboxCount}]</span>
      </button>

      <button
        type="button"
        onclick={() => (activeFilter = 'all')}
        class="flex items-center gap-1.5 px-3 py-1 text-[11px] shrink-0 cursor-pointer transition-colors {activeFilter === 'all' ? 'border border-ink bg-ink text-void font-bold' : 'border border-wire bg-void text-ink-muted hover:border-ink hover:text-ink'}"
      >
        <span class="material-symbols-outlined text-[14px]">album</span>
        <span>ALL_RECORDS [{artists.length}]</span>
      </button>

      <button
        type="button"
        onclick={() => (activeFilter = activeFilter === 'math' ? 'all' : 'math')}
        class="flex items-center gap-1.5 px-3 py-1 text-[11px] shrink-0 cursor-pointer transition-colors {activeFilter === 'math' ? 'border border-ink bg-ink text-void font-bold' : 'border border-wire bg-void text-ink-muted hover:border-ink hover:text-ink'}"
      >
        <span class="material-symbols-outlined text-[14px]">grain</span>
        <span>MATH_ROCK & INST [{genreCounts.math}]</span>
      </button>

      <button
        type="button"
        onclick={() => (activeFilter = activeFilter === 'jazz' ? 'all' : 'jazz')}
        class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] shrink-0 cursor-pointer transition-colors {activeFilter === 'jazz' ? 'border border-ink bg-ink text-void font-bold' : 'border border-wire bg-void text-ink-muted hover:border-ink hover:text-ink'}"
      >
        <span>JAZZ_MODAL [{genreCounts.jazz}]</span>
      </button>

      <button
        type="button"
        onclick={() => (activeFilter = activeFilter === 'ambient' ? 'all' : 'ambient')}
        class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] shrink-0 cursor-pointer transition-colors {activeFilter === 'ambient' ? 'border border-ink bg-ink text-void font-bold' : 'border border-wire bg-void text-ink-muted hover:border-ink hover:text-ink'}"
      >
        <span>AMBIENT_FOLK [{genreCounts.ambient}]</span>
      </button>
    </div>

    <!-- 排序選單 -->
    <div class="flex items-center gap-3 shrink-0 text-[10px] self-end xl:self-auto">
      <div class="flex items-center gap-2 bg-void border border-wire px-2.5 py-1">
        <span class="text-ink-dim">SORT_BY:</span>
        <select
          bind:value={sortBy}
          class="bg-transparent text-ink font-mono text-[10px] focus:outline-none cursor-pointer uppercase"
        >
          <option value="recent">RECENT_PLAY 最近聆聽</option>
          <option value="weight">GRAVITY_WEIGHT 引力權重 (1-100)</option>
          <option value="cat">CAT# 矩陣刻號</option>
          <option value="dr">DYNAMIC_RANGE 動態值</option>
          <option value="audiophile">AUDIOPHILE 發燒等級</option>
        </select>
      </div>
    </div>
  </div>

  <!-- 主工作區：裸露網格黑膠櫃 + 右側透明硬體解剖艙 -->
  <div class="flex-1 flex flex-col 2xl:flex-row items-start gap-6">

    <!-- 左側：裸露網格黑膠櫃 (Exposed Grid Crate) -->
    <main class="flex-1 w-full">
      <!-- 採用 1px 裸露網格線連接所有單元 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-wire gap-px border border-wire">
        {#each processedArtists as artist (artist.id)}
          {@const isActive = selectedArtistId === artist.id}
          {@const aura = getStageAuraStyle(artist.analysis?.sector, isActive)}
          <div
            role="button"
            tabindex="0"
            onclick={() => onselectArtist(artist.id)}
            onkeydown={(e) => e.key === 'Enter' && onselectArtist(artist.id)}
            class="group relative p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 {isActive ? 'bg-[#101218] ring-1 ring-inset ring-signal bg-micro-grid shadow-[0_0_24px_rgba(255,42,60,0.2)]' : 'bg-void hover:bg-[#0d0e14]'}"
          >
            <!-- 頂部微距數據列：最左上角顯示時代印記 (取代無意義的 STAGE-XXX)，右側呈現 AI_PARSED -->
            <div class="flex items-center justify-between font-mono text-[10px] pb-3 border-b border-wire border-dashed">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0 {isActive ? 'animate-pulse' : 'bg-ink-dim'}" style="{isActive ? `background-color: ${aura.accentColor}` : ''}"></span>
                <span class="truncate {isActive ? 'text-ink font-bold tracking-wider' : 'text-ink-muted'}">
                  {artist.analysis?.era || (artist.status === 'inbox' ? 'AWAITING_SCAN' : 'CONTEMPORARY')}
                </span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                {#if cardDeleteConfirmId === artist.id}
                  <!-- 二次防誤觸確認按鈕：點擊第一次後變紅並顯示 3 秒倒數 -->
                  <button
                    type="button"
                    onclick={(e) => handleConfirmCardDelete(e, artist.id)}
                    class="px-1.5 py-0.5 bg-signal text-white font-mono text-[9px] font-bold rounded-[2px] animate-pulse flex items-center gap-1 shadow-[0_0_8px_rgba(255,42,60,0.6)] cursor-pointer z-10"
                    title="再次點擊以確認自展間移除此藝人"
                  >
                    <span>⚠️ 確認? ({cardDeleteCountdown}s)</span>
                  </button>
                {:else}
                  {#if artist.status === 'analyzed' || artist.analysis}
                    <span class="px-1.5 py-0.5 bg-signal-dim border border-signal/40 text-signal font-mono text-[9px] uppercase tracking-wider shrink-0">
                      AI_PARSED
                    </span>
                  {/if}
                  <!-- 平時懸停 (Hover) 時顯現的微型刪除圖示，支援防誤觸阻止冒泡 -->
                  <button
                    type="button"
                    onclick={(e) => handleStartCardDelete(e, artist.id)}
                    title={`從展間移除 ${artist.name}`}
                    class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-ink-dim hover:text-signal transition-all cursor-pointer rounded-[2px] hover:bg-signal-dim/40 z-10"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                {/if}
              </div>
            </div>

            <!-- 舞台聚光艙與氛圍光暈結構 (Stage Aura & Spotlight Viewport) -->
            <div class="relative w-full aspect-square my-3 bg-[#07080c] border border-wire group-hover:border-wire-bright overflow-hidden rounded-[2px] transition-all duration-500 shadow-inner">
              <!-- 1. 後景舞台光暈擴散層 (Stage Halo Glow) -->
              <div
                class="absolute inset-0 pointer-events-none transition-all duration-700 ease-out group-hover:scale-110"
                style="background: radial-gradient(circle at 50% 45%, {aura.auraGlow} 0%, transparent 75%);"
              ></div>

              <!-- 2. 舞台頂部聚光光錐 (Stage Overhead Spotlight Cone) -->
              <div
                class="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-60 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity duration-500"
                style="background: conic-gradient(from 150deg at 50% 0%, transparent 0deg, {aura.spotlight} 30deg, transparent 60deg);"
              ></div>

              <!-- 3. 藝人舞台肖像主體 (Stage Artist Subject - 預設黑白，Hover 或選中綻放彩色) -->
              <div class="relative z-0 w-full h-full overflow-hidden flex items-center justify-center">
                <img
                  src={getSafeCover(artist.coverImage)}
                  alt={artist.name}
                  onerror={handleImageError}
                  class="w-full h-full object-cover object-top contrast-125 transition-all duration-500 {isActive ? 'grayscale-0 brightness-100' : 'grayscale brightness-90'} group-hover:grayscale-0 group-hover:brightness-105 group-hover:scale-105"
                />
                <!-- 底部舞台暗場漸層 (Stage Floor Shadow) -->
                <div class="absolute inset-0 bg-gradient-to-t from-[#07080c] via-[#07080c]/35 to-transparent"></div>
              </div>

              <!-- 底部藝人舞台焦點 (Bottom Artist Stage Typography - 僅保留子流派與藝人名稱，圖片上方無浮貼標籤) -->
              <div class="absolute bottom-2.5 left-2.5 right-2.5 z-20">
                <div class="flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase mb-0.5">
                  <span style="color: {aura.accentColor}">●</span>
                  <span class="text-ink-dim truncate">{artist.analysis?.subGenre || artist.analysis?.artistRole || (artist.status === 'inbox' ? 'AWAITING_SCAN' : 'CONTEMPORARY')}</span>
                </div>
                <h3 class="font-sans text-lg text-ink font-black tracking-tight leading-snug truncate drop-shadow-md">
                  {artist.name}
                </h3>
              </div>
            </div>

            <!-- 底部硬體參數條：整合大分類 (Sector) 與子流派標籤、星系引力權重 (GRAVITY) 與 聆賞日誌 (LOGGED / NO_LOG) -->
            <div class="pt-2 border-t border-wire flex flex-col gap-2 font-mono">
              <div class="flex flex-wrap gap-1">
                {#if artist.analysis?.sector}
                  <!-- 大分類標章 (Primary Sector)：整合至下方首位，突顯星系大板塊 -->
                  <span class="px-1.5 py-0.5 bg-wire-bright/50 border border-wire-bright text-ink font-bold text-[9px] uppercase tracking-wider">
                    {artist.analysis.sector}
                  </span>
                {/if}
                {#if artist.analysis?.genres && artist.analysis.genres.length > 0}
                  {#each artist.analysis.genres.filter(g => g.toUpperCase() !== artist.analysis?.sector).slice(0, 2) as g}
                    <span class="px-1.5 py-0.5 bg-void border border-wire text-ink-muted text-[9px]">
                      {g.toUpperCase()}
                    </span>
                  {/each}
                {:else if !artist.analysis?.sector}
                  <span class="px-1.5 py-0.5 bg-amber-950/20 border border-amber-500/30 text-amber-400 text-[9px]">
                    AWAITING_ANALYZE
                  </span>
                {/if}
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-ink-dim truncate">
                  GRAVITY: <span class="text-ink font-bold">W-{artist.weight || 20}</span>
                </span>
                {#if artist.personalNotes && artist.personalNotes.trim().length > 0}
                  <span class="text-signal font-bold flex items-center gap-1 text-[9px]">
                    <span class="w-1.5 h-1.5 rounded-full bg-signal"></span>
                    LOGGED{#if artist.rating} [{artist.rating}★]{/if}
                  </span>
                {:else}
                  <span class="text-ink-dim text-[9px]">NO_LOG</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </main>

    <!-- 右側：整合式透明硬體解剖艙 (Unified Cyber-Hardware Dossier & Telemetry) -->
    <aside class="w-full 2xl:w-[460px] shrink-0 bg-chassis/95 backdrop-blur-xl border border-wire 2xl:border-l 2xl:border-t-0 2xl:border-r-0 2xl:border-b-0 flex flex-col justify-between sticky top-20">
      {#if selectedArtist}
        <div class="p-5 flex flex-col gap-5">

          <!-- 艙門頂部狀態列：發跡時空 ✕ 音樂史定位 ✕ 編制與風格 (去識別化預設值) -->
          <div class="flex items-center justify-between border-b border-wire pb-3 font-mono">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-signal"></span>
              <span class="font-dot text-xs tracking-[0.15em] text-ink uppercase">
                {selectedArtist.originLocation || (selectedArtist.countryCode ? `${selectedArtist.countryCode}_ARCHIVE` : 'ORIGIN_RAW')} // #{selectedArtist.formedYear || (selectedArtist.id ? selectedArtist.id.slice(0, 4).toUpperCase() : '0000')}
              </span>
              <span class="px-1.5 py-0.5 border border-wire bg-void text-ink-muted text-[9px] uppercase tracking-wider">
                {selectedArtist.canonTier || (selectedArtist.status === 'inbox' ? 'UNCLASSIFIED' : 'STUDIO_TIER')}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[9px] text-ink-dim uppercase tracking-wider">
                {selectedArtist.formation || 'ROSTER_RAW'} // {selectedArtist.analysis?.subGenre ? selectedArtist.analysis.subGenre.replace(/\s+/g, '_') : 'UNMAPPED'}
              </span>
            </div>
          </div>

          <!-- 藝人主視覺與即時頻譜整合模組 -->
          <div class="crosshair-box border border-wire bg-void p-4">
            <div class="flex gap-4 items-start">
              <div class="w-24 h-24 border border-wire-bright shrink-0 relative overflow-hidden bg-panel">
                <img
                  src={getSafeCover(selectedArtist.coverImage)}
                  alt={selectedArtist.name}
                  onerror={handleImageError}
                  class="w-full h-full object-cover grayscale contrast-125 hover:grayscale-0 transition-all duration-300"
                />
                <div class="absolute bottom-0 right-0 bg-signal text-white font-mono text-[8px] px-1">
                  {selectedArtist.countryCode || 'RAW'}
                </div>
              </div>
              <div class="flex-1 font-mono min-w-0">
                <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span class="px-1.5 py-0.5 bg-signal text-white text-[9px] font-bold tracking-wider">
                    {selectedArtist.audiophileGrade || 'HI-RES LOSSLESS'}
                  </span>
                  <span class="px-1.5 py-0.5 border border-wire text-ink-muted text-[9px]">
                    {selectedArtist.catalogNumber || 'CAT# PUA-RAW'}
                  </span>
                </div>
                <h2 class="font-serif text-2xl sm:text-3xl text-ink font-black tracking-tight leading-none my-1.5 truncate">
                  {selectedArtist.name}
                </h2>
                <div class="text-[10px] text-ink-muted tracking-wider truncate">
                  {selectedArtist.analysis?.genres ? selectedArtist.analysis.genres.join(' // ') : 'ACOUSTIC ARCHITECTURE'}
                </div>
              </div>
            </div>

            <!-- 藝人核心屬性矩陣 (Artist Identity Matrix)：取代無資訊量的 dBFS 假數據，改顯示 AI 精析的藝人定位 -->
            <div class="mt-4 pt-3 border-t border-wire border-dashed grid grid-cols-3 gap-2 font-mono text-[10px]">
              <div class="bg-chassis p-2 border border-wire min-w-0">
                <span class="text-ink-dim text-[8px] block">SECTOR</span>
                <span class="text-ink font-bold truncate block" title={selectedArtist.analysis?.subGenre}>
                  {selectedArtist.analysis?.sector || 'UNMAPPED'}
                </span>
                {#if selectedArtist.analysis?.subGenre}
                  <span class="text-ink-muted text-[9px] truncate block">{selectedArtist.analysis.subGenre}</span>
                {/if}
              </div>
              <div class="bg-chassis p-2 border border-wire min-w-0">
                <span class="text-ink-dim text-[8px] block">ROLE</span>
                <span class="text-ink font-bold truncate block" title={roleLabel}>
                  {roleLabel || 'AWAITING_SCAN'}
                </span>
                {#if selectedArtist.lineage?.memberRoster && selectedArtist.lineage.memberRoster.length > 0}
                  <span class="text-ink-muted text-[9px] truncate block">{selectedArtist.lineage.memberRoster.length} MEMBERS</span>
                {/if}
              </div>
              <div class="bg-chassis p-2 border border-wire min-w-0">
                <span class="text-ink-dim text-[8px] block">ERA</span>
                <span class="text-ink font-bold truncate block" title={selectedArtist.analysis?.era || 'AWAITING_SCAN'}>
                  {selectedArtist.analysis?.era || (selectedArtist.status === 'inbox' ? 'AWAITING_SCAN' : 'CONTEMPORARY')}
                </span>
                <span class="text-signal text-[9px] truncate block">TIMELINE</span>
              </div>
            </div>

            <!-- AI 美學標籤膠囊列 (Aesthetic Tags) -->
            {#if selectedArtist.analysis?.aestheticTags && selectedArtist.analysis.aestheticTags.length > 0}
              <div class="mt-2 flex flex-wrap gap-1.5 font-mono">
                {#each selectedArtist.analysis.aestheticTags.slice(0, 6) as tag}
                  <span class="px-2 py-0.5 border border-wire bg-chassis text-ink-muted text-[9px] tracking-wider hover:border-signal hover:text-signal transition-colors">
                    #{tag}
                  </span>
                {/each}
              </div>
            {/if}

            <!-- 動作按鈕與 AI 深度解剖核心觸發區 (Action Buttons & AI Ingestion Control) -->
            <div class="mt-3 flex flex-col gap-2 font-mono">
              {#if !selectedArtist.analysis}
                <!-- 未解剖狀態：高醒目度引導 (Hero CTA with Corner-Cut) -->
                <div class="corner-cut border border-signal/40 bg-signal-dim/30 p-3 flex flex-col gap-2 relative overflow-hidden">
                  <div class="flex items-center justify-between text-[10px] text-signal">
                    <span class="flex items-center gap-1.5 font-bold tracking-wider">
                      <span class="w-1.5 h-1.5 rounded-full bg-signal animate-ping"></span>
                      AWAITING_AI_INGESTION // 等待資料解剖
                    </span>
                    <span class="text-[9px] opacity-75">STANDBY</span>
                  </div>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onclick={() => onanalyzeArtist(selectedArtist)}
                    class="corner-cut w-full flex items-center justify-between px-4 py-2.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(255,107,0,0.3)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div class="flex items-center gap-2">
                      <Sparkles class="w-4 h-4 {isAnalyzing ? 'animate-spin text-white' : 'text-white'}" />
                      <span>{isAnalyzing ? 'AI 深度解剖分析中...' : '啟動 AI 深度解剖'}</span>
                    </div>
                    <span class="text-[10px] opacity-90">[GET_DATA ↗]</span>
                  </button>

                  <p class="text-[10px] text-ink-muted leading-relaxed font-sans">
                    點擊以調用 AI 模型分析此藝人之聲學星系定位、風格脈絡與發燒推薦專輯。
                  </p>
                </div>
              {:else}
                <!-- 已解剖狀態：標準動作雙列 (排入隊列 + AI 重新解剖) -->
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onclick={() => onaddToQueue?.(selectedArtist)}
                    class="corner-cut flex items-center justify-center gap-1.5 px-3 py-2 bg-panel hover:bg-signal-dim text-ink-muted hover:text-signal border border-wire font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="將整位藝人加入聆賞隊列"
                  >
                    <span class="material-symbols-outlined text-[14px]">queue_music</span>
                    <span>+ 藝人排入隊列</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onclick={() => onanalyzeArtist(selectedArtist)}
                    class="corner-cut flex items-center justify-center gap-1.5 px-3 py-2 bg-panel hover:bg-signal text-ink hover:text-white border border-wire font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="重新調用 AI 進行深度解剖分析"
                  >
                    <Sparkles class="w-3.5 h-3.5 text-signal" />
                    <span>{isAnalyzing ? 'AI 深度掃描中...' : 'AI 深度解剖'}</span>
                  </button>
                </div>
              {/if}

              <!-- 外部串流觸發器 -->
              {#if selectedArtist.appleMusicUrl}
                <a
                  href={selectedArtist.appleMusicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="corner-cut flex items-center justify-between px-4 py-2 bg-ink hover:bg-signal text-void hover:text-white font-mono text-[11px] font-bold uppercase tracking-widest transition-all"
                >
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[14px]">play_arrow</span>
                    <span>LAUNCH_APPLE_MUSIC_STREAM</span>
                  </div>
                  <span class="text-[10px]">[EXT ↗]</span>
                </a>
              {/if}
            </div>

            <!-- 聲學極簡腕錶指針羅盤 (Acoustic Minimalist Chrono Dial) -->
            <div class="mt-2 bg-chassis border border-wire p-4 flex flex-col gap-3">
              <div class="flex justify-between items-center font-mono text-[9px] text-ink-dim border-b border-wire pb-2">
                <span class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 {hoveredSectorId ? 'bg-amber-400 animate-pulse' : 'bg-signal'}"></span>
                  {#if hoveredSectorId}
                    <span class="text-amber-400 font-bold">PREVIEWING // {activeSectorDef?.id}</span>
                  {:else}
                    <span>CHRONOMETER_LATTICE // 8-AXIS DIAL</span>
                  {/if}
                </span>
                <span class="flex items-center gap-1 font-bold" style="color: {activeSectorDef?.colorHex || '#52565E'};">
                  {#if activeSectorDef}
                    <span class="w-1.5 h-1.5 rounded-full {hoveredSectorId ? 'animate-bounce' : 'animate-ping'}" style="background-color: {activeSectorDef.colorHex};"></span>
                    <span>{activeSectorDef.id}_{hoveredSectorId ? 'PREVIEW' : 'LOCK'}</span>
                  {:else}
                    <span class="w-1.5 h-1.5 rounded-full bg-ink-dim animate-pulse"></span>
                    <span class="text-ink-dim">STANDBY</span>
                  {/if}
                </span>
              </div>

              <!-- 大尺寸手錶風格錶盤本體 (Watch Dial Canvas) -->
              <div class="flex flex-col items-center justify-center py-2 bg-void border border-wire/60 relative overflow-hidden">
                <div class="w-64 h-64 sm:w-72 sm:h-72 relative flex items-center justify-center">
                  <svg viewBox="0 0 280 280" class="w-full h-full select-none" xmlns="http://www.w3.org/2000/svg">
                    <!-- 錶殼外圓圈與細金屬邊環 (Watch Bezel) -->
                    <circle cx="140" cy="140" r="136" fill="#07080A" stroke="#252A33" stroke-width="1.2" />
                    <circle cx="140" cy="140" r="134" fill="none" stroke="#1F2228" stroke-width="0.6" />

                    <!-- 內圈八邊形蜂巢幾何底紋 (Architectural Octagonal Web) -->
                    <polygon
                      points="140,80 182.4,97.6 200,140 182.4,182.4 140,200 97.6,182.4 80,140 97.6,97.6"
                      fill="none"
                      stroke="#181B22"
                      stroke-width="0.8"
                    />
                    <polygon
                      points="140,98 169.7,110.3 182,140 169.7,169.7 140,182 110.3,169.7 98,140 110.3,110.3"
                      fill="none"
                      stroke="#14161C"
                      stroke-width="0.6"
                      stroke-dasharray="2 3"
                    />

                    <!-- 同心輔助刻度環 (Chapter Rings) -->
                    <circle cx="140" cy="140" r="126" fill="none" stroke="#252A33" stroke-width="0.5" />
                    <circle cx="140" cy="140" r="60" fill="none" stroke="#181B22" stroke-width="0.5" stroke-dasharray="1 2" />

                    <!-- 極簡 24 根腕錶刻度線 (Watch Dial Tick Marks) -->
                    {#each DIAL_TICKS as tick}
                      {@const isCurrentTarget = activeSectorDef?.angleDeg === tick.deg}
                      <line
                        x1={tick.x1}
                        y1={tick.y1}
                        x2={tick.x2}
                        y2={tick.y2}
                        stroke={isCurrentTarget ? (activeSectorDef?.colorHex || '#FEC486') : tick.isMajor ? '#3B404D' : '#1F2228'}
                        stroke-width={tick.isMajor ? (isCurrentTarget ? 2 : 1.2) : 0.8}
                        stroke-linecap="round"
                        class="transition-colors duration-200"
                      />
                    {/each}

                    <!-- 8 個方位主流派標籤文字與放大感應熱區 (Interactive Hour Marker Hits) -->
                    {#each DIAL_SECTORS as sector}
                      {@const isCurrentArtistSector = selectedArtist.analysis?.sector === sector.id}
                      {@const isHovered = hoveredSectorId === sector.id}
                      {@const isHighlighted = isHovered || (!hoveredSectorId && isCurrentArtistSector)}
                      {@const color = ACOUSTIC_SECTORS[sector.id]?.colorHex || '#52565E'}
                      
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <g
                        role="button"
                        tabindex="0"
                        class="cursor-pointer group select-none focus:outline-none"
                        onmouseenter={() => setHoveredSectorDebounced(sector.id)}
                        onmouseleave={() => setHoveredSectorDebounced(null)}
                        onclick={() => toggleHoverImmediate(sector.id)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleHoverImmediate(sector.id);
                          }
                        }}
                      >
                        <!-- 擴大感應熱區 (Hitbox) -->
                        <circle cx={sector.x} cy={sector.y} r="20" fill="transparent" />

                        <!-- 懸停時底層光環 -->
                        {#if isHighlighted}
                          <circle
                            cx={sector.x}
                            cy={sector.y}
                            r="15"
                            fill={color}
                            opacity={isHovered ? "0.22" : "0.12"}
                            class="transition-opacity duration-200"
                          />
                        {/if}

                        <!-- 主標籤文字 (Hover 時變大加粗) -->
                        <text
                          x={sector.x}
                          y={sector.y}
                          text-anchor="middle"
                          dominant-baseline="central"
                          font-family="monospace"
                          font-size={isHighlighted ? '9.5' : '8'}
                          font-weight={isHighlighted ? 'bold' : 'normal'}
                          letter-spacing="0.08em"
                          fill={isHighlighted ? color : '#52565E'}
                          class="transition-all duration-150"
                        >
                          {sector.label}
                        </text>
                      </g>
                    {/each}

                    <!-- 12 點鐘方向銘刻極簡文字 (Watch Dial Minimalist Lettering) -->
                    <text
                      x="140"
                      y="78"
                      text-anchor="middle"
                      font-family="monospace"
                      font-size="7"
                      letter-spacing="0.22em"
                      fill="#8E9298"
                      font-weight="bold"
                    >
                      ACOUSTIC AZIMUTH
                    </text>
                    <text
                      x="140"
                      y="87"
                      text-anchor="middle"
                      font-family="monospace"
                      font-size="5.5"
                      letter-spacing="0.16em"
                      fill="#404552"
                    >
                      CHRONOMETER // 8-AXIS
                    </text>

                    <!-- 6 點鐘方向極簡度數副錶盤 (Sub-dial) -->
                    <g>
                      <circle cx="140" cy="178" r="16" fill="#0A0B0E" stroke="#1F2228" stroke-width="0.8" />
                      <circle cx="140" cy="178" r="13" fill="none" stroke="#181B22" stroke-width="0.5" stroke-dasharray="1 2" />
                      <text
                        x="140"
                        y="176"
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-family="monospace"
                        font-size="8.5"
                        font-weight="bold"
                        fill={activeSectorDef ? (activeSectorDef.colorHex || '#FEC486') : '#52565E'}
                      >
                        {activeSectorDef ? `${activeSectorDef.angleDeg}°` : '---'}
                      </text>
                      <text
                        x="140"
                        y="186"
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-family="monospace"
                        font-size="5"
                        fill="#52565E"
                        letter-spacing="0.1em"
                      >
                        {hoveredSectorId ? 'PREVIEW' : 'BEARING'}
                      </text>
                    </g>

                    <!-- 極簡指針 (Precision Watch Needle) -->
                    <g style="transform: rotate({needleBearing}deg); transform-origin: 140px 140px; transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);">
                      <!-- 針身本體 (纖細俐落) -->
                      <line
                        x1="140"
                        y1="140"
                        x2="140"
                        y2="28"
                        stroke={activeSectorDef ? (activeSectorDef.colorHex || '#FEC486') : '#52565E'}
                        stroke-width="1.6"
                        stroke-linecap="round"
                      />
                      <!-- 針尖光芒端點 -->
                      <line
                        x1="140"
                        y1="34"
                        x2="140"
                        y2="24"
                        stroke={activeSectorDef ? (activeSectorDef.colorHex || '#FEC486') : '#8E9298'}
                        stroke-width="2.6"
                        stroke-linecap="round"
                      />
                      {#if activeSectorDef}
                        <circle
                          cx="140"
                          cy="23"
                          r="4"
                          fill={activeSectorDef.colorHex}
                          opacity={hoveredSectorId ? "0.6" : "0.3"}
                          class={hoveredSectorId ? "animate-pulse" : ""}
                        />
                      {/if}

                      <!-- 針尾經典鏤空圓形配重塊 (Watch Counterweight) -->
                      <line
                        x1="140"
                        y1="140"
                        x2="140"
                        y2="158"
                        stroke="#3A3E4A"
                        stroke-width="1.4"
                      />
                      <circle
                        cx="140"
                        cy="158"
                        r="3.5"
                        fill="none"
                        stroke="#52565E"
                        stroke-width="1.2"
                      />
                    </g>

                    <!-- 中心雙層金屬軸承扣 (Watch Pivot Core) -->
                    <circle cx="140" cy="140" r="5.5" fill="#121419" stroke="#3A3E4A" stroke-width="1.2" />
                    <circle cx="140" cy="140" r="2.2" fill={activeSectorDef?.colorHex || '#FEC486'} />
                  </svg>
                </div>
              </div>

              <!-- 8 軸快速檢索膠囊列 (Quick Sector Nav Bar) -->
              <div class="flex items-center justify-between gap-1 py-1 px-1 bg-void border border-wire font-mono overflow-x-auto select-none">
                {#each DIAL_SECTORS as sector}
                  {@const isCurrent = selectedArtist.analysis?.sector === sector.id}
                  {@const isHov = hoveredSectorId === sector.id}
                  {@const color = ACOUSTIC_SECTORS[sector.id]?.colorHex || '#52565E'}
                  <button
                    type="button"
                    onmouseenter={() => setHoveredSectorDebounced(sector.id)}
                    onmouseleave={() => setHoveredSectorDebounced(null)}
                    onclick={() => toggleHoverImmediate(sector.id)}
                    class="px-1.5 py-0.5 text-[8px] transition-all cursor-pointer whitespace-nowrap rounded-[2px] {isHov ? 'bg-ink text-void font-bold shadow-sm' : isCurrent ? 'text-ink font-bold border border-wire' : 'text-ink-dim hover:text-ink hover:bg-panel'}"
                    style={isHov ? `border-color: ${color}; color: ${color}; background-color: #12141A;` : isCurrent ? `color: ${color};` : ''}
                    title={`${sector.label} (${sector.deg}°)`}
                  >
                    {sector.label}
                  </button>
                {/each}
              </div>

              <!-- 深度聲學檔案詳情面板 (High-Readability Sector Dossier Card) -->
              <div class="bg-void p-3.5 border border-wire font-mono flex flex-col gap-2.5 transition-all">
                <!-- 標題與方位角 -->
                <div class="flex items-start justify-between gap-2 border-b border-wire pb-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="w-3 h-3 shrink-0 rounded-none inline-block shadow-sm"
                      style="background-color: {activeSectorDef?.colorHex || '#52565E'};"
                    ></span>
                    <div>
                      <div class="text-sm font-bold text-ink leading-tight flex items-center gap-2">
                        <span>{activeSectorDef?.nameTw || '等待星系掃描'}</span>
                        <span class="text-[10px] text-ink-dim font-normal">({activeSectorDef?.id || 'STANDBY'})</span>
                      </div>
                      <span class="text-[10px] text-ink-muted block mt-0.5">
                        {activeSectorDef?.name || 'Awaiting Acoustic Analysis'}
                      </span>
                    </div>
                  </div>

                  <div class="flex flex-col items-end shrink-0">
                    <span class="text-[9px] text-ink-dim">AZIMUTH</span>
                    <span class="text-xs font-bold text-signal">
                      {activeSectorDef ? `${activeSectorDef.angleDeg}°` : '---'}
                    </span>
                  </div>
                </div>

                <!-- 完整聲學特徵描述 (清晰大字體不截斷) -->
                <div>
                  <span class="text-[8px] text-ink-dim uppercase tracking-wider block mb-1">ACOUSTIC_PROFILE // 聲學特質</span>
                  <p class="text-xs text-ink-muted leading-relaxed font-sans">
                    {activeSectorDef?.description || '尚未鎖定此藝人的聲學蜂巢坐標，點擊下方「AI 深度音樂學解剖」即可啟動全景分析。'}
                  </p>
                </div>

                <!-- 代表子風格標籤群 (Sub-genre Pillars) -->
                {#if activeSectorDef?.subGenreExamples && activeSectorDef.subGenreExamples.length > 0}
                  <div class="pt-2 border-t border-wire border-dashed">
                    <span class="text-[8px] text-ink-dim uppercase tracking-wider block mb-1.5">PILLAR_SUBGENRES // 代表子流派</span>
                    <div class="flex flex-wrap gap-1">
                      {#each activeSectorDef.subGenreExamples as subG}
                        <span class="text-[9px] px-2 py-0.5 bg-chassis border border-wire text-ink hover:border-signal hover:text-signal transition-colors">
                          #{subG}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- 當前狀態指示條 (Status Footer) -->
                <div class="pt-1 text-[9px] flex items-center justify-between text-ink-dim border-t border-wire/40">
                  {#if hoveredSectorId}
                    <span class="text-amber-400 flex items-center gap-1">
                      <span>● 預覽模式</span>
                      <span class="text-ink-dim">(滑鼠移開後自動返回本藝人坐標)</span>
                    </span>
                  {:else if selectedArtist.analysis?.sector}
                    <span class="text-emerald-400 flex items-center gap-1">
                      <span>✓ 當前藝人所在星系板塊</span>
                      {#if selectedArtist.analysis.subGenre}
                        <span class="text-ink-muted">({selectedArtist.analysis.subGenre})</span>
                      {/if}
                    </span>
                  {:else}
                    <span class="text-ink-dim">● 等待聲學掃描</span>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- AI 音樂脈絡精析 (AI Context Breakdown) -->
          {#if selectedArtist.analysis}
            <div class="border border-wire bg-void/60 p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between border-b border-wire pb-2 font-mono">
                <div class="flex items-center gap-1.5">
                  <span class="text-signal text-xs">■</span>
                  <span class="font-dot text-xs text-ink tracking-wider">AI_HUMANISTIC_DOSSIER [人文脈絡精析]</span>
                </div>
                <span class="text-[9px] text-ink-dim">LLAMA-3.3 // GEMINI</span>
              </div>

              <div class="space-y-3">
                <div class="border-l-2 border-signal pl-3 py-0.5">
                  <span class="font-mono text-[10px] text-signal font-bold tracking-wider block mb-1">01 // ARTIST_ESSENCE [創作哲學與人文脈絡]</span>
                  <p class="text-xs text-ink-muted leading-relaxed">
                    {selectedArtist.analysis.summary}
                  </p>
                </div>
                {#if selectedArtist.analysis.instrumentationNotes}
                  <div class="border-l-2 border-amber-400 pl-3 py-0.5">
                    <span class="font-mono text-[10px] text-amber-400 font-bold tracking-wider block mb-1">02 // LISTENING_FOCUS [演奏特色與曲義精神]</span>
                    <p class="text-xs text-ink-muted leading-relaxed">
                      {selectedArtist.analysis.instrumentationNotes}
                    </p>
                  </div>
                {/if}
              </div>
            </div>

            <!-- 雙軌唱片挖掘：核心推薦專輯 ✕ 深埋發燒寶藏 (Dual-Track Archives) -->
            {#if selectedArtist.analysis}
              <div class="font-mono flex flex-col gap-2">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-ink-muted uppercase tracking-widest">// RECORD_ARCHIVES [推薦專輯 ✕ 深埋寶藏]</span>
                  <div class="flex items-center gap-1.5">
                    {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
                      <span class="text-signal">0{selectedArtist.analysis.notableAlbums.length}_ENCODED</span>
                    {/if}
                    {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 2}
                      <button
                        type="button"
                        onclick={() => handleNextAlbumBatch(selectedArtist!.analysis!.notableAlbums.length)}
                        class="corner-cut-sm text-[9px] px-2 py-0.5 border border-wire bg-chassis hover:border-signal text-ink-muted hover:text-signal flex items-center gap-1 transition-colors cursor-pointer"
                        title="在已推薦專輯清單中輪播換一批"
                      >
                        <span class="material-symbols-outlined text-[11px]">sync</span>
                        <span>換一批 ({Math.floor(albumOffset / 2) + 1}/{Math.ceil(selectedArtist.analysis.notableAlbums.length / 2)})</span>
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={() => onrecommendMoreAlbums?.(selectedArtist!)}
                      disabled={isRecommendingAlbums}
                      class="corner-cut-sm text-[9px] px-2 py-0.5 border border-signal/40 bg-signal/10 hover:bg-signal/20 text-signal flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="請 AI 深入唱片脈絡挖掘更多代表盤與發燒寶藏"
                    >
                      {#if isRecommendingAlbums}
                        <span class="material-symbols-outlined text-[11px] animate-spin">progress_activity</span>
                        <span>探勘中...</span>
                      {:else}
                        <span class="material-symbols-outlined text-[11px]">auto_awesome</span>
                        <span>AI 推薦更多</span>
                      {/if}
                    </button>
                  </div>
                </div>

                {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
                  {@const albumsToDisplay = selectedArtist.analysis.notableAlbums.length > 2
                    ? [
                        selectedArtist.analysis.notableAlbums[albumOffset % selectedArtist.analysis.notableAlbums.length],
                        selectedArtist.analysis.notableAlbums[(albumOffset + 1) % selectedArtist.analysis.notableAlbums.length]
                      ].filter(Boolean)
                    : selectedArtist.analysis.notableAlbums}
                  <div class="flex flex-col gap-2">
                    {#each albumsToDisplay as alb}
                      {@const isHidden = alb.tier === 'hidden-treasure' || alb.trackType === 'hidden-treasure'}
                      <div class="border p-2.5 flex flex-col gap-1.5 transition-colors {isHidden ? 'border-amber-500/40 bg-amber-950/10' : 'border-wire bg-void hover:bg-panel'}">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2 min-w-0">
                            {#if isHidden}
                              <span class="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold shrink-0">深埋寶藏</span>
                            {:else}
                              <span class="text-[9px] px-1.5 py-0.2 bg-signal-dim text-signal border border-signal/40 font-bold shrink-0">核心推薦</span>
                            {/if}
                            <span class="text-[10px] text-ink-dim font-bold shrink-0">{alb.year || 'HIST'}</span>
                            <span class="font-sans text-xs text-ink font-bold truncate">{alb.title}</span>
                          </div>
                          <div class="flex items-center gap-1.5 shrink-0 ml-2">
                            {#if alb.dynamicRangeScore}
                              <span class="text-[9px] text-signal font-bold mr-0.5">DR{alb.dynamicRangeScore}</span>
                            {/if}
                            <button
                              type="button"
                              onclick={() => onaddToQueue?.(selectedArtist!, alb)}
                              class="corner-cut-sm text-[9px] px-2 py-0.5 border border-wire bg-chassis hover:border-signal text-ink-muted hover:text-signal flex items-center gap-1 transition-colors cursor-pointer"
                              title="將此盤加入聆賞隊列"
                            >
                              <span class="material-symbols-outlined text-[11px]">queue_music</span>
                              <span>+ 聆賞</span>
                            </button>
                            {#if alb.appleMusicSearchUrl}
                              <a
                                href={alb.appleMusicSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-ink-dim hover:text-signal p-0.5"
                                title="在 Apple Music 開啟"
                              >
                                <ArrowUpRight class="w-3.5 h-3.5" />
                              </a>
                            {/if}
                          </div>
                        </div>

                        {#if alb.description}
                          <p class="font-sans text-[11px] text-ink-muted leading-relaxed pl-1">
                            {alb.description}
                          </p>
                        {/if}

                        {#if isHidden && (alb.rarityReason || alb.audiophileHighlight)}
                          <div class="pt-1.5 mt-0.5 border-t border-amber-500/20 text-[10px] flex flex-col gap-1 pl-1">
                            {#if alb.rarityReason}
                              <div class="text-ink-dim flex items-start gap-1">
                                <span class="text-amber-400 shrink-0 font-bold">[挖寶理由]</span>
                                <span class="text-ink-muted">{alb.rarityReason}</span>
                              </div>
                            {/if}
                            {#if alb.audiophileHighlight}
                              <div class="text-ink-dim flex items-start gap-1">
                                <span class="text-emerald-400 shrink-0 font-bold">[聲學亮點]</span>
                                <span class="text-ink-muted">{alb.audiophileHighlight}</span>
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="border border-dashed border-wire p-3 text-center text-ink-dim text-[11px]">
                    尚未收錄代表作品，點擊右上方「AI 推薦更多」進行唱片挖掘
                  </div>
                {/if}
              </div>
            {/if}

            <!-- 脈絡相似推薦 (Interactive Network Matrix - 智慧去重與 AI 深度探索) -->
            {#if selectedArtist.analysis}
              <div class="font-mono flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-ink-muted uppercase tracking-widest">// ACOUSTIC_AFFINITY [相似頻率推薦]</span>
                  <div class="flex items-center gap-1.5">
                    {#if uncollectedSimilar.length > 3}
                      <button
                        type="button"
                        onclick={handleNextSimilarBatch}
                        class="corner-cut-sm text-[9px] px-2 py-0.5 border border-wire bg-chassis hover:border-signal text-ink-muted hover:text-signal flex items-center gap-1 transition-colors cursor-pointer"
                        title="在本地累積未收錄名單中輪播換一批"
                      >
                        <span class="material-symbols-outlined text-[11px]">sync</span>
                        <span>換一批 ({Math.floor(similarOffset / 3) + 1}/{Math.ceil(uncollectedSimilar.length / 3)})</span>
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={() => onrecommendMoreSimilar?.(selectedArtist)}
                      disabled={isRecommendingMore}
                      class="corner-cut-sm text-[9px] px-2 py-0.5 border border-signal/40 bg-signal/10 hover:bg-signal/20 text-signal flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="請 AI 深入聲學網絡探索更多未被發掘的相似音樂人"
                    >
                      {#if isRecommendingMore}
                        <span class="material-symbols-outlined text-[11px] animate-spin">progress_activity</span>
                        <span>探勘中...</span>
                      {:else}
                        <span class="material-symbols-outlined text-[11px]">auto_awesome</span>
                        <span>AI 推薦更多</span>
                      {/if}
                    </button>
                  </div>
                </div>

                {#if displaySimilarSlots.length > 0}
                  <div class="grid grid-cols-3 gap-1.5">
                    {#each displaySimilarSlots as slot, idx}
                      <div class="border border-wire bg-void p-2 flex flex-col justify-between gap-2 hover:border-ink transition-colors {slot.isCollected ? 'opacity-75 bg-[#0e1015]' : ''}">
                        <div>
                          <div class="text-xs text-ink font-bold truncate flex items-center gap-1" title={slot.name}>
                            <span class="truncate">{slot.name}</span>
                            {#if slot.isCollected}
                              <span class="text-[9px] text-[#63C78B] font-mono shrink-0" title="已收錄於收藏庫">✓</span>
                            {/if}
                          </div>
                          <div class="text-[9px] text-signal mt-0.5 flex items-center justify-between">
                            <span>SYNC: {92 - idx * 4}%</span>
                            {#if slot.isCollected}
                              <span class="text-[8px] text-ink-muted uppercase">已收錄</span>
                            {/if}
                          </div>
                        </div>

                        {#if slot.isCollected && slot.existingArtist}
                          <button
                            type="button"
                            onclick={() => onselectArtist(slot.existingArtist!.id)}
                            class="w-full py-0.5 bg-panel hover:bg-chassis text-ink-muted hover:text-ink text-[9px] border border-wire transition-colors cursor-pointer flex items-center justify-center gap-1"
                            title="跳轉並檢視此已收錄藝人"
                          >
                            <span class="material-symbols-outlined text-[11px]">explore</span>
                            <span>跳轉定位</span>
                          </button>
                        {:else}
                          <button
                            type="button"
                            onclick={() => onpickupSimilar(slot.name)}
                            class="w-full py-0.5 bg-panel hover:bg-signal text-ink hover:text-white text-[9px] border border-wire transition-colors cursor-pointer"
                          >
                            + 拾取
                          </button>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="border border-wire border-dashed p-3 text-center text-xs text-ink-muted font-mono bg-void/50">
                    尚無相似音樂人推薦，點擊上方「AI 推薦更多」啟動探勘
                  </div>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- 本地私密試聽筆記 (Hardware Impressions) -->
          <div class="border border-wire border-dashed bg-void/80 p-3 font-mono flex flex-col gap-2">
            <div class="flex items-center justify-between text-[10px]">
              <span class="text-ink-muted uppercase tracking-wider">// LOCAL_IMPRESSIONS [私密試聽鏈路]</span>
              <span class="material-symbols-outlined text-ink-dim text-[14px]">edit_note</span>
            </div>
            <div class="p-2 bg-chassis border border-wire text-[10px] text-ink flex items-center justify-between">
              <span>CHAIN: HD600 // 4.4mm BALANCED</span>
              <span class="text-ink-dim">2026.10</span>
            </div>
            <textarea
              bind:value={selectedArtist.personalNotes}
              placeholder="輸入私藏監聽耳機搭配、管機音色或現場聆聽筆記..."
              rows="2"
              class="w-full bg-void text-xs text-ink placeholder-ink-dim p-2 border border-wire focus:border-signal focus:outline-none resize-none font-mono"
            ></textarea>
            <div class="flex items-center justify-between text-[9px] text-ink-dim pt-1">
              <span class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>COMMITTED: pua_library.json</span>
              </span>
              <span>IDB_LATENCY &lt;12ms</span>
            </div>
          </div>

          <!-- 底部危險操作區：二次確認防誤觸移除按鈕 -->
          <div class="pt-3 border-t border-wire mt-2">
            <button
              type="button"
              onclick={handleTriggerDelete}
              class="w-full py-2 px-3 rounded-[2px] font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 {deleteConfirmPending
                ? 'bg-signal text-white shadow-[0_0_16px_rgba(255,42,60,0.6)] animate-pulse'
                : 'bg-void hover:bg-signal-dim text-ink-muted hover:text-signal border border-wire hover:border-signal/50'}"
            >
              {#if deleteConfirmPending}
                <span>⚠️ 確認移除「{selectedArtist.name}」？ ({deleteCountdown}s)</span>
              {:else}
                <Trash2 class="w-3.5 h-3.5 text-ink-muted" />
                <span>自智庫與展間中移除藝人</span>
              {/if}
            </button>
          </div>

        </div>
      {:else}
        <div class="p-12 text-center text-ink-dim font-mono text-xs">
          [STANDBY: NO_ARTIST_SELECTED]
        </div>
      {/if}
    </aside>

  </div>
</div>

