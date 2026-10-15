<script lang="ts">
  import { onMount } from 'svelte';
  import type { ArtistEntry, AcousticSector } from '$lib/types/artist';
  import SpecBadge from '$lib/components/SpecBadge.svelte';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import {
    ACOUSTIC_SECTORS,
    GALAXY_CANVAS_SIZE,
    GALAXY_CENTER,
    calculateHierarchicalGalaxy,
    applyInteractiveRepulsion,
    calculateGravityVectors,
    calculateGhostDiscoveryNodes,
    type NodePosition,
    type SectorSun,
    type SubGenreNode,
    type SunToSubEdge,
    type SubToArtistEdge,
    type GravityVector,
    type GhostDiscoveryNode
  } from '$lib/utils/galaxyLayout';
  import {
    Sparkles,
    Music,
    ArrowUpRight,
    Flame,
    Disc3,
    Plus,
    Minus,
    Compass,
    Sliders,
    Eye,
    Maximize2,
    Crosshair,
    Move,
    Sun,
    Trash2,
    AlertTriangle,
    Layers
  } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    selectedArtistId: string | null;
    onselectArtist: (id: string) => void;
    ondeleteArtist?: (id: string) => void;
    onanalyzeArtist: (artist: ArtistEntry) => void;
    onpickupSimilar?: (name: string) => void;
    onupdateWeight?: (id: string, newWeight: number) => void;
    onupdatePos?: (id: string, pos: { x: number; y: number }) => void;
  }

  let {
    artists = [],
    selectedArtistId = $bindable(null),
    onselectArtist,
    ondeleteArtist,
    onanalyzeArtist,
    onpickupSimilar,
    onupdateWeight,
    onupdatePos
  }: Props = $props();

  // 視圖與畫布狀態
  let showGravityLines = $state(true);
  let colorByDR = $state(true);
  let activeSectorFilter = $state<AcousticSector | 'all' | 'inbox'>('all');
  let selectedSubGenre = $state<string | null>(null);
  let minWeightFilter = $state<number>(1); // 質量過濾閥 (1 ~ 100)
  let zoomLevel = $state(60);             // 宏觀深空初始縮放比例 (30 ~ 220)
  
  // 畫布平移狀態 (Pan)
  let panX = $state(0);
  let panY = $state(0);
  let isPanningCanvas = $state(false);
  let startCanvasPanX = $state(0);
  let startCanvasPanY = $state(0);

  // 星體節點拖曳狀態與動態互斥推力 (Interactive Elastic Repulsion)
  let draggingArtistId = $state<string | null>(null);
  let dragMouseStart = { x: 0, y: 0 };
  let dragNodeStart = { x: 0, y: 0 };
  let liveNodePosOverrides = $state<Record<string, { x: number; y: number }>>({});

  // 刪除二次確認計時器狀態
  let deleteConfirmPending = $state(false);
  let deleteCountdown = $state(3);
  let deleteTimer: ReturnType<typeof setInterval> | null = null;

  // 衍生運算：篩選後的藝人清單 (依 Sector, SubGenre 與 Weight 門檻過濾)
  const visibleArtists = $derived(
    artists.filter((a) => {
      const w = a.weight ?? 20;
      if (w < minWeightFilter) return false;

      if (activeSectorFilter === 'all') return true;
      if (activeSectorFilter === 'inbox') return a.status === 'inbox';
      const sec = a.analysis?.sector || a.clusterSector;
      if (sec !== activeSectorFilter) return false;

      if (selectedSubGenre) {
        return (a.analysis?.subGenre || 'General') === selectedSubGenre;
      }
      return true;
    })
  );

  // 衍生運算：計算三級天體拓撲架構 (太陽 ➔ Sub 實體節點 ➔ 藝人行星)
  const hierarchicalData = $derived(
    calculateHierarchicalGalaxy(visibleArtists, GALAXY_CENTER, 820)
  );

  // 合併拖曳覆寫與即時彈性互斥推力後的最終星體座標 (永久沉澱，絕不彈回貼身)
  const posMap = $derived.by(() => {
    const finalMap = new Map<string, NodePosition>();
    for (const [id, pos] of hierarchicalData.posMap.entries()) {
      const override = liveNodePosOverrides[id];

      if (override) {
        finalMap.set(id, {
          ...pos,
          x: override.x,
          y: override.y,
          isCustomPos: true
        });
      } else {
        finalMap.set(id, pos);
      }
    }
    return finalMap;
  });

  // 動態更新 Sub 節點 ➔ 藝人行星的即時分支引力連線
  const liveSubToArtistEdges = $derived.by(() => {
    return hierarchicalData.subToArtistEdges.map((edge) => {
      const p = posMap.get(edge.artistId);
      return {
        ...edge,
        to: p ? { x: p.x, y: p.y } : edge.to
      };
    });
  });

  // 衍生運算：計算跨太陽系真實引力光束
  const gravityVectors = $derived(
    calculateGravityVectors(visibleArtists, posMap, selectedArtistId)
  );

  // 目前選取的藝人實體
  const selectedArtist = $derived(
    artists.find((a) => a.id === selectedArtistId) || null
  );

  // 衍生運算：計算未收錄的幽靈探索節點
  const ghostNodes = $derived(
    calculateGhostDiscoveryNodes(selectedArtist, artists, posMap)
  );

  // 當選取藝人切換時，重設刪除確認狀態
  $effect(() => {
    if (selectedArtistId) {
      resetDeleteConfirm();
    }
  });

  function resetDeleteConfirm() {
    deleteConfirmPending = false;
    deleteCountdown = 3;
    if (deleteTimer) {
      clearInterval(deleteTimer);
      deleteTimer = null;
    }
  }

  // 二次確認防誤觸刪除
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
      if (ondeleteArtist) {
        ondeleteArtist(idToDelete);
      }
    }
  }

  // 重設視角居中
  function resetView() {
    zoomLevel = 60;
    panX = 0;
    panY = 0;
    activeSectorFilter = 'all';
    selectedSubGenre = null;
    minWeightFilter = 1;
  }

  // 聚焦目前選取的藝人
  function focusSelected() {
    if (!selectedArtist) return;
    const pos = posMap.get(selectedArtist.id);
    if (!pos) return;
    panX = (GALAXY_CENTER.x - pos.x) * (zoomLevel / 100);
    panY = (GALAXY_CENTER.y - pos.y) * (zoomLevel / 100);
  }

  // 點擊太陽母星：直達該太陽系中心
  function navigateToSun(sun: SectorSun) {
    activeSectorFilter = sun.key;
    selectedSubGenre = null;
    zoomLevel = 100;
    panX = (GALAXY_CENTER.x - sun.x) * (zoomLevel / 100);
    panY = (GALAXY_CENTER.y - sun.y) * (zoomLevel / 100);
  }

  // 點擊 Sub 實體節點：高亮並聚焦該子流派
  function navigateToSubNode(sub: SubGenreNode) {
    activeSectorFilter = sub.sectorKey;
    selectedSubGenre = selectedSubGenre === sub.name ? null : sub.name;
    zoomLevel = 115;
    panX = (GALAXY_CENTER.x - sub.x) * (zoomLevel / 100);
    panY = (GALAXY_CENTER.y - sub.y) * (zoomLevel / 100);
  }

  // 畫布背景滑鼠按下：準備平移畫布
  function handleCanvasMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.artist-star-node, .ghost-star-node, .sun-core-node, .subgenre-node, button, a, input')) return;
    isPanningCanvas = true;
    startCanvasPanX = e.clientX - panX;
    startCanvasPanY = e.clientY - panY;
  }

  // 星體節點滑鼠按下：啟動節點自由拖曳與互斥動力學
  function handleNodeMouseDown(e: MouseEvent, artistId: string) {
    e.stopPropagation();
    onselectArtist(artistId);

    const pos = posMap.get(artistId);
    if (!pos) return;

    draggingArtistId = artistId;
    dragMouseStart = { x: e.clientX, y: e.clientY };
    dragNodeStart = { x: pos.x, y: pos.y };
  }

  // 全域滑鼠移動處理 (含即時彈性連鎖互斥推力)
  function handleGlobalMouseMove(e: MouseEvent) {
    if (draggingArtistId) {
      const scale = zoomLevel / 100;
      const dx = (e.clientX - dragMouseStart.x) / scale;
      const dy = (e.clientY - dragMouseStart.y) / scale;
      const currentDraggingPos = {
        x: Math.round(dragNodeStart.x + dx),
        y: Math.round(dragNodeStart.y + dy)
      };

      // 計算與周圍節點的即時彈性互斥推力 (基於當前實時位置)
      const nodeList = Array.from(hierarchicalData.posMap.entries()).map(([id, p]) => ({
        id,
        x: liveNodePosOverrides[id]?.x ?? p.x,
        y: liveNodePosOverrides[id]?.y ?? p.y,
        size: p.size
      }));

      const pushes = applyInteractiveRepulsion(
        draggingArtistId,
        currentDraggingPos,
        nodeList,
        24
      );

      // 直接將被推開鄰居的新位置合併儲存，使排斥永久安定，絕不回彈貼合
      liveNodePosOverrides = {
        ...liveNodePosOverrides,
        ...pushes,
        [draggingArtistId]: currentDraggingPos
      };
      return;
    }

    if (isPanningCanvas) {
      panX = e.clientX - startCanvasPanX;
      panY = e.clientY - startCanvasPanY;
    }
  }

  // 全域滑鼠放開處理：將拖曳節點與被推擠鄰居的新座標永久持久化
  function handleGlobalMouseUp() {
    if (draggingArtistId) {
      const draggedId = draggingArtistId;
      draggingArtistId = null;

      // 持久化儲存拖曳者位置
      const finalPos = liveNodePosOverrides[draggedId];
      if (finalPos && onupdatePos) {
        onupdatePos(draggedId, finalPos);
      }

      // 將所有被彈開鄰居的新位置一併寫入資料庫，確保之後每一次拖曳都有空間
      for (const [id, pos] of Object.entries(liveNodePosOverrides)) {
        if (id !== draggedId && onupdatePos) {
          onupdatePos(id, pos);
        }
      }
    }
    isPanningCanvas = false;
  }

  // 智慧觸控板與滾輪手勢分離
  function handleWheel(e: WheelEvent) {
    e.preventDefault();

    if (e.altKey && selectedArtist) {
      const delta = e.deltaY < 0 ? 2 : -2;
      changeWeight(selectedArtist.id, (selectedArtist.weight ?? 20) + delta);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomLevel = Math.max(30, Math.min(220, Math.round(zoomLevel * zoomFactor)));
      return;
    }

    panX -= e.deltaX * 0.9;
    panY -= e.deltaY * 0.9;
  }

  // 調整 Weight (1 ~ 100)
  function changeWeight(artistId: string, targetWeight: number) {
    const clamped = Math.max(1, Math.min(100, Math.round(targetWeight)));
    if (onupdateWeight) {
      onupdateWeight(artistId, clamped);
    }
  }

  // 快捷鍵
  function handleKeydown(e: KeyboardEvent) {
    if (!selectedArtist) return;
    const isInputFocused = ['INPUT', 'TEXTAREA'].includes(
      (document.activeElement?.tagName || '')
    );
    if (isInputFocused) return;

    const currentW = selectedArtist.weight ?? 20;
    const step = e.shiftKey ? 10 : 2;

    if (e.key === '+' || e.key === '=' || e.key === ']') {
      e.preventDefault();
      changeWeight(selectedArtist.id, currentW + step);
    } else if (e.key === '-' || e.key === '_' || e.key === '[') {
      e.preventDefault();
      changeWeight(selectedArtist.id, currentW - step);
    } else if (e.key.toLowerCase() === 'f') {
      focusSelected();
    }
  }
