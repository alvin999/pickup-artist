<script lang="ts">
  import type { ArtistEntry } from '$lib/types/artist';
  import SpecBadge from '$lib/components/SpecBadge.svelte';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import { Sparkles, Music, ArrowUpRight, Flame, Disc3 } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId: string | null;
    onselectArtist: (id: string) => void;
    onanalyzeArtist: (artist: ArtistEntry) => void;
  }

  let {
    artists = [],
    selectedArtistId = $bindable(null),
    onselectArtist,
    onanalyzeArtist
  }: Props = $props();

  // 互動開關狀態
  let showGravityLines = $state(true);
  let colorByDR = $state(true);
  let activeClusterCategory = $state<'all' | 'math' | 'jazz' | 'ambient'>('all');
  let zoomLevel = $state(100);

  const selectedArtist = $derived(
    artists.find((a) => a.id === selectedArtistId) || artists[0] || null
  );

  function resetView() {
    zoomLevel = 100;
    activeClusterCategory = 'all';
  }
</script>

<div class="flex flex-col w-full text-[#EEF0F2] select-none pb-12">
  <!-- 頂部 Sub-header / Studio Cluster View Toolbar -->
  <div class="flex flex-col gap-3 bg-[#0D0E11] p-4 rounded-[4px] border border-[#1F2228] mb-5 shadow-md">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <!-- 左側：RIG 編號與標題 -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-[#14161A] border border-[#E0A96D]/30 rounded-[3px] font-mono text-[10px] text-[#FEC486] uppercase">
          <span class="w-1.5 h-1.5 rounded-full bg-[#FEC486] animate-ping"></span>
          <span>RIG 04 // LAT-HARMONIC</span>
        </div>
        <div class="flex flex-col">
          <span class="font-serif text-base font-bold text-[#EEF0F2] tracking-tight">
            藝人蜂巢星系矩陣
          </span>
          <span class="font-mono text-[9px] text-[#8E9298] tracking-wider uppercase">
            ARTIST HEXAGONAL CLUSTER MATRIX // NO-FLOAT RIGID LATTICE
          </span>
        </div>
      </div>

      <!-- 中間：星系群組切換按鈕 -->
      <div class="flex items-center gap-1 bg-[#040405] p-1 rounded-[3px] border border-[#1F2228]">
        <button
          type="button"
          onclick={() => (activeClusterCategory = 'all')}
          class="px-3 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all {activeClusterCategory === 'all' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          全部星系 ({artists.length})
        </button>
        <button
          type="button"
          onclick={() => (activeClusterCategory = 'math')}
          class="px-3 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all {activeClusterCategory === 'math' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          器樂搖滾系
        </button>
        <button
          type="button"
          onclick={() => (activeClusterCategory = 'jazz')}
          class="px-3 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all {activeClusterCategory === 'jazz' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          當代爵士系
        </button>
        <button
          type="button"
          onclick={() => (activeClusterCategory = 'ambient')}
          class="px-3 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all {activeClusterCategory === 'ambient' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          原聲民謠與環境系
        </button>
      </div>

      <!-- 右側：幾何鎖定標誌 -->
      <div class="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-[#14161A] border border-[#1F2228] rounded-[3px] font-mono text-[10px] text-[#8E9298]">
        <span class="material-symbols-outlined text-[13px] text-[#FEC486]">lock</span>
        <span>非浮動物理 · 沉浸幾何 · 零飄移</span>
      </div>
    </div>

    <!-- 第二層：精準硬體撥動開關與縮放控制 -->
    <div class="flex flex-wrap items-center justify-between pt-2 border-t border-[#1F2228] text-xs">
      <div class="flex items-center gap-4">
        <!-- 顯示關聯引力線 -->
        <label class="flex items-center gap-2 cursor-pointer group select-none">
          <input
            type="checkbox"
            bind:checked={showGravityLines}
            class="hidden"
          />
          <span class="w-3.5 h-3.5 bg-[#040405] border border-[#2B2F38] rounded-[2px] flex items-center justify-center {showGravityLines ? 'border-[#E0A96D]' : ''}">
            {#if showGravityLines}
              <span class="w-1.5 h-1.5 bg-[#FEC486]"></span>
            {/if}
          </span>
          <span class="font-mono text-[11px] text-[#8E9298] group-hover:text-[#FEC486] transition-colors">
            顯示關聯引力線 (GRAVITY VECTORS)
          </span>
        </label>

        <!-- 依 DR 動態著色 -->
        <label class="flex items-center gap-2 cursor-pointer group select-none">
          <input
            type="checkbox"
            bind:checked={colorByDR}
            class="hidden"
          />
          <span class="w-3.5 h-3.5 bg-[#040405] border border-[#2B2F38] rounded-[2px] flex items-center justify-center {colorByDR ? 'border-[#E0A96D]' : ''}">
            {#if colorByDR}
              <span class="w-1.5 h-1.5 bg-[#FEC486]"></span>
            {/if}
          </span>
          <span class="font-mono text-[11px] text-[#8E9298] group-hover:text-[#FEC486] transition-colors">
            依動態範疇(DR)著色 (DR14+ AMBER TINT)
          </span>
        </label>

        <div class="h-3 w-px bg-[#1F2228] hidden sm:block"></div>
        <div class="hidden sm:flex items-center gap-1 font-mono text-[10px]">
          <span class="text-[#52565E]">LATTICE:</span>
          <span class="text-[#FEC486]">120° TRI-AXIS</span>
        </div>
      </div>

      <!-- 縮放與重設視角 -->
      <div class="flex items-center gap-2">
        <div class="flex items-center bg-[#040405] px-1.5 py-0.5 rounded-[3px] border border-[#1F2228] gap-1 font-mono text-xs">
          <button
            type="button"
            onclick={() => (zoomLevel = Math.max(70, zoomLevel - 10))}
            class="w-5 h-5 flex items-center justify-center text-[#8E9298] hover:text-white cursor-pointer"
          >
            -
          </button>
          <span class="text-[#FEC486] px-1 font-bold font-tabular">{zoomLevel}%</span>
          <button
            type="button"
            onclick={() => (zoomLevel = Math.min(140, zoomLevel + 10))}
            class="w-5 h-5 flex items-center justify-center text-[#8E9298] hover:text-white cursor-pointer"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onclick={resetView}
          class="flex items-center gap-1 px-2.5 py-1 bg-[#14161A] hover:bg-[#1E222A] text-[#8E9298] hover:text-white rounded-[3px] border border-[#1F2228] font-mono text-[10px] transition-colors cursor-pointer"
        >
          <span class="material-symbols-outlined text-[13px]">fit_screen</span>
          <span>重設視角</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 主蜂巢星系畫布 (Rigid Lattice Canvas) + 右側 Dossier 抽屜 -->
  <div class="grid grid-cols-12 gap-6 items-start">
    <!-- 蜂巢幾何星系視口 (8 欄) -->
    <div class="col-span-12 xl:col-span-8 flex flex-col gap-2">
      <div class="relative w-full h-[720px] bg-[#07080A] rounded-[4px] border border-[#1F2228] overflow-hidden shadow-2xl flex items-center justify-center">
        <!-- SVG 120° 蜂巢等角格底紋 (Calibration Grid Background) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none opacity-25" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hex-grid" width="100" height="173.2" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 50 28.86 L 0 0 L 0 57.73 L 50 86.6 L 100 57.73 Z M 50 86.6 L 0 115.47 L 0 173.2 L 50 144.33 L 100 173.2 L 100 115.47 Z" fill="none" stroke="#252A33" stroke-width="0.8"></path>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)"></rect>
        </svg>

        <!-- 關聯引力向量線 (Gravity Vectors) -->
        {#if showGravityLines}
          <svg class="absolute inset-0 w-full h-full pointer-events-none z-10" xmlns="http://www.w3.org/2000/svg">
            <!-- 中心主節點連線 -->
            <line x1="390" y1="360" x2="230" y2="260" stroke="#FEC486" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
            <line x1="390" y1="360" x2="490" y2="220" stroke="#FEC486" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
            <line x1="390" y1="360" x2="390" y2="520" stroke="#FEC486" stroke-width="2" stroke-dasharray="4 4" opacity="0.9" />
            <line x1="390" y1="360" x2="550" y2="380" stroke="#FEC486" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5" />
            <line x1="390" y1="520" x2="260" y2="590" stroke="#FEC486" stroke-width="1.5" opacity="0.8" />
            <line x1="390" y1="520" x2="500" y2="580" stroke="#FEC486" stroke-width="1.2" opacity="0.7" />
            <line x1="390" y1="520" x2="440" y2="440" stroke="#FEC486" stroke-width="1.2" opacity="0.7" />

            <!-- 同心圓刻度 -->
            <circle cx="390" cy="360" r="160" fill="none" stroke="#E0A96D" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.3" />
            <circle cx="390" cy="520" r="90" fill="none" stroke="#FA383E" stroke-width="0.75" opacity="0.3" />
          </svg>
        {/if}

        <!-- 畫布角落座標數值銘牌 (Matrix Corners) -->
        <div class="absolute top-4 left-4 z-20 flex flex-col font-mono text-[10px] text-[#8E9298]">
          <span>ORIGIN: [LAT 35.6580° // LNG 139.7016°]</span>
          <span>CLUSTER RESONANCE: <span class="text-[#FEC486] font-bold">ALPHA-LOCK 0.94</span></span>
        </div>

        <div class="absolute top-4 right-4 z-20 flex items-center gap-1.5 font-mono text-[10px] text-[#FA383E] bg-[#18080A] px-2 py-0.5 rounded border border-[#FA383E]/40">
          <span class="w-1.5 h-1.5 bg-[#FA383E] rounded-none"></span>
          <span>LOSSLESS MASTER ACTIVE</span>
        </div>

        <div class="absolute bottom-4 left-4 z-20 font-mono text-[10px] text-[#52565E]">
          AXIAL PROJECTION: ORTHOGONAL STATIC 30°
        </div>

        <div class="absolute bottom-4 right-4 z-20 font-mono text-[10px] text-[#FEC486] flex items-center gap-1">
          <span class="material-symbols-outlined text-[13px]">tune</span>
          <span>SAMPLING: 24-BIT / 96.0 KHZ</span>
        </div>

        <!-- 嚴格無飄移剛性蜂巢節點配置 (Strict Coordinate Rigid Lattice) -->
        <div
          class="relative w-[780px] h-[700px] shrink-0 transition-transform duration-300"
          style="transform: scale({zoomLevel / 100});"
        >
          <!-- 1. 中央核心流派母節點：器樂搖滾 (Math & Inst.) -->
          <div class="absolute top-[290px] left-[320px] w-36 h-36 flex items-center justify-center z-20 group">
            <div class="w-full h-full bg-[#181B22] border-2 border-[#E0A96D]/60 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-[0_0_24px_rgba(224,169,109,0.18)] transition-all group-hover:scale-105">
              <span class="material-symbols-outlined text-[#FEC486] text-[26px] mb-0.5">graphic_eq</span>
              <span class="font-serif text-sm text-[#FEC486] font-bold leading-tight">器樂搖滾</span>
              <span class="font-mono text-[10px] text-[#CCCFD6] mt-0.5">Math & Inst.</span>
              <span class="mt-1 px-1.5 py-0.2 bg-[#040405] text-[#FEC486] font-mono text-[9px] font-bold rounded">
                8 組樂手
              </span>
            </div>
          </div>

          <!-- 2. 母節點：當代爵士 (Modal Jazz Trio) -->
          <div class="absolute top-[180px] left-[150px] w-32 h-32 flex items-center justify-center z-15 group">
            <div class="w-full h-full bg-[#14161B] border border-[#2A2E38] p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-md hover:border-[#E0A96D]/50 transition-all">
              <span class="material-symbols-outlined text-[#8E9298] text-[22px] mb-0.5">album</span>
              <span class="font-serif text-xs text-[#EEF0F2] font-semibold">當代爵士</span>
              <span class="font-mono text-[10px] text-[#8E9298]">Modal Trio</span>
              <span class="mt-1 px-1.5 py-0.2 bg-[#040405] text-[#8E9298] font-mono text-[9px] rounded">12 位樂手</span>
            </div>
          </div>

          <!-- 3. 母節點：新古典鋼琴 (Acoustic Keys) -->
          <div class="absolute top-[140px] left-[420px] w-32 h-32 flex items-center justify-center z-15 group">
            <div class="w-full h-full bg-[#14161B] border border-[#2A2E38] p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-md hover:border-[#E0A96D]/50 transition-all">
              <span class="material-symbols-outlined text-[#8E9298] text-[22px] mb-0.5">piano</span>
              <span class="font-serif text-xs text-[#EEF0F2] font-semibold">新古典鋼琴</span>
              <span class="font-mono text-[10px] text-[#8E9298]">Acoustic Keys</span>
              <span class="mt-1 px-1.5 py-0.2 bg-[#040405] text-[#8E9298] font-mono text-[9px] rounded">6 位</span>
            </div>
          </div>

          <!-- 4. 母節點：氛圍民謠與後搖 (Ambient Folk) -->
          <div class="absolute top-[320px] left-[500px] w-32 h-32 flex items-center justify-center z-15 group">
            <div class="w-full h-full bg-[#14161B] border border-[#2A2E38] p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-md hover:border-[#E0A96D]/50 transition-all">
              <span class="material-symbols-outlined text-[#8E9298] text-[22px] mb-0.5">waves</span>
              <span class="font-serif text-xs text-[#EEF0F2] font-semibold">原聲民謠</span>
              <span class="font-mono text-[10px] text-[#8E9298]">Acoustic Folk</span>
              <span class="mt-1 px-1.5 py-0.2 bg-[#040405] text-[#8E9298] font-mono text-[9px] rounded">11 位</span>
            </div>
          </div>

          <!-- ================= 具體藝人實體節點 ================= -->
          {#each artists as artist}
            {@const isSelected = selectedArtistId === artist.id}
            {@const pos = artist.clusterPos || { x: 390, y: 520 }}
            <div
              role="button"
              tabindex="0"
              onclick={() => onselectArtist(artist.id)}
              onkeydown={(e) => e.key === 'Enter' && onselectArtist(artist.id)}
              class="absolute flex flex-col items-center justify-center z-30 group cursor-pointer transition-transform hover:scale-110"
              style="left: {pos.x - 45}px; top: {pos.y - 45}px; width: 90px; height: 90px;"
            >
              <!-- 節點晶片圓形/六角外框 -->
              <div class="w-full h-full rounded-full p-1 transition-all flex items-center justify-center {isSelected ? 'bg-gradient-to-tr from-[#FA383E] via-[#FEC486] to-[#FA383E] shadow-[0_0_20px_rgba(224,169,109,0.5)]' : 'bg-[#15171C] border border-[#2C313B] hover:border-[#E0A96D]'}">
                <div class="w-full h-full rounded-full bg-[#08090C] overflow-hidden relative flex flex-col items-center justify-center p-1.5 text-center">
                  {#if artist.coverImage}
                    <img
                      src={artist.coverImage}
                      alt={artist.name}
                      class="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"
                    />
                  {/if}
                  <div class="relative z-10">
                    <span class="font-serif text-[11px] font-bold text-[#EEF0F2] group-hover:text-[#FEC486] leading-tight block truncate max-w-[70px]">
                      {artist.name.split(' ')[0]}
                    </span>
                    {#if artist.dynamicRange && colorByDR}
                      <span class="font-mono text-[9px] text-[#63C78B] font-bold">
                        DR{artist.dynamicRange}
                      </span>
                    {:else if artist.status === 'inbox'}
                      <span class="font-mono text-[8px] text-[#FA383E] uppercase font-bold">
                        INBOX
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- 右側 Dossier 檢查抽屜 (4 欄) -->
    <div class="col-span-12 xl:col-span-4 bg-[#0D0E11] border border-[#1F2228] p-5 rounded-[4px] shadow-2xl flex flex-col gap-4">
      {#if selectedArtist}
        <div class="border-b border-[#1F2228] pb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="font-mono text-[10px] text-[#FEC486] uppercase font-bold flex items-center gap-1">
              <span class="w-2 h-0.5 bg-[#FEC486]"></span>
              HEX-CLUSTER NODE RECORD
            </span>
            <SpecBadge type="dr" text={selectedArtist.dynamicRange ? `DR${selectedArtist.dynamicRange}` : 'RAW'} />
          </div>

          <h3 class="font-serif text-2xl font-bold text-[#EEF0F2] mb-1">
            {selectedArtist.name}
          </h3>

          <div class="flex items-center gap-2 mt-3">
            {#if selectedArtist.appleMusicUrl}
              <a
                href={selectedArtist.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 inline-flex items-center justify-center gap-1.5 font-mono text-xs bg-[#FA383E] text-white py-2 px-3 rounded-[3px] font-semibold hover:bg-[#E0262C] shadow-[0_0_12px_rgba(250,56,62,0.3)]"
              >
                <Music class="w-3.5 h-3.5" />
                <span>Apple Music</span>
              </a>
            {/if}

            <TactileButton
              variant="amber"
              size="md"
              onclick={() => onanalyzeArtist(selectedArtist)}
              class="flex-1 py-2 text-xs"
            >
              <Sparkles class="w-3.5 h-3.5 mr-1 text-[#FEC486]" />
              <span>AI 聲學解剖</span>
            </TactileButton>
          </div>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto max-h-[520px]">
          {#if selectedArtist.analysis}
            <div>
              <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                聲響脈絡
              </h4>
              <p class="font-sans text-xs text-[#CCCFD6] leading-relaxed bg-[#050608] p-3 rounded border border-[#1A1D23]">
                {selectedArtist.analysis.summary}
              </p>
            </div>

            {#if selectedArtist.analysis.instrumentationNotes}
              <div>
                <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                  錄音質地
                </h4>
                <p class="font-mono text-xs text-[#E0A96D]/90 bg-[#12100A] p-3 rounded border border-[#E0A96D]/30 leading-relaxed">
                  {selectedArtist.analysis.instrumentationNotes}
                </p>
              </div>
            {/if}

            {#if selectedArtist.analysis.similarArtists}
              <div>
                <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                  引力連線藝人
                </h4>
                <div class="flex flex-wrap gap-1">
                  {#each selectedArtist.analysis.similarArtists as sim}
                    <span class="px-2 py-0.5 rounded bg-[#14161B] text-[#FEC486] font-mono text-xs border border-[#252A34]">
                      {sim}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div class="py-12 text-center text-[#8E9298] font-mono text-xs bg-[#050608] rounded border border-[#1A1D23]">
              點擊「AI 聲學解剖」取得完整脈絡與引力連線。
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
