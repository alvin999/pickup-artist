<script lang="ts">
  import type { ArtistEntry } from '$lib/types/artist';
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

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId: string | null;
    onselectArtist: (id: string) => void;
    ondeleteArtist: (id: string) => void;
    onanalyzeArtist: (artist: ArtistEntry) => void;
    onpickupSimilar: (name: string) => void;
    isAnalyzing?: boolean;
  }

  let {
    artists = [],
    selectedArtistId = $bindable(null),
    onselectArtist,
    ondeleteArtist,
    onanalyzeArtist,
    onpickupSimilar,
    isAnalyzing = false
  }: Props = $props();

  // 篩選與排序狀態
  let activeFilter = $state<string>('all');
  let sortBy = $state<'recent' | 'cat' | 'dr' | 'audiophile'>('recent');

  const selectedArtist = $derived(
    artists.find((a) => a.id === selectedArtistId) || artists[0] || null
  );

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
            <!-- 頂部微距數據列 -->
            <div class="flex items-center justify-between font-mono text-[10px] pb-3 border-b border-wire border-dashed">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full {isActive ? 'animate-pulse' : 'bg-ink-dim'}" style="{isActive ? `background-color: ${aura.accentColor}` : ''}"></span>
                <span class="{isActive ? 'text-ink font-bold tracking-wider' : 'text-ink-muted'}">
                  {artist.catalogNumber || `STAGE-${artist.id.substring(0, 6).toUpperCase()}`}
                </span>
              </div>
              {#if isActive}
                <span class="px-1.5 py-0.5 bg-signal text-white font-dot text-[9px] tracking-widest uppercase">
                  ON_STAGE
                </span>
              {:else if artist.status === 'inbox'}
                <span class="px-1.5 py-0.5 border border-signal/40 bg-signal-dim text-signal font-mono text-[9px] uppercase">
                  STANDBY
                </span>
              {:else}
                <span class="text-ink-dim text-[9px]">
                  {artist.dynamicRange ? `DR${artist.dynamicRange}` : '44.1k/24b'}
                </span>
              {/if}
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

              <!-- 4. 舞台左上監聽 HUD (Top-Left Stage HUD) -->
              <div class="absolute top-2 left-2 z-20 px-2 py-0.5 bg-void/90 border border-wire-bright/50 font-mono text-[9px] text-ink flex items-center gap-1.5 backdrop-blur-sm">
                <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background-color: {aura.accentColor}"></span>
                <span class="font-bold tracking-wider">{artist.dynamicRange ? `DR${artist.dynamicRange} // LIVE` : 'STAGE_FEED'}</span>
              </div>

              <!-- 5. 舞台右上風格領域 (Top-Right Stage Sector) -->
              <div class="absolute top-2 right-2 z-20 font-mono text-[8px] text-ink-muted bg-void/85 px-1.5 py-0.5 border border-wire backdrop-blur-sm tracking-widest uppercase">
                {artist.analysis?.sector || artist.countryCode || 'STAGE'}
              </div>

              <!-- 6. 底部藝人舞台焦點 (Bottom Artist Stage Typography) -->
              <div class="absolute bottom-2.5 left-2.5 right-2.5 z-20">
                <div class="flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase mb-0.5">
                  <span style="color: {aura.accentColor}">●</span>
                  <span class="text-ink-dim">{artist.status === 'analyzed' ? 'STAGE_ARCHIVE' : 'LIVE_STANDBY'}</span>
                </div>
                <h3 class="font-sans text-lg text-ink font-black tracking-tight leading-snug truncate drop-shadow-md">
                  {artist.name}
                </h3>
              </div>
            </div>

            <!-- 底部硬體參數條 -->
            <div class="pt-2 border-t border-wire flex flex-col gap-2 font-mono">
              <div class="flex flex-wrap gap-1">
                {#if artist.analysis?.genres}
                  {#each artist.analysis.genres.slice(0, 2) as g}
                    <span class="px-1.5 py-0.5 bg-void border border-wire text-ink text-[9px]">
                      {g.toUpperCase()}
                    </span>
                  {/each}
                  <span class="px-1.5 py-0.5 bg-signal-dim border border-signal/40 text-signal text-[9px]">
                    AI_PARSED
                  </span>
                {:else}
                  <span class="px-1.5 py-0.5 bg-signal-dim border border-signal/40 text-signal text-[9px]">
                    AWAITING_ANALYZE
                  </span>
                {/if}
              </div>
              <div class="flex items-center justify-between text-[10px] text-ink-dim">
                <span class="truncate max-w-[120px]">{artist.runoutMatrix || 'MTX: A-1 SST'}</span>
                <span class="text-ink font-bold">{artist.fileSize || '1.18 GB [FLAC]'}</span>
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

          <!-- 艙門頂部狀態列 -->
          <div class="flex items-center justify-between border-b border-wire pb-3 font-mono">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 bg-signal"></span>
              <span class="font-dot text-xs tracking-[0.15em] text-ink">
                DOSSIER_INSPECTOR // #{selectedArtist.catalogNumber || '0824'}
              </span>
              <span class="px-1.5 py-0.5 border border-wire bg-void text-ink-muted text-[9px]">MASTER_TIER</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[9px] text-ink-dim">BYOK_ACTIVE</span>
              <button
                type="button"
                onclick={() => ondeleteArtist(selectedArtist.id)}
                title="移出機架"
                class="w-6 h-6 border border-wire hover:border-signal text-ink-muted hover:text-signal flex items-center justify-center transition-colors cursor-pointer"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
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

            <!-- 內嵌硬體級頻譜與母帶遙測 (Embedded Telemetry Matrix) -->
            <div class="mt-4 pt-3 border-t border-wire border-dashed grid grid-cols-3 gap-2 font-mono text-[10px]">
              <div class="bg-chassis p-2 border border-wire">
                <span class="text-ink-dim text-[8px] block">DYNAMIC RANGE</span>
                <span class="text-ink font-bold">DR {selectedArtist.dynamicRange || 14} <span class="text-signal text-[9px]">[REF]</span></span>
              </div>
              <div class="bg-chassis p-2 border border-wire">
                <span class="text-ink-dim text-[8px] block">PEAK LEVEL</span>
                <span class="text-ink font-bold">-0.1 dBFS</span>
              </div>
              <div class="bg-chassis p-2 border border-wire">
                <span class="text-ink-dim text-[8px] block">STAGE SECTOR</span>
                <span class="text-ink font-bold truncate block">{selectedArtist.analysis?.sector || 'SOUNDSTAGE'}</span>
              </div>
            </div>

            <!-- 點陣頻譜波形 (Waveform Recon) -->
            <div class="mt-2 bg-chassis border border-wire p-2.5">
              <div class="flex justify-between items-center font-mono text-[9px] text-ink-dim mb-1.5">
                <span>WAVEFORM_RECON // 20Hz - 48kHz</span>
                <span class="text-signal animate-pulse">● LIVE_SCAN</span>
              </div>
              <div class="h-10 flex items-end justify-between gap-0.5 pt-1">
                <span class="flex-1 h-2 bg-wire-bright"></span>
                <span class="flex-1 h-4 bg-wire-bright"></span>
                <span class="flex-1 h-6 bg-ink-muted"></span>
                <span class="flex-1 h-8 bg-ink"></span>
                <span class="flex-1 h-5 bg-ink-muted"></span>
                <span class="flex-1 h-10 bg-signal animate-pulse"></span>
                <span class="flex-1 h-7 bg-ink"></span>
                <span class="flex-1 h-9 bg-signal"></span>
                <span class="flex-1 h-4 bg-ink-muted"></span>
                <span class="flex-1 h-6 bg-ink"></span>
                <span class="flex-1 h-3 bg-wire-bright"></span>
                <span class="flex-1 h-8 bg-ink"></span>
                <span class="flex-1 h-10 bg-signal animate-pulse"></span>
                <span class="flex-1 h-6 bg-ink-muted"></span>
                <span class="flex-1 h-5 bg-wire-bright"></span>
                <span class="flex-1 h-9 bg-ink"></span>
                <span class="flex-1 h-4 bg-wire-bright"></span>
                <span class="flex-1 h-7 bg-ink-muted"></span>
                <span class="flex-1 h-3 bg-wire-bright"></span>
                <span class="flex-1 h-2 bg-wire"></span>
              </div>
            </div>
          </div>

          <!-- 動作按鈕：外部串流觸發器 + AI 解剖按鈕 -->
          <div class="flex flex-col gap-2">
            {#if selectedArtist.appleMusicUrl}
              <a
                href={selectedArtist.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="corner-cut flex items-center justify-between px-4 py-2.5 bg-ink hover:bg-signal text-void hover:text-white font-mono text-xs font-bold uppercase tracking-widest transition-all"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[16px]">play_arrow</span>
                  <span>LAUNCH_APPLE_MUSIC_STREAM</span>
                </div>
                <span>[EXT ↗]</span>
              </a>
            {/if}

            <button
              type="button"
              disabled={isAnalyzing}
              onclick={() => onanalyzeArtist(selectedArtist)}
              class="w-full corner-cut flex items-center justify-center gap-2 px-4 py-2 bg-panel hover:bg-signal text-ink hover:text-white border border-wire font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              <Sparkles class="w-3.5 h-3.5 text-signal" />
              <span>{isAnalyzing ? 'ENGINE RUNNING...' : 'AI 深度音樂學解剖 (SPECTRUM SCAN)'}</span>
            </button>
          </div>

          <!-- AI 音樂脈絡精析 (AI Context Breakdown) -->
          {#if selectedArtist.analysis}
            <div class="border border-wire bg-void/60 p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between border-b border-wire pb-2 font-mono">
                <div class="flex items-center gap-1.5">
                  <span class="text-signal text-xs">■</span>
                  <span class="font-dot text-xs text-ink tracking-wider">AI_ACOUSTIC_SPECTRUM [脈絡解剖]</span>
                </div>
                <span class="text-[9px] text-ink-dim">LLAMA-3.3 // GEMINI</span>
              </div>

              <div class="space-y-3">
                <div class="border-l-2 border-signal pl-3 py-0.5">
                  <span class="font-mono text-[10px] text-signal font-bold tracking-wider block mb-1">01 // ARTIST_ESSENCE [音樂人/藝人介紹與美學脈絡]</span>
                  <p class="text-xs text-ink-muted leading-relaxed">
                    {selectedArtist.analysis.summary}
                  </p>
                </div>
                {#if selectedArtist.analysis.instrumentationNotes}
                  <div class="border-l-2 border-amber-400 pl-3 py-0.5">
                    <span class="font-mono text-[10px] text-amber-400 font-bold tracking-wider block mb-1">02 // LISTENING_FOCUS [發燒聆聽重點與聲學質地]</span>
                    <p class="text-xs text-ink-muted leading-relaxed">
                      {selectedArtist.analysis.instrumentationNotes}
                    </p>
                  </div>
                {/if}
              </div>
            </div>

            <!-- 雙軌唱片挖掘：核心推薦專輯 ✕ 深埋發燒寶藏 (Dual-Track Archives) -->
            {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
              <div class="font-mono flex flex-col gap-2">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-ink-muted uppercase tracking-widest">// RECORD_ARCHIVES [推薦專輯 ✕ 深埋寶藏]</span>
                  <span class="text-signal">0{selectedArtist.analysis.notableAlbums.length}_ENCODED</span>
                </div>
                <div class="flex flex-col gap-2">
                  {#each selectedArtist.analysis.notableAlbums as alb}
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
                        <div class="flex items-center gap-2 shrink-0 ml-2">
                          {#if alb.dynamicRangeScore}
                            <span class="text-[9px] text-signal font-bold">DR{alb.dynamicRangeScore}</span>
                          {/if}
                          {#if alb.appleMusicSearchUrl}
                            <a
                              href={alb.appleMusicSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-ink-dim hover:text-signal"
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
              </div>
            {/if}

            <!-- 脈絡相似推薦 (Interactive Network Matrix) -->
            {#if selectedArtist.analysis.similarArtists && selectedArtist.analysis.similarArtists.length > 0}
              <div class="font-mono flex flex-col gap-2">
                <span class="text-[10px] text-ink-muted uppercase tracking-widest">// ACOUSTIC_AFFINITY [相似頻率推薦]</span>
                <div class="grid grid-cols-3 gap-1.5">
                  {#each selectedArtist.analysis.similarArtists.slice(0, 3) as sim, idx}
                    <div class="border border-wire bg-void p-2 flex flex-col justify-between gap-2 hover:border-ink transition-colors">
                      <div>
                        <div class="text-xs text-ink font-bold truncate">{sim}</div>
                        <div class="text-[9px] text-signal mt-0.5">SYNC: {92 - idx * 4}%</div>
                      </div>
                      <button
                        type="button"
                        onclick={() => onpickupSimilar(sim)}
                        class="w-full py-0.5 bg-panel hover:bg-signal text-ink hover:text-white text-[9px] border border-wire transition-colors cursor-pointer"
                      >
                        + 拾取
                      </button>
                    </div>
                  {/each}
                </div>
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

        </div>
      {:else}
        <div class="p-12 text-center text-ink-dim font-mono text-xs">
          [STANDBY: NO_ARTIST_SELECTED]
        </div>
      {/if}
    </aside>

  </div>
</div>

