<script lang="ts">
  import type { ArtistEntry } from '$lib/types/artist';
  import { t } from '$lib/i18n/index.svelte';
  import SpecBadge from '$lib/components/SpecBadge.svelte';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import {
    Music,
    Sparkles,
    Trash2,
    ArrowUpRight,
    SlidersHorizontal,
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
</script>

<div class="flex flex-col w-full text-[#EEF0F2] select-none">
  <!-- 頂部次級工具列 (Sub-header Filter Toolbar) -->
  <div class="bg-[#0D0E11] p-3 sm:p-4 rounded-[4px] border border-[#1F2228] mb-5 shadow-sm">
    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <!-- 篩選膠囊 (Filter Pills) -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
        <button
          type="button"
          onclick={() => (activeFilter = activeFilter === 'inbox' ? 'all' : 'inbox')}
          class="flex items-center gap-1.5 px-3 py-1 rounded-[3px] font-mono text-xs shrink-0 cursor-pointer transition-all {activeFilter === 'inbox' ? 'bg-[#FA383E] text-white shadow-[0_0_12px_rgba(250,56,62,0.3)] font-bold' : 'bg-[#15171C] text-[#8E9298] hover:text-[#EEF0F2] border border-[#232731]'}"
        >
          <span class="material-symbols-outlined text-[15px]">inbox</span>
          <span>待解剖收件匣 ({inboxCount})</span>
        </button>

        <button
          type="button"
          onclick={() => (activeFilter = activeFilter === 'all' ? 'all' : 'all')}
          class="flex items-center gap-1.5 px-3 py-1 rounded-[3px] font-mono text-xs shrink-0 cursor-pointer transition-all {activeFilter === 'all' ? 'bg-[#1C2027] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'bg-[#15171C] text-[#8E9298] hover:text-[#EEF0F2] border border-[#232731]'}"
        >
          <span class="material-symbols-outlined text-[15px] text-[#FEC486]">album</span>
          <span>全部唱片 ({artists.length})</span>
        </button>

        <button
          type="button"
          onclick={() => (activeFilter = activeFilter === 'math' ? 'all' : 'math')}
          class="flex items-center gap-1.5 px-3 py-1 rounded-[3px] font-mono text-xs shrink-0 cursor-pointer transition-all {activeFilter === 'math' ? 'bg-[#1C2027] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'bg-[#15171C] text-[#8E9298] hover:text-[#EEF0F2] border border-[#232731]'}"
        >
          <span class="material-symbols-outlined text-[15px] text-[#FEC486]">grain</span>
          <span>Math Rock & Inst. ({genreCounts.math})</span>
        </button>

        <button
          type="button"
          onclick={() => (activeFilter = activeFilter === 'jazz' ? 'all' : 'jazz')}
          class="flex items-center gap-1.5 px-3 py-1 rounded-[3px] font-mono text-xs shrink-0 cursor-pointer transition-all {activeFilter === 'jazz' ? 'bg-[#1C2027] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'bg-[#15171C] text-[#8E9298] hover:text-[#EEF0F2] border border-[#232731]'}"
        >
          <span class="material-symbols-outlined text-[15px] text-[#FEC486]">audiotrack</span>
          <span>當代爵士 ({genreCounts.jazz})</span>
        </button>

        <button
          type="button"
          onclick={() => (activeFilter = activeFilter === 'ambient' ? 'all' : 'ambient')}
          class="flex items-center gap-1.5 px-3 py-1 rounded-[3px] font-mono text-xs shrink-0 cursor-pointer transition-all {activeFilter === 'ambient' ? 'bg-[#1C2027] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'bg-[#15171C] text-[#8E9298] hover:text-[#EEF0F2] border border-[#232731]'}"
        >
          <span class="material-symbols-outlined text-[15px] text-[#FEC486]">waves</span>
          <span>原聲氛圍與民謠 ({genreCounts.ambient})</span>
        </button>
      </div>

      <!-- 排序下拉 (Sort Selector) -->
      <div class="flex items-center gap-2 shrink-0 self-end xl:self-auto">
        <div class="flex items-center bg-[#040405] border border-[#1F2228] rounded-[3px] px-2.5 py-1 gap-1.5">
          <span class="font-mono text-[10px] text-[#8E9298] uppercase tracking-wider">排序 :</span>
          <select
            bind:value={sortBy}
            class="bg-transparent text-[#FEC486] font-mono text-xs focus:outline-none cursor-pointer"
          >
            <option value="recent">最近更新 (Recent Play)</option>
            <option value="cat">依盤號 / 刻號 (CAT#)</option>
            <option value="dr">DR 動態值 (Dynamic Range)</option>
            <option value="audiophile">發燒等級 (Audiophile Grade)</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <!-- 主分割工作區：Crate Grid (唱片架) + 右側 Slide-Out Dossier Drawer -->
  <div class="flex flex-col 2xl:flex-row gap-6 items-start">
    <!-- 唱片架網格 (Crate Grid) -->
    <div class="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {#each processedArtists as artist (artist.id)}
        {@const isActive = selectedArtistId === artist.id}
        <div
          role="button"
          tabindex="0"
          onclick={() => onselectArtist(artist.id)}
          onkeydown={(e) => e.key === 'Enter' && onselectArtist(artist.id)}
          class="group relative bg-[#0D0E11] p-3 rounded-[4px] flex flex-col justify-between cursor-pointer transition-all duration-200 border {isActive ? 'border-[#E0A96D] shadow-[0_0_24px_rgba(224,169,109,0.2)] bg-gradient-to-b from-[#1C2027]/70 to-[#0D0E11]' : 'border-[#1F2228] hover:border-[#383D48] hover:bg-[#121417]'}"
        >
          <!-- 頂部脊背資訊 (Spine Header) -->
          <div class="flex items-center justify-between font-mono text-[10px] pb-2">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full {isActive ? 'bg-[#FEC486] animate-pulse' : 'bg-[#52565E]'}"></span>
              <span class="{isActive ? 'text-[#FEC486] font-bold' : 'text-[#8E9298]'}">
                {artist.catalogNumber || 'CAT# PUA-RAW'}
              </span>
            </div>
            {#if isActive}
              <span class="px-1.5 py-0.2 bg-[#E0A96D]/10 text-[#FEC486] border border-[#E0A96D]/30 rounded-[2px] font-bold text-[9px] tracking-wider uppercase">
                ACTIVE INSPECTION
              </span>
            {:else if artist.status === 'inbox'}
              <span class="px-1.5 py-0.2 bg-[#FA383E]/10 text-[#FA383E] border border-[#FA383E]/30 rounded-[2px] font-bold text-[9px] uppercase">
                INBOX RAW
              </span>
            {/if}
          </div>

          <!-- 12吋黑膠唱片外套 (12-inch Jacket with Peek Vinyl) -->
          <div class="relative w-full aspect-square overflow-hidden rounded-[2px] bg-[#040405] my-1 shadow-md border border-[#1A1D23]">
            <!-- 右側露出黑膠微動紋理 (Peeking Vinyl Disc) -->
            <div class="absolute -right-8 top-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-[#050505] flex items-center justify-center shadow-2xl transition-transform duration-300 group-hover:translate-x-3 pointer-events-none border border-[#222]">
              <!-- 黑膠唱片同心圓微凹槽 (Concentric Grooves) -->
              <div class="w-32 h-32 rounded-full bg-[#0c0c0e] flex items-center justify-center border border-[#18181a]">
                <div class="w-24 h-24 rounded-full bg-[#050505] flex items-center justify-center border border-[#222]">
                  <!-- 唱片中央貼標 (Center Label) -->
                  <div class="w-11 h-11 rounded-full bg-[#E0A96D] flex items-center justify-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
                    <div class="w-2.5 h-2.5 rounded-full bg-[#040405]"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 外套封面圖與文字疊層 (Front Cover Jacket) -->
            <div class="relative z-10 w-full h-full bg-[#121417] overflow-hidden">
              <img
                src={artist.coverImage || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'}
                alt={artist.name}
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-[#040405] via-[#040405]/30 to-transparent"></div>

              <!-- 左上角聲學指標 -->
              <div class="absolute top-2 left-2 px-1.5 py-0.5 bg-[#0D0E11]/85 backdrop-blur rounded-[2px] font-mono text-[10px] text-[#FEC486] border border-[#E0A96D]/30">
                {artist.formatSpec || (artist.dynamicRange ? `DR ${artist.dynamicRange} // 96kHz 24bit` : 'Lossless Hi-Res')}
              </div>

              <!-- 左下角專輯與藝人名稱 -->
              <div class="absolute bottom-2 left-2 right-2">
                <span class="font-mono text-[10px] text-[#8E9298] uppercase tracking-wider block">
                  {artist.status === 'analyzed' ? 'MASTER RECORD' : 'UNCATALOGED ENTRY'}
                </span>
                <h3 class="font-serif text-base font-bold text-[#EEF0F2] group-hover:text-[#FEC486] transition-colors truncate">
                  {artist.name}
                </h3>
              </div>
            </div>
          </div>

          <!-- 底部元數據橫條 (Footer Metadata Strip) -->
          <div class="pt-2 flex flex-col gap-1.5">
            <div class="flex flex-wrap gap-1">
              {#if artist.analysis?.genres}
                {#each artist.analysis.genres.slice(0, 2) as g}
                  <span class="px-1.5 py-0.2 bg-[#14161B] text-[#CCCFD6] border border-[#232731] font-mono text-[9px] rounded-[2px]">
                    {g}
                  </span>
                {/each}
              {:else}
                <span class="px-1.5 py-0.2 bg-[#1A1113] text-[#FA383E] border border-[#FA383E]/30 font-mono text-[9px] rounded-[2px]">
                  待 AI 聲學解剖
                </span>
              {/if}
              {#if artist.dynamicRange}
                <span class="px-1.5 py-0.2 bg-[#0F1813] text-[#63C78B] border border-[#254C34] font-mono text-[9px] rounded-[2px] font-bold">
                  DR {artist.dynamicRange}
                </span>
              {/if}
            </div>

            <div class="flex items-center justify-between font-mono text-[10px] text-[#52565E] pt-1 border-t border-[#1F2228]">
              <span class="truncate max-w-[150px]">{artist.runoutMatrix || 'RUNOUT: A-1 SST'}</span>
              <span class="text-[#FEC486] font-tabular">{artist.fileSize || '1.18 GB FLAC'}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- 右側 Slide-Out Dossier Drawer (深潛解剖抽屜) -->
    <aside class="w-full 2xl:w-[460px] bg-[#0E1013] border border-[#1F2228] p-5 rounded-[4px] shadow-2xl flex flex-col gap-4 sticky top-20">
      {#if selectedArtist}
        <!-- 抽屜標題列 -->
        <div class="border-b border-[#1F2228] pb-4">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-mono text-[10px] tracking-widest uppercase text-[#FEC486] flex items-center gap-1.5 font-bold">
              <span class="w-2 h-0.5 bg-[#FEC486]"></span>
              DOSSIER INSPECTOR // MASTER FILE
            </span>
            <div class="flex items-center gap-1">
              {#if selectedArtist.dynamicRange}
                <SpecBadge type="dr" text={`DR${selectedArtist.dynamicRange}`} />
              {/if}
              <SpecBadge type="hires" text="HI-RES" />
            </div>
          </div>

          <h2 class="font-serif text-2xl font-bold text-[#EEF0F2] mb-1">
            {selectedArtist.name}
          </h2>

          {#if selectedArtist.aliases && selectedArtist.aliases.length > 0}
            <p class="font-mono text-xs text-[#8E9298] mb-3">
              AKA: {selectedArtist.aliases.join(' / ')}
            </p>
          {/if}

          <!-- 核心動作列 -->
          <div class="flex items-center gap-2 mt-3">
            {#if selectedArtist.appleMusicUrl}
              <a
                href={selectedArtist.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 inline-flex items-center justify-center gap-1.5 font-mono text-xs bg-[#FA383E] text-white py-2 px-3 rounded-[3px] font-semibold hover:bg-[#E0262C] transition-all shadow-[0_0_12px_rgba(250,56,62,0.3)]"
              >
                <Music class="w-3.5 h-3.5" />
                <span>在 Apple Music 開啟</span>
              </a>
            {/if}

            <TactileButton
              variant="amber"
              size="md"
              disabled={isAnalyzing}
              onclick={() => onanalyzeArtist(selectedArtist)}
              class="flex-1 py-2 text-xs"
            >
              <Sparkles class="w-3.5 h-3.5 mr-1.5 text-[#FEC486]" />
              <span>{isAnalyzing ? '解剖中...' : 'AI 音樂學解剖'}</span>
            </TactileButton>

            <button
              type="button"
              onclick={() => ondeleteArtist(selectedArtist.id)}
              title="移出機架"
              class="p-2 rounded-[3px] bg-[#14161A] border border-[#252930] text-[#52565E] hover:text-[#FA383E] hover:bg-[#201013] transition-colors cursor-pointer"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 檔案詳情內文 (滾動視圖) -->
        <div class="flex flex-col gap-4 overflow-y-auto max-h-[580px] pr-1">
          {#if selectedArtist.analysis}
            <!-- 聲響演進 -->
            <div>
              <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 bg-[#E0A96D] rounded-full"></span>
                聲響簽名與脈絡演進
              </h4>
              <p class="font-sans text-xs text-[#CCCFD6] leading-relaxed bg-[#050608] p-3 rounded-[3px] border border-[#1A1D23]">
                {selectedArtist.analysis.summary}
              </p>
            </div>

            <!-- 配器聲學特徵 -->
            {#if selectedArtist.analysis.instrumentationNotes}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <SlidersHorizontal class="w-3.5 h-3.5 text-[#E0A96D]" />
                  配器質地與錄音特徵
                </h4>
                <p class="font-mono text-xs text-[#E0A96D]/90 bg-[#12100A] p-3 rounded-[3px] border border-[#E0A96D]/30 leading-relaxed">
                  {selectedArtist.analysis.instrumentationNotes}
                </p>
              </div>
            {/if}

            <!-- 代表性專輯 -->
            {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <Disc3 class="w-3.5 h-3.5 text-[#FA383E]" />
                  代表專輯矩陣
                </h4>
                <div class="space-y-2">
                  {#each selectedArtist.analysis.notableAlbums as alb}
                    <div class="bg-[#050608] p-2.5 rounded-[3px] border border-[#1A1D23] flex items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="font-serif text-xs font-bold text-[#EEF0F2]">
                            {alb.title}
                          </span>
                          <span class="font-mono text-[10px] text-[#E0A96D] px-1 bg-[#E0A96D]/10 rounded">
                            {alb.year}
                          </span>
                        </div>
                        <p class="font-sans text-[11px] text-[#8E9298] mt-1 leading-normal">
                          {alb.description}
                        </p>
                      </div>
                      <a
                        href={alb.appleMusicSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="p-1 rounded bg-[#14161A] text-[#FA383E] hover:bg-[#FA383E] hover:text-white transition-colors shrink-0"
                      >
                        <ArrowUpRight class="w-3.5 h-3.5" />
                      </a>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 相似風格系譜一鍵拾取 -->
            {#if selectedArtist.analysis.similarArtists && selectedArtist.analysis.similarArtists.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <Flame class="w-3.5 h-3.5 text-[#E0A96D]" />
                  相關風格系譜（點擊一鍵拾取入庫）
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  {#each selectedArtist.analysis.similarArtists as sim}
                    <button
                      type="button"
                      onclick={() => onpickupSimilar(sim)}
                      class="px-2.5 py-1 rounded-[2px] bg-[#14161B] hover:bg-[#20252E] hover:border-[#E0A96D] border border-[#232731] font-mono text-xs text-[#CCCFD6] hover:text-[#FEC486] transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span>+ {sim}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <!-- 待解剖空狀態 -->
            <div class="p-8 text-center bg-[#050608] border border-[#1A1D23] rounded-[3px] my-4">
              <Sparkles class="w-8 h-8 mx-auto text-[#E0A96D]/60 mb-2" />
              <p class="font-sans text-xs text-[#8E9298] mb-4">
                此唱片尚未進行 AI 深度解剖。點擊按鈕探索其創作風格與聲學特徵。
              </p>
              <TactileButton
                variant="amber"
                size="md"
                disabled={isAnalyzing}
                onclick={() => onanalyzeArtist(selectedArtist)}
              >
                {isAnalyzing ? '解剖中...' : '啟動 AI 聲學解剖'}
              </TactileButton>
            </div>
          {/if}

          <!-- 私藏筆記 -->
          <div class="mt-2 pt-3 border-t border-[#1F2228]">
            <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1">
              私藏聆聽筆記
            </h4>
            <textarea
              bind:value={selectedArtist.personalNotes}
              placeholder="記錄耳機搭配、管機音色或現場聆聽印象..."
              rows="3"
              class="w-full bg-[#040405] text-xs text-[#EEF0F2] placeholder-[#52565E] p-2.5 rounded-[3px] border border-[#1F2228] focus:border-[#E0A96D] focus:outline-none resize-none"
            ></textarea>
          </div>
        </div>
      {:else}
        <div class="py-24 text-center text-[#52565E] font-mono text-xs">
          請選擇一張唱片檢視檔案。
        </div>
      {/if}
    </aside>
  </div>
</div>