</script>

<svelte:window
  onmousemove={handleGlobalMouseMove}
  onmouseup={handleGlobalMouseUp}
  onkeydown={handleKeydown}
/>

<div class="flex flex-col w-full text-[#EEF0F2] select-none pb-12">
  <!-- 頂部 Sub-header / 發燒星系控制台工具列 -->
  <div class="flex flex-col gap-3 bg-[#0D0E11] p-4 rounded-[4px] border border-[#1F2228] mb-5 shadow-md">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <!-- 左側：RIG 編號與標題 -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-[#14161A] border border-[#E0A96D]/30 rounded-[3px] font-mono text-[10px] text-[#FEC486] uppercase">
          <span class="w-1.5 h-1.5 rounded-full bg-[#FEC486] animate-ping"></span>
          <span>RIG 04 // THREE-TIER GALAXY TREE</span>
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <span class="font-serif text-base font-bold text-[#EEF0F2] tracking-tight">
              八大音樂天體系譜樹
            </span>
            <span class="px-2 py-0.5 bg-[#171A21] border border-[#2B313D] text-[#FEC486] font-mono text-[11px] rounded font-bold">
              {visibleArtists.length} / {artists.length} 藝人天體
            </span>
          </div>
          <span class="font-mono text-[9px] text-[#8E9298] tracking-wider uppercase">
            SUN ➔ SUB-GENRE NODE ➔ ARTIST PLANET // ELASTIC REPULSION
          </span>
        </div>
      </div>

      <!-- 中間：八大太陽系快速切換 -->
      <div class="flex items-center gap-1 bg-[#040405] p-1 rounded-[3px] border border-[#1F2228] overflow-x-auto max-w-full">
        <button
          type="button"
          onclick={() => {
            activeSectorFilter = 'all';
            selectedSubGenre = null;
          }}
          class="px-2.5 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all shrink-0 {activeSectorFilter === 'all' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          全宇宙全景 ({artists.length})
        </button>

        {#each hierarchicalData.suns as sun}
          <button
            type="button"
            onclick={() => navigateToSun(sun)}
            class="px-2 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all shrink-0 flex items-center gap-1.5 {activeSectorFilter === sun.key ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
          >
            <span class="w-2 h-2 rounded-full" style="background-color: {sun.color};"></span>
            <span>{sun.name.split('與')[0]}</span>
            {#if sun.artistCount > 0}
              <span class="text-[10px] opacity-70">({sun.artistCount})</span>
            {/if}
          </button>
        {/each}

        <button
          type="button"
          onclick={() => {
            activeSectorFilter = 'inbox';
            selectedSubGenre = null;
          }}
          class="px-2 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all shrink-0 text-[#FA383E] {activeSectorFilter === 'inbox' ? 'bg-[#2B0E12] font-bold border border-[#FA383E]/50' : 'hover:bg-[#1A0A0C]'}"
        >
          待探索彗星 ({artists.filter((a) => a.status === 'inbox').length})
        </button>
      </div>

      <!-- 右側：視角控制器 -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={focusSelected}
          disabled={!selectedArtist}
          class="flex items-center gap-1 px-2.5 py-1 bg-[#14161A] hover:bg-[#1E222A] disabled:opacity-40 text-[#8E9298] hover:text-[#FEC486] rounded-[3px] border border-[#1F2228] font-mono text-[11px] transition-colors cursor-pointer"
          title="聚焦目前選中的藝人 (快捷鍵 F)"
        >
          <Crosshair class="w-3.5 h-3.5 text-[#FEC486]" />
          <span>聚焦定位</span>
        </button>

        <button
          type="button"
          onclick={resetView}
          class="flex items-center gap-1 px-2.5 py-1 bg-[#14161A] hover:bg-[#1E222A] text-[#8E9298] hover:text-white rounded-[3px] border border-[#1F2228] font-mono text-[11px] transition-colors cursor-pointer"
        >
          <Maximize2 class="w-3.5 h-3.5" />
          <span>全景重設</span>
        </button>
      </div>
    </div>

    <!-- 第二層：子流派階層標籤與 Weight 質量過濾門檻 -->
    <div class="flex flex-wrap items-center justify-between pt-2.5 border-t border-[#1F2228] text-xs gap-3">
      <div class="flex flex-wrap items-center gap-4">
        <!-- 顯示跨太陽系引力線開關 -->
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
            跨星系 AI 引力光束 (GRAVITY BEAMS)
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
            DR 動態範圍著色
          </span>
        </label>

        <div class="h-3 w-px bg-[#1F2228] hidden md:block"></div>

        <!-- 1000 藝人聲學質量門檻滑桿 -->
        <div class="flex items-center gap-2 font-mono text-[11px]">
          <span class="text-[#8E9298] flex items-center gap-1">
            <Sliders class="w-3 h-3 text-[#FEC486]" />
            <span>質量門檻 (WT):</span>
          </span>
          <input
            type="range"
            min="1"
            max="80"
            step="5"
            bind:value={minWeightFilter}
            class="w-20 sm:w-28 accent-[#FEC486] cursor-pointer"
          />
          <span class="text-[#FEC486] font-bold font-tabular min-w-[32px]">
            {minWeightFilter > 1 ? `≥ ${minWeightFilter}` : 'ALL'}
          </span>
        </div>
      </div>

      <!-- 縮放數值 -->
      <div class="flex items-center gap-2">
        <span class="font-mono text-[10px] text-[#52565E]">ZOOM:</span>
        <div class="flex items-center bg-[#040405] px-1.5 py-0.5 rounded-[3px] border border-[#1F2228] gap-1 font-mono text-xs">
          <button
            type="button"
            onclick={() => (zoomLevel = Math.max(30, zoomLevel - 10))}
            class="w-5 h-5 flex items-center justify-center text-[#8E9298] hover:text-white cursor-pointer"
          >
            -
          </button>
          <span class="text-[#FEC486] px-1 font-bold font-tabular">{zoomLevel}%</span>
          <button
            type="button"
            onclick={() => (zoomLevel = Math.min(220, zoomLevel + 10))}
            class="w-5 h-5 flex items-center justify-center text-[#8E9298] hover:text-white cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 主太陽系星空畫布 + 右側 Dossier 檢查抽屜 -->
  <div class="grid grid-cols-12 gap-6 items-start">
    <!-- 宇宙深空視口 (8 欄) -->
    <div class="col-span-12 xl:col-span-8 flex flex-col gap-2">
      <div
        role="region"
        aria-label="Acoustic Hierarchical Galaxy Canvas"
        onmousedown={handleCanvasMouseDown}
        onwheel={handleWheel}
        class="relative w-full h-[750px] bg-[#040507] rounded-[4px] border border-[#1F2228] overflow-hidden shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
      >
        <!-- 畫布角落座標數值銘牌 -->
        <div class="absolute top-4 left-4 z-20 flex flex-col font-mono text-[10px] text-[#8E9298] pointer-events-none">
          <span>COSMIC TOPOLOGY: [SUN ➔ SUB-NODE ➔ PLANET]</span>
          <span>PHYSICS: <span class="text-[#FEC486] font-bold">ELASTIC REPULSIVE DRAG</span></span>
          <span class="text-[#52565E]">拖曳節點自動彈開周圍星體 · 點擊太陽或 Sub 節點切換聚焦</span>
        </div>

        <div class="absolute top-4 right-4 z-20 flex items-center gap-1.5 font-mono text-[10px] text-[#FEC486] bg-[#14161B] px-2.5 py-1 rounded border border-[#E0A96D]/30 pointer-events-none">
          <Layers class="w-3.5 h-3.5 text-[#FEC486]" />
          <span>HIERARCHICAL GRAVITY ACTIVE</span>
        </div>

        <div class="absolute bottom-4 left-4 z-20 font-mono text-[10px] text-[#52565E] pointer-events-none flex items-center gap-2">
          <Move class="w-3.5 h-3.5 text-[#FEC486]" />
          <span>DRAG STAR WITH ELASTIC PUSH // PAN WITH TRACKPAD // ALT+SCROLL WEIGHT</span>
        </div>

        <!-- 宇宙深空本體 (2600 x 2600 空間) -->
        <div
          class="relative shrink-0 transition-transform duration-75"
          style="
            width: {GALAXY_CANVAS_SIZE}px;
            height: {GALAXY_CANVAS_SIZE}px;
            transform: translate({panX}px, {panY}px) scale({zoomLevel / 100});
            transform-origin: center center;
          "
        >
          <!-- SVG 底層連線網路：太陽 ➔ Sub 節點骨幹連線、Sub ➔ 藝人分支連線、跨流派引力光束 -->
          <svg
            class="absolute inset-0 w-full h-full pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {#each hierarchicalData.suns as sun}
                <radialGradient id="sun-glow-{sun.key}" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color={sun.color} stop-opacity="0.28" />
                  <stop offset="45%" stop-color={sun.color} stop-opacity="0.08" />
                  <stop offset="100%" stop-color="#040507" stop-opacity="0" />
                </radialGradient>
              {/each}

              <radialGradient id="nexus-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FA383E" stop-opacity="0.15" />
                <stop offset="50%" stop-color="#E0A96D" stop-opacity="0.05" />
                <stop offset="100%" stop-color="#040507" stop-opacity="0" />
              </radialGradient>
            </defs>

            <!-- 宇宙中央原點 NEXUS 彗星群光環 -->
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="280" fill="url(#nexus-glow)" />
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="820" fill="none" stroke="#161820" stroke-width="1.5" stroke-dasharray="6 12" />

            <!-- 1. 太陽母星星雲輝光 -->
            {#each hierarchicalData.suns as sun}
              {@const isSunActive = activeSectorFilter === sun.key || activeSectorFilter === 'all'}
              <circle
                cx={sun.x}
                cy={sun.y}
                r="360"
                fill="url(#sun-glow-{sun.key})"
                opacity={isSunActive ? 1 : 0.2}
                class="transition-opacity duration-300"
              />
            {/each}

            <!-- 2. 【太陽 ➔ Sub 實體節點】主骨幹發光能量連線 -->
            {#each hierarchicalData.sunToSubEdges as edge (edge.id)}
              {@const isSectorActive = activeSectorFilter === edge.sunKey || activeSectorFilter === 'all'}
              <line
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                stroke={edge.color}
                stroke-width="2.2"
                stroke-opacity={isSectorActive ? 0.65 : 0.15}
                stroke-dasharray="6 4"
                class="transition-all duration-200"
              />
            {/each}

            <!-- 3. 【Sub 實體節點 ➔ 藝人行星】分支引力連線 (動態即時拉伸) -->
            {#each liveSubToArtistEdges as edge (edge.id)}
              {@const isArtistSelected = selectedArtistId === edge.artistId}
              <line
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                stroke={isArtistSelected ? '#FEC486' : edge.color}
                stroke-width={isArtistSelected ? 2 : 1}
                stroke-opacity={isArtistSelected ? 0.95 : 0.35}
              />
            {/each}

            <!-- 4. 【跨流派 AI 相似引力光束】 -->
            {#if showGravityLines}
              {#each gravityVectors as v (v.id)}
                {@const strokeColor = v.isFocused ? '#FEC486' : '#E0A96D'}
                {@const opacity = v.isFocused ? 0.95 : selectedArtistId ? 0.12 : 0.4}
                {@const strokeWidth = v.isFocused ? 2.5 : 1}
                <line
                  x1={v.sourcePos.x}
                  y1={v.sourcePos.y}
                  x2={v.targetPos.x}
                  y2={v.targetPos.y}
                  stroke={strokeColor}
                  stroke-width={strokeWidth}
                  stroke-dasharray={v.isFocused ? 'none' : '4 4'}
                  opacity={opacity}
                />
              {/each}
            {/if}

            <!-- 選取星體的引力聚焦擴散圈 -->
            {#if selectedArtist}
              {@const selPos = posMap.get(selectedArtist.id)}
              {#if selPos}
                <circle
                  cx={selPos.x}
                  cy={selPos.y}
                  r={selPos.size / 2 + 18}
                  fill="none"
                  stroke="#FEC486"
                  stroke-width="1.5"
                  stroke-dasharray="3 3"
                  opacity="0.8"
                  class="animate-spin"
                  style="transform-origin: {selPos.x}px {selPos.y}px; animation-duration: 18s;"
                />
              {/if}
            {/if}
          </svg>

          <!-- ================= 第 1 級：八大太陽母星核心 (Solar Hubs) ================= -->
          {#each hierarchicalData.suns as sun}
            <div
              role="button"
              tabindex="0"
              onclick={() => navigateToSun(sun)}
              onkeydown={(e) => e.key === 'Enter' && navigateToSun(sun)}
              title="點擊前往【{sun.name}】太陽系中心"
              class="sun-core-node absolute flex flex-col items-center justify-center cursor-pointer group z-20 transition-transform duration-300 hover:scale-110"
              style="left: {sun.x - sun.size / 2}px; top: {sun.y - sun.size / 2}px; width: {sun.size}px; height: {sun.size}px;"
            >
              <div
                class="w-full h-full rounded-full flex flex-col items-center justify-center text-center p-2 shadow-2xl relative transition-all"
                style="
                  background: radial-gradient(circle, {sun.color} 0%, {sun.secondaryColor} 70%, #08090C 100%);
                  box-shadow: 0 0 35px {sun.color}88, inset 0 0 15px rgba(255,255,255,0.4);
                  border: 2px solid {sun.color};
                "
              >
                <div
                  class="absolute inset-0 rounded-full border border-white/50 animate-ping opacity-25 pointer-events-none"
                  style="animation-duration: 4s;"
                ></div>

                <Sun class="w-5 h-5 text-white mb-0.5 drop-shadow" />
                <span class="font-serif text-[11px] font-bold text-white leading-tight drop-shadow block truncate max-w-[70px]">
                  {sun.name.split('與')[0]}
                </span>
                <span class="font-mono text-[8px] text-white/90 uppercase font-bold tracking-wider mt-0.5">
                  {sun.artistCount} 藝人
                </span>
              </div>
            </div>
          {/each}

          <!-- ================= 第 2 級：Sub 子流派實體節點 (Sub-Genre Nodes) ================= -->
          {#each hierarchicalData.subNodes as sub}
            {@const isSubActive = selectedSubGenre === sub.name}
            <div
              role="button"
              tabindex="0"
              onclick={() => navigateToSubNode(sub)}
              onkeydown={(e) => e.key === 'Enter' && navigateToSubNode(sub)}
              title="點擊聚焦【{sub.name}】子流派藝人群"
              class="subgenre-node absolute flex flex-col items-center justify-center cursor-pointer group z-25 transition-transform duration-200 hover:scale-115"
              style="left: {sub.x - sub.size / 2}px; top: {sub.y - sub.size / 2}px; width: {sub.size}px; height: {sub.size}px;"
            >
              <!-- Sub 節點晶片本體 -->
              <div
                class="w-full h-full rounded-2xl flex flex-col items-center justify-center text-center p-1.5 shadow-lg relative border transition-all {isSubActive
                  ? 'bg-[#181B24] border-2 border-[#FEC486] ring-2 ring-[#FEC486]/50'
                  : 'bg-[#0E1015] border border-[#2B303C] hover:border-[#FEC486]'}"
                style="box-shadow: {isSubActive ? `0 0 20px ${sub.color}88` : `0 0 10px ${sub.color}33`};"
              >
                <span class="font-mono text-[8px] text-[#8E9298] uppercase leading-none">SUB</span>
                <span class="font-serif text-[10px] font-bold text-[#EEF0F2] group-hover:text-[#FEC486] leading-tight block truncate max-w-[60px] mt-0.5">
                  {sub.name}
                </span>
                <span class="font-mono text-[8px] text-[#FEC486] font-bold mt-0.5">
                  {sub.artistCount}
                </span>
              </div>
            </div>
          {/each}

          <!-- 宇宙中央原點 (NEXUS 00 彗星探索原點) -->
          <div
            class="absolute pointer-events-none flex flex-col items-center justify-center text-center z-15"
            style="left: {GALAXY_CENTER.x - 45}px; top: {GALAXY_CENTER.y - 45}px; width: 90px; height: 90px;"
          >
            <div class="w-11 h-11 rounded-full bg-[#111317] border border-[#FEC486]/40 flex items-center justify-center shadow-[0_0_30px_rgba(254,196,134,0.3)]">
              <Compass class="w-5 h-5 text-[#FEC486]" />
            </div>
            <span class="font-mono text-[9px] text-[#8E9298] mt-1 font-bold">NEXUS 00</span>
          </div>

          <!-- 未收錄的幽靈探索節點 -->
          {#each ghostNodes as ghost}
            <div
              role="button"
              tabindex="0"
              onclick={() => onpickupSimilar?.(ghost.name)}
              onkeydown={(e) => e.key === 'Enter' && onpickupSimilar?.(ghost.name)}
              title="點擊「+ 拾取」AI 推薦相似藝人：{ghost.name}"
              class="ghost-star-node absolute flex flex-col items-center justify-center z-25 cursor-pointer group transition-transform hover:scale-125"
              style="left: {ghost.x - ghost.size / 2}px; top: {ghost.y - ghost.size / 2}px; width: {ghost.size}px; height: {ghost.size}px;"
            >
              <div class="w-full h-full rounded-full border-2 border-dashed border-[#FEC486]/60 bg-[#0E1014]/90 p-1 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(254,196,134,0.15)] group-hover:border-[#FEC486] group-hover:bg-[#1E1B15]">
                <Plus class="w-3.5 h-3.5 text-[#FEC486] mb-0.5 group-hover:scale-125 transition-transform" />
                <span class="font-serif text-[8px] font-bold text-[#EEF0F2] truncate max-w-[36px] text-center leading-none">
                  {ghost.name.split(' ')[0]}
                </span>
              </div>
            </div>
          {/each}

          <!-- ================= 第 3 級：具體藝人實體行星節點 (連接在 Sub 節點外圍，自帶彈性互斥推力) ================= -->
          {#each visibleArtists as artist (artist.id)}
            {@const pos = posMap.get(artist.id) || { x: GALAXY_CENTER.x, y: GALAXY_CENTER.y, size: 50 }}
            {@const isSelected = selectedArtistId === artist.id}
            {@const isDraggingThis = draggingArtistId === artist.id}
            {@const weight = artist.weight ?? 20}
            {@const isGasGiant = weight >= 70}
            {@const isDrHigh = (artist.dynamicRange ?? 0) >= 14}
            {@const haloGlow = isSelected
              ? '0 0 28px rgba(254,196,134,0.75)'
              : isGasGiant
              ? '0 0 22px rgba(224,169,109,0.5)'
              : 'none'}

            <div
              role="button"
              tabindex="0"
              onmousedown={(e) => handleNodeMouseDown(e, artist.id)}
              onkeydown={(e) => e.key === 'Enter' && onselectArtist(artist.id)}
              class="artist-star-node absolute flex flex-col items-center justify-center z-30 cursor-grab active:cursor-grabbing group {isDraggingThis ? 'z-50 scale-110' : ''}"
              style="
                left: {pos.x - pos.size / 2}px;
                top: {pos.y - pos.size / 2}px;
                width: {pos.size}px;
                height: {pos.size}px;
                transition: {isDraggingThis ? 'none' : 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, left 0.1s ease-out, top 0.1s ease-out'};
              "
            >
              <!-- 行星外環 -->
              <div
                class="w-full h-full rounded-full p-1 transition-all flex items-center justify-center {isSelected
                  ? 'bg-gradient-to-tr from-[#FA383E] via-[#FEC486] to-[#FA383E] ring-2 ring-[#FEC486]'
                  : isGasGiant
                  ? 'bg-gradient-to-tr from-[#E0A96D] via-[#1C1F26] to-[#E0A96D] border-2 border-[#E0A96D]'
                  : 'bg-[#15171C] border border-[#2C313B] hover:border-[#E0A96D]'}"
                style="box-shadow: {haloGlow};"
              >
                <!-- 行星黑膠/肖像鏡面載體 -->
                <div class="w-full h-full rounded-full bg-[#08090C] overflow-hidden relative flex flex-col items-center justify-center p-1 text-center shadow-inner">
                  {#if artist.coverImage}
                    <img
                      src={artist.coverImage}
                      alt={artist.name}
                      class="absolute inset-0 w-full h-full object-cover {isSelected ? 'opacity-75' : 'opacity-40 group-hover:opacity-70'} transition-opacity pointer-events-none"
                    />
                  {/if}

                  <!-- 行星資訊 -->
                  <div class="relative z-10 flex flex-col items-center px-1 pointer-events-none">
                    <span
                      class="font-serif font-bold text-[#EEF0F2] group-hover:text-[#FEC486] leading-tight block truncate text-center"
                      style="font-size: {Math.max(9, Math.min(13, Math.round(pos.size * 0.16)))}px; max-w: {pos.size - 12}px;"
                    >
                      {artist.name.split(' ')[0]}
                    </span>

                    <div class="flex items-center gap-1 mt-0.5">
                      <span class="font-mono text-[9px] text-[#FEC486] font-bold">
                        W{weight}
                      </span>
                      {#if artist.dynamicRange && colorByDR}
                        <span class="font-mono text-[8px] {isDrHigh ? 'text-[#63C78B]' : 'text-[#8E9298]'} font-bold">
                          DR{artist.dynamicRange}
                        </span>
                      {:else if artist.status === 'inbox'}
                        <span class="font-mono text-[7px] text-[#FA383E] uppercase font-bold px-1 bg-[#2B0E12] rounded">
                          RAW
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- 右側 Dossier 檢查抽屜與 Weight 發燒調節面板 (4 欄) -->
    <div class="col-span-12 xl:col-span-4 bg-[#0D0E11] border border-[#1F2228] p-5 rounded-[4px] shadow-2xl flex flex-col gap-4">
      {#if selectedArtist}
        {@const weight = selectedArtist.weight ?? 20}
        <div class="border-b border-[#1F2228] pb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="font-mono text-[10px] text-[#FEC486] uppercase font-bold flex items-center gap-1">
              <span class="w-2 h-0.5 bg-[#FEC486]"></span>
              HIERARCHICAL PLANET RECORD
            </span>
            <SpecBadge
              type="dr"
              text={selectedArtist.dynamicRange ? `DR${selectedArtist.dynamicRange}` : 'RAW'}
            />
          </div>

          <h3 class="font-serif text-2xl font-bold text-[#EEF0F2] mb-1">
            {selectedArtist.name}
          </h3>

          {#if selectedArtist.aliases && selectedArtist.aliases.length > 0}
            <div class="font-mono text-xs text-[#8E9298] mb-2">
              {selectedArtist.aliases.join(' / ')}
            </div>
          {/if}

          <!-- 雙層分類標章 (Sun ➔ SubNode) -->
          <div class="flex items-center gap-2 mb-3">
            <span class="px-2 py-0.5 rounded bg-[#171A21] text-[#FEC486] font-mono text-xs border border-[#E0A96D]/40 font-bold flex items-center gap-1">
              <Sun class="w-3 h-3 text-[#FEC486]" />
              <span>{selectedArtist.analysis?.sector || selectedArtist.clusterSector || 'RAW INBOX'}</span>
            </span>
            <span class="text-[#8E9298] font-mono text-xs">➔</span>
            <span class="px-2 py-0.5 rounded bg-[#101217] text-[#EEF0F2] font-mono text-xs border border-[#2B303C] flex items-center gap-1">
              <Layers class="w-3 h-3 text-[#FEC486]" />
              <span>{selectedArtist.analysis?.subGenre || '未定流派'}</span>
            </span>
          </div>

          <!-- Weight 引力權重步進調節面板 (1 ~ 100) -->
          <div class="my-3 p-3 bg-[#050608] border border-[#2B303C] rounded-[4px] flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] text-[#8E9298] font-bold flex items-center gap-1.5">
                <Flame class="w-3.5 h-3.5 text-[#FEC486]" />
                <span>天體引力質量 (GRAVITY WEIGHT)</span>
              </span>
              <span class="font-mono text-base font-bold text-[#FEC486] font-tabular">
                {weight} <span class="text-[10px] text-[#8E9298] font-normal">/ 100</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onclick={() => changeWeight(selectedArtist.id, weight - 5)}
                class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FA383E] rounded border border-[#2B303C] font-mono text-[11px] font-bold cursor-pointer"
                title="調降權重 -5"
              >
                -5
              </button>
              <button
                type="button"
                onclick={() => changeWeight(selectedArtist.id, weight - 1)}
                class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FA383E] rounded border border-[#2B303C] font-mono text-[11px] font-bold cursor-pointer"
                title="調降權重 -1 (快捷鍵 -)"
              >
                -1
              </button>

              <div class="flex-[3] px-2 flex items-center">
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={weight}
                  oninput={(e) => changeWeight(selectedArtist.id, +(e.currentTarget as HTMLInputElement).value)}
                  class="w-full accent-[#FEC486] cursor-pointer"
                />
              </div>

              <button
                type="button"
                onclick={() => changeWeight(selectedArtist.id, weight + 1)}
                class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FEC486] rounded border border-[#2B303C] font-mono text-[11px] font-bold cursor-pointer"
                title="調升權重 +1 (快捷鍵 +)"
              >
                +1
              </button>
              <button
                type="button"
                onclick={() => changeWeight(selectedArtist.id, weight + 5)}
                class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FEC486] rounded border border-[#2B303C] font-mono text-[11px] font-bold cursor-pointer"
                title="調升權重 +5"
              >
                +5
              </button>
            </div>
            <div class="flex justify-between font-mono text-[9px] text-[#52565E] pt-0.5">
              <span>小行星 (1)</span>
              <span>岩質標準星 (20)</span>
              <span>氣態巨行星 (70)</span>
              <span>超重力恆星 (100)</span>
            </div>
          </div>

          <!-- 操作按鈕列 -->
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

        <!-- 檔案脈絡與 AI 分析細節 -->
        <div class="flex flex-col gap-3 overflow-y-auto max-h-[460px] pr-1">
          {#if selectedArtist.analysis}
            <!-- 聲響脈絡介紹 -->
            <div>
              <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                聲響脈絡 (Summary)
              </h4>
              <p class="font-sans text-xs text-[#CCCFD6] leading-relaxed bg-[#050608] p-3 rounded border border-[#1A1D23]">
                {selectedArtist.analysis.summary}
              </p>
            </div>

            <!-- 錄音質地評註 -->
            {#if selectedArtist.analysis.instrumentationNotes}
              <div>
                <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                  錄音質地與聲學評註
                </h4>
                <p class="font-mono text-xs text-[#E0A96D]/90 bg-[#12100A] p-3 rounded border border-[#E0A96D]/30 leading-relaxed">
                  {selectedArtist.analysis.instrumentationNotes}
                </p>
              </div>
            {/if}

            <!-- 推薦專輯卡片矩陣 -->
            {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1.5">
                  推薦唱片精選 (Notable Works)
                </h4>
                <div class="flex flex-col gap-2">
                  {#each selectedArtist.analysis.notableAlbums as album}
                    <div class="p-2.5 bg-[#050608] rounded border border-[#1A1D23] flex flex-col gap-1">
                      <div class="flex items-center justify-between">
                        <span class="font-serif text-xs font-bold text-[#EEF0F2]">
                          {album.title} ({album.year})
                        </span>
                        <span class="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded font-bold {album.tier === 'hidden-treasure' ? 'bg-[#3A1418] text-[#FA383E] border border-[#FA383E]/40' : 'bg-[#1C1F26] text-[#FEC486]'}">
                          {album.tier === 'hidden-treasure' ? '深埋寶藏' : '時代基石'}
                        </span>
                      </div>
                      <p class="text-[11px] text-[#8E9298] leading-normal">
                        {album.description}
                      </p>
                      {#if album.audiophileHighlight}
                        <div class="text-[10px] text-[#E0A96D] font-mono mt-0.5">
                          ★ 聲學亮點: {album.audiophileHighlight}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 相似藝人晶片群 -->
            {#if selectedArtist.analysis.similarArtists && selectedArtist.analysis.similarArtists.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
                  AI 相似頻率藝人 (點擊知悉入庫)
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  {#each selectedArtist.analysis.similarArtists as sim}
                    {@const isCollected = artists.some((a) => a.name.toLowerCase() === sim.toLowerCase())}
                    <button
                      type="button"
                      onclick={() => onpickupSimilar?.(sim)}
                      class="px-2 py-0.5 rounded font-mono text-xs border transition-colors cursor-pointer flex items-center gap-1 {isCollected ? 'bg-[#14161B] text-[#FEC486] border-[#252A34]' : 'bg-[#181112] text-[#FA383E] border-[#FA383E]/40 hover:bg-[#2B0E12]'}"
                    >
                      {#if !isCollected}
                        <Plus class="w-3 h-3" />
                      {/if}
                      <span>{sim}</span>
                      {#if isCollected}
                        <span class="text-[9px] text-[#63C78B]">✓</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div class="py-12 text-center text-[#8E9298] font-mono text-xs bg-[#050608] rounded border border-[#1A1D23] p-6 flex flex-col items-center gap-2">
              <Sparkles class="w-6 h-6 text-[#FEC486] animate-pulse" />
              <span class="font-bold text-[#EEF0F2]">此星體尚未進行 AI 聲學解剖</span>
              <p class="text-[11px] text-[#52565E]">
                點擊上方「AI 聲學解剖」，由音樂學家分析雙層分類歸屬與深埋寶藏專輯。
              </p>
            </div>
          {/if}
        </div>

        <!-- 底部危險操作區：二次確認防誤觸移除按鈕 -->
        <div class="pt-3 border-t border-[#1F2228] mt-auto">
          <button
            type="button"
            onclick={handleTriggerDelete}
            class="w-full py-2 px-3 rounded-[3px] font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 {deleteConfirmPending
              ? 'bg-[#FA383E] text-white shadow-[0_0_16px_rgba(250,56,62,0.6)] animate-pulse'
              : 'bg-[#14161B] hover:bg-[#1E1113] text-[#8E9298] hover:text-[#FA383E] border border-[#2B303C] hover:border-[#FA383E]/50'}"
          >
            {#if deleteConfirmPending}
              <AlertTriangle class="w-4 h-4 text-white" />
              <span>確認移除「{selectedArtist.name}」？ ({deleteCountdown}s)</span>
            {:else}
              <Trash2 class="w-3.5 h-3.5 text-[#8E9298]" />
              <span>自星系與庫存中移除藝人</span>
            {/if}
          </button>
        </div>
      {:else}
        <div class="py-24 text-center text-[#8E9298] font-mono text-xs">
          請在星空畫布中點選任一星體檢視檔案。
        </div>
      {/if}
    </div>
  </div>
</div>
