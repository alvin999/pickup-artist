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
    Layers,
    Search,
    Users,
    ArrowLeft,
    ListFilter,
    X,
    FolderKanban,
    ChevronRight,
    RotateCcw,
    ZoomIn,
    ZoomOut,
    Orbit,
    Guitar,
    Landmark,
    Waves,
    Cpu,
    Activity,
    Globe
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

  // 攝影機飛行動態與畫布容器引用 (Google Map 式平滑縮放航行)
  let isFlying = $state(false);
  let flyTimeout: ReturnType<typeof setTimeout> | null = null;
  let canvasViewportEl = $state<HTMLElement | null>(null);

  // 雷達小地圖拖曳狀態與 DOM 引用
  let isDraggingMinimap = $state(false);
  let radarBoxEl = $state<HTMLElement | null>(null);

  // 側邊欄面板模式：'roster' (類別/子流派藝人名錄) | 'dossier' (單星檔案)
  let panelViewMode = $state<'roster' | 'dossier'>('roster');
  let rosterSearchQuery = $state('');
  let rosterSortBy = $state<'weight' | 'dr' | 'name'>('weight');
  
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

  // 衍生運算：當前大類別定義
  const activeSectorDef = $derived(
    activeSectorFilter !== 'all' && activeSectorFilter !== 'inbox'
      ? ACOUSTIC_SECTORS.find((s) => s.key === activeSectorFilter) || null
      : null
  );

  // 衍生運算：當前分類名稱與主題色
  const currentCategoryTitle = $derived.by(() => {
    if (activeSectorFilter === 'inbox') return '待探索彗星 (RAW INBOX)';
    if (activeSectorFilter === 'all') return '全宇宙全星系';
    return activeSectorDef ? `${activeSectorDef.name} (${activeSectorDef.nameEn})` : activeSectorFilter;
  });

  const currentCategoryColor = $derived.by(() => {
    if (activeSectorFilter === 'inbox') return '#FA383E';
    if (activeSectorFilter === 'all') return '#FEC486';
    return activeSectorDef?.color || '#FEC486';
  });

  // 衍生運算：當前大類別下所有子流派與藝人數統計
  const availableSubGenres = $derived.by(() => {
    if (activeSectorFilter === 'all' || activeSectorFilter === 'inbox') {
      return [];
    }
    const sectorArtists = artists.filter(
      (a) => (a.analysis?.sector || a.clusterSector) === activeSectorFilter
    );
    const counts: Record<string, number> = {};
    for (const a of sectorArtists) {
      const sub = a.analysis?.subGenre || 'General';
      counts[sub] = (counts[sub] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  });

  // 衍生運算：符合當前大類別 / 子類別與搜尋條件的名錄藝人清單 (Roster)
  const rosterArtists = $derived.by(() => {
    let list = artists.filter((a) => {
      // 依大類過濾
      if (activeSectorFilter === 'inbox') {
        if (a.status !== 'inbox') return false;
      } else if (activeSectorFilter !== 'all') {
        const sec = a.analysis?.sector || a.clusterSector;
        if (sec !== activeSectorFilter) return false;
      }

      // 依子類過濾
      if (selectedSubGenre) {
        const sub = a.analysis?.subGenre || 'General';
        if (sub !== selectedSubGenre) return false;
      }

      // 依搜尋字詞過濾
      if (rosterSearchQuery.trim()) {
        const q = rosterSearchQuery.trim().toLowerCase();
        const matchName = a.name.toLowerCase().includes(q);
        const matchAlias = a.aliases?.some((al) => al.toLowerCase().includes(q));
        const matchSub = (a.analysis?.subGenre || '').toLowerCase().includes(q);
        if (!matchName && !matchAlias && !matchSub) return false;
      }

      return true;
    });

    // 排序
    const sorted = [...list];
    if (rosterSortBy === 'weight') {
      sorted.sort((a, b) => (b.weight ?? 20) - (a.weight ?? 20));
    } else if (rosterSortBy === 'dr') {
      sorted.sort((a, b) => (b.dynamicRange ?? 0) - (a.dynamicRange ?? 0));
    } else if (rosterSortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  });

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

  // 平滑飛行動態 (Google Map 式攝影機航行)
  function flyTo(targetPanX: number, targetPanY: number, targetZoom?: number, duration = 650) {
    if (flyTimeout) {
      clearTimeout(flyTimeout);
      flyTimeout = null;
    }
    isFlying = true;
    panX = Math.round(targetPanX);
    panY = Math.round(targetPanY);
    if (targetZoom !== undefined) {
      zoomLevel = Math.max(30, Math.min(220, Math.round(targetZoom)));
    }
    flyTimeout = setTimeout(() => {
      isFlying = false;
      flyTimeout = null;
    }, duration);
  }

  // 重設視角居中 (一鍵全宇宙全景)
  function resetView() {
    activeSectorFilter = 'all';
    selectedSubGenre = null;
    minWeightFilter = 1;
    flyTo(0, 0, 60);
  }

  // 聚焦目前選取的藝人
  function focusSelected() {
    if (!selectedArtist) return;
    const pos = posMap.get(selectedArtist.id);
    if (!pos) return;
    const targetZoom = Math.max(125, zoomLevel);
    const targetPanX = (GALAXY_CENTER.x - pos.x) * (targetZoom / 100);
    const targetPanY = (GALAXY_CENTER.y - pos.y) * (targetZoom / 100);
    flyTo(targetPanX, targetPanY, targetZoom);
  }

  // 點擊太陽母星：Google Maps 俯衝飛向該太陽系中心，並切換為名錄模式
  function navigateToSun(sun: SectorSun) {
    activeSectorFilter = sun.key;
    selectedSubGenre = null;
    panelViewMode = 'roster';
    const targetZoom = 110;
    const targetPanX = (GALAXY_CENTER.x - sun.x) * (targetZoom / 100);
    const targetPanY = (GALAXY_CENTER.y - sun.y) * (targetZoom / 100);
    flyTo(targetPanX, targetPanY, targetZoom);
  }

  // 點擊 Sub 實體節點：高亮並俯衝聚焦該子流派
  function navigateToSubNode(sub: SubGenreNode) {
    activeSectorFilter = sub.sectorKey;
    selectedSubGenre = selectedSubGenre === sub.name ? null : sub.name;
    panelViewMode = 'roster';
    const targetZoom = 135;
    const targetPanX = (GALAXY_CENTER.x - sub.x) * (targetZoom / 100);
    const targetPanY = (GALAXY_CENTER.y - sub.y) * (targetZoom / 100);
    flyTo(targetPanX, targetPanY, targetZoom);
  }

  // 點選子流派快速過濾標籤膠囊
  function selectSubGenreFilter(subName: string | null) {
    selectedSubGenre = subName;
    panelViewMode = 'roster';
    if (subName) {
      const subNode = hierarchicalData.subNodes.find((s) => s.name === subName);
      if (subNode) {
        const targetZoom = 135;
        const targetPanX = (GALAXY_CENTER.x - subNode.x) * (targetZoom / 100);
        const targetPanY = (GALAXY_CENTER.y - subNode.y) * (targetZoom / 100);
        flyTo(targetPanX, targetPanY, targetZoom);
      }
    } else if (activeSectorFilter !== 'all' && activeSectorFilter !== 'inbox') {
      const sun = hierarchicalData.suns.find((s) => s.key === activeSectorFilter);
      if (sun) {
        navigateToSun(sun);
      }
    }
  }

  // 從名錄中點選藝人卡片：鏡頭平滑飛航聚焦至該星體
  function selectArtistFromRoster(artistId: string) {
    onselectArtist(artistId);
    panelViewMode = 'dossier';
    const pos = posMap.get(artistId);
    if (pos) {
      const targetZoom = Math.max(125, zoomLevel);
      const targetPanX = (GALAXY_CENTER.x - pos.x) * (targetZoom / 100);
      const targetPanY = (GALAXY_CENTER.y - pos.y) * (targetZoom / 100);
      flyTo(targetPanX, targetPanY, targetZoom);
    }
  }

  // 畫布空白處雙擊：以點擊位置平滑拉近放大
  function handleCanvasDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.artist-star-node, .ghost-star-node, .sun-core-node, .subgenre-node, .minimap-radar, .hud-controls, button, a, input')) return;
    const targetZoom = Math.min(220, Math.round(zoomLevel * 1.35));
    if (!canvasViewportEl) {
      flyTo(panX, panY, targetZoom, 500);
      return;
    }
    const rect = canvasViewportEl.getBoundingClientRect();
    const mouseOffsetX = e.clientX - (rect.left + rect.width / 2);
    const mouseOffsetY = e.clientY - (rect.top + rect.height / 2);
    const ratio = targetZoom / zoomLevel;
    const targetPanX = panX * ratio - mouseOffsetX * (ratio - 1);
    const targetPanY = panY * ratio - mouseOffsetY * (ratio - 1);
    flyTo(targetPanX, targetPanY, targetZoom, 500);
  }

  // 透過雷達更新主視野 (支援單擊飛航與即時按住拖曳)
  function updateViewFromMinimap(clientX: number, clientY: number, smooth = false) {
    if (!radarBoxEl) return;
    const rect = radarBoxEl.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const worldX = (clampedX / rect.width) * GALAXY_CANVAS_SIZE;
    const worldY = (clampedY / rect.height) * GALAXY_CANVAS_SIZE;

    const targetPanX = (GALAXY_CENTER.x - worldX) * (zoomLevel / 100);
    const targetPanY = (GALAXY_CENTER.y - worldY) * (zoomLevel / 100);

    if (smooth) {
      flyTo(targetPanX, targetPanY);
    } else {
      if (isFlying) isFlying = false;
      panX = Math.round(targetPanX);
      panY = Math.round(targetPanY);
    }
  }

  // 雷達小地圖按下滑鼠：開啟即時拖曳導航
  function handleMinimapMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingMinimap = true;
    updateViewFromMinimap(e.clientX, e.clientY, false);
  }

  // 雷達小地圖即時相機視野框 (Minimap Viewport Rect - 基準 124px)
  const radarCameraBox = $derived.by(() => {
    const scale = zoomLevel / 100;
    const vpW = canvasViewportEl?.clientWidth ?? 900;
    const vpH = canvasViewportEl?.clientHeight ?? 750;
    const visibleWorldW = vpW / scale;
    const visibleWorldH = vpH / scale;
    const camCenterX = GALAXY_CENTER.x - panX / scale;
    const camCenterY = GALAXY_CENTER.y - panY / scale;

    const radarSize = 124;
    const ratio = radarSize / GALAXY_CANVAS_SIZE;

    const w = Math.min(radarSize, Math.max(12, visibleWorldW * ratio));
    const h = Math.min(radarSize, Math.max(12, visibleWorldH * ratio));
    const x = Math.max(0, Math.min(radarSize - w, (camCenterX - visibleWorldW / 2) * ratio));
    const y = Math.max(0, Math.min(radarSize - h, (camCenterY - visibleWorldH / 2) * ratio));

    return { x, y, w, h };
  });

  // 畫布背景滑鼠按下：準備平移畫布
  function handleCanvasMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.artist-star-node, .ghost-star-node, .sun-core-node, .subgenre-node, .minimap-radar, .hud-controls, button, a, input')) return;
    if (isFlying) isFlying = false;
    isPanningCanvas = true;
    startCanvasPanX = e.clientX - panX;
    startCanvasPanY = e.clientY - panY;
  }

  // 星體節點滑鼠按下：啟動節點自由拖曳與互斥動力學，並切換至單星檔案
  function handleNodeMouseDown(e: MouseEvent, artistId: string) {
    e.stopPropagation();
    onselectArtist(artistId);
    panelViewMode = 'dossier';

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

    if (isDraggingMinimap) {
      updateViewFromMinimap(e.clientX, e.clientY, false);
      return;
    }

    if (isPanningCanvas) {
      panX = e.clientX - startCanvasPanX;
      panY = e.clientY - startCanvasPanY;
    }
  }

  // 全域滑鼠放開處理：將拖曳節點與被推擠鄰居的新座標永久持久化
  function handleGlobalMouseUp() {
    if (isDraggingMinimap) {
      isDraggingMinimap = false;
    }

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
    const isInputFocused = ['INPUT', 'TEXTAREA'].includes(
      (document.activeElement?.tagName || '')
    );
    if (isInputFocused) return;

    // 全局導航快捷鍵
    if (e.key.toLowerCase() === 'r' || e.key === 'Home' || e.key === '0') {
      e.preventDefault();
      resetView();
      return;
    }

    if (e.key.toLowerCase() === 'f' && selectedArtist) {
      e.preventDefault();
      focusSelected();
      return;
    }

    // 若有選取藝人，+/- 調整該藝人 weight；若按 Ctrl 或無選取，則為全景縮放
    if (selectedArtist && !e.ctrlKey && !e.metaKey) {
      const currentW = selectedArtist.weight ?? 20;
      const step = e.shiftKey ? 10 : 2;

      if (e.key === '+' || e.key === '=' || e.key === ']') {
        e.preventDefault();
        changeWeight(selectedArtist.id, currentW + step);
      } else if (e.key === '-' || e.key === '_' || e.key === '[') {
        e.preventDefault();
        changeWeight(selectedArtist.id, currentW - step);
      }
    } else {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomLevel = Math.min(220, zoomLevel + 10);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomLevel = Math.max(30, zoomLevel - 10);
      }
    }
  }
</script>

<svelte:window
  onmousemove={handleGlobalMouseMove}
  onmouseup={handleGlobalMouseUp}
  onkeydown={handleKeydown}
/>

{#snippet sectorIcon(iconName: string, className = "w-4 h-4")}
  {#if iconName === 'Guitar'}
    <Guitar class={className} />
  {:else if iconName === 'Flame'}
    <Flame class={className} />
  {:else if iconName === 'Landmark'}
    <Landmark class={className} />
  {:else if iconName === 'Disc3'}
    <Disc3 class={className} />
  {:else if iconName === 'Waves'}
    <Waves class={className} />
  {:else if iconName === 'Cpu'}
    <Cpu class={className} />
  {:else if iconName === 'Activity'}
    <Activity class={className} />
  {:else if iconName === 'Globe'}
    <Globe class={className} />
  {:else}
    <Orbit class={className} />
  {/if}
{/snippet}

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

      <!-- 中間：八大太陽系快速切換 (配有專屬流派徽章) -->
      <div class="flex items-center gap-1 bg-[#040405] p-1 rounded-[3px] border border-[#1F2228] overflow-x-auto max-w-full">
        <button
          type="button"
          onclick={resetView}
          class="px-2.5 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all shrink-0 flex items-center gap-1.5 {activeSectorFilter === 'all' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
          title="重設攝影機至宇宙全景 (快捷鍵 R / Home / 0)"
        >
          <Orbit class="w-3.5 h-3.5 text-[#FEC486]" />
          <span>全宇宙 ({artists.length})</span>
        </button>

        {#each hierarchicalData.suns as sun}
          <button
            type="button"
            onclick={() => navigateToSun(sun)}
            class="px-2.5 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all shrink-0 flex items-center gap-1.5 {activeSectorFilter === sun.key ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            title="前往【{sun.name}】太陽系 (Google Map 飛行航行)"
          >
            <span style="color: {sun.color};">
              {@render sectorIcon(sun.icon, "w-3.5 h-3.5")}
            </span>
            <span>{sun.shortName}</span>
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
            panelViewMode = 'roster';
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
          <span>聚焦定位 [F]</span>
        </button>

        <button
          type="button"
          onclick={resetView}
          class="flex items-center gap-1 px-2.5 py-1 bg-[#14161A] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FEC486] rounded-[3px] border border-[#1F2228] font-mono text-[11px] transition-colors cursor-pointer group"
          title="攝影機鏡頭拉回全宇宙 (快捷鍵 R / Home / 0)"
        >
          <Orbit class="w-3.5 h-3.5 text-[#FEC486] group-hover:rotate-45 transition-transform duration-300" />
          <span>全宇宙 [R]</span>
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

      <!-- 右側提示說明 (Zoom 控制已整合進星系畫布右下角 HUD) -->
      <div class="flex items-center gap-2 font-mono text-[10px] text-[#636873]">
        <span class="px-2 py-0.5 bg-[#14161B] border border-[#1F2228] rounded text-[#8E9298]">
          畫布空白處雙擊放大 · 滾輪或 HUD 縮放
        </span>
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
        bind:this={canvasViewportEl}
        onmousedown={handleCanvasMouseDown}
        ondblclick={handleCanvasDblClick}
        onwheel={handleWheel}
        class="relative w-full h-[750px] bg-[#040507] rounded-[4px] border border-[#1F2228] overflow-hidden shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
      >
        <!-- 畫布左上角：麵包屑巡航列與狀態 (Cosmic Breadcrumbs) -->
        <div class="absolute top-4 left-4 z-20 flex flex-col gap-1.5 font-mono text-[11px] pointer-events-auto">
          <!-- 麵包屑導航條 -->
          <div class="flex items-center gap-1.5 bg-[#0C0E13]/85 backdrop-blur-md px-3 py-1.5 rounded border border-[#2B303C] shadow-lg">
            <button
              type="button"
              onclick={resetView}
              class="text-[#FEC486] hover:text-white flex items-center gap-1 font-bold cursor-pointer transition-colors"
              title="返回全宇宙全景 (快捷鍵 R / Home / 0)"
            >
              <Compass class="w-3.5 h-3.5 text-[#FEC486]" />
              <span>宇宙全景</span>
            </button>

            {#if activeSectorDef}
              <ChevronRight class="w-3 h-3 text-[#52565E]" />
              <button
                type="button"
                onclick={() => {
                  selectedSubGenre = null;
                  const sun = hierarchicalData.suns.find((s) => s.key === activeSectorFilter);
                  if (sun) navigateToSun(sun);
                }}
                class="hover:text-white font-bold cursor-pointer transition-colors flex items-center gap-1"
                style="color: {activeSectorDef.color};"
                title="返回【{activeSectorDef.name}】"
              >
                <span>{activeSectorDef.shortName}</span>
              </button>
            {/if}

            {#if selectedSubGenre}
              <ChevronRight class="w-3 h-3 text-[#52565E]" />
              <button
                type="button"
                onclick={() => selectSubGenreFilter(selectedSubGenre)}
                class="text-[#EEF0F2] hover:text-[#FEC486] font-bold cursor-pointer transition-colors"
                title="聚焦子流派【{selectedSubGenre}】"
              >
                <span>{selectedSubGenre}</span>
              </button>
            {/if}

            {#if selectedArtist}
              <ChevronRight class="w-3 h-3 text-[#52565E]" />
              <button
                type="button"
                onclick={focusSelected}
                class="text-[#FEC486] hover:underline font-serif font-bold truncate max-w-[120px] cursor-pointer"
                title="聚焦【{selectedArtist.name}】(快捷鍵 F)"
              >
                {selectedArtist.name}
              </button>
            {/if}
          </div>

          <div class="flex items-center gap-2 text-[10px] text-[#8E9298] px-1 pointer-events-none">
            <span>PHYSICS: <span class="text-[#FEC486] font-bold">ELASTIC DRAG</span></span>
            <span class="text-[#52565E]">·</span>
            <span>空白處雙擊放大 · 滾輪或右下 HUD 縮放</span>
          </div>
        </div>

        <!-- 畫布右上角：系統狀態標籤 -->
        <div class="absolute top-4 right-4 z-20 flex items-center gap-1.5 font-mono text-[10px] text-[#FEC486] bg-[#14161B]/85 backdrop-blur-md px-2.5 py-1.5 rounded border border-[#E0A96D]/30 pointer-events-none shadow-lg">
          <Layers class="w-3.5 h-3.5 text-[#FEC486]" />
          <span>{isFlying ? 'FLY-TO PROPULSION ACTIVE' : 'HIERARCHICAL GRAVITY ACTIVE'}</span>
        </div>

        <!-- 畫布左下角：微型宇宙雷達小地圖 (Minimap HUD) - 完美置中，支援點擊巡航與按住拖曳 -->
        <div
          role="region"
          aria-label="Galaxy Minimap Radar"
          class="minimap-radar absolute bottom-4 left-4 z-20 flex flex-col items-center bg-[#08090C]/92 backdrop-blur-md rounded border border-[#2B303C] p-2.5 shadow-2xl pointer-events-auto select-none w-[148px]"
        >
          <!-- 頂部標題與狀態 (等寬對齊，字體精簡不換行重疊) -->
          <div class="flex items-center justify-between w-full mb-2 px-0.5 font-mono text-[9px]">
            <span class="flex items-center gap-1 text-[#FEC486] font-bold tracking-tight">
              <Compass class="w-3 h-3 text-[#FEC486] {isFlying ? 'animate-spin' : ''}" style="animation-duration: 4s;" />
              RADAR
            </span>
            <span class="text-[8px] font-mono tracking-wider uppercase font-semibold {isDraggingMinimap ? 'text-[#FEC486]' : 'text-[#8E9298]'}">
              {isDraggingMinimap ? 'DRAGGING' : 'DRAG / CLICK'}
            </span>
          </div>

          <!-- 雷達視窗畫布本體 (124x124，卡片內置中對齊) -->
          <div
            role="button"
            tabindex="0"
            bind:this={radarBoxEl}
            onmousedown={handleMinimapMouseDown}
            onkeydown={(e) => e.key === 'Enter' && resetView()}
            class="relative w-[124px] h-[124px] bg-[#040507] rounded border border-[#1A1D24] overflow-hidden {isDraggingMinimap ? 'cursor-grabbing' : 'cursor-grab'} group shadow-inner"
            title="按住滑鼠左鍵可拖曳相機視野，點擊任意位置可直接飛航"
          >
            <!-- 雷達網格與同心圓 (中心點在 62px, 62px 幾何置中) -->
            <div class="absolute inset-0 pointer-events-none opacity-20">
              <div class="w-full h-px bg-[#FEC486] absolute top-[62px] left-0"></div>
              <div class="h-full w-px bg-[#FEC486] absolute left-[62px] top-0"></div>
              <div class="w-[86px] h-[86px] rounded-full border border-[#FEC486] absolute left-[19px] top-[19px]"></div>
              <div class="w-[42px] h-[42px] rounded-full border border-[#FEC486] absolute left-[41px] top-[41px]"></div>
            </div>

            <!-- 8 大太陽光點標記 (完全幾何對稱置中) -->
            {#each hierarchicalData.suns as sun}
              {@const rx = (sun.x / GALAXY_CANVAS_SIZE) * 124}
              {@const ry = (sun.y / GALAXY_CANVAS_SIZE) * 124}
              {@const isSunActive = activeSectorFilter === sun.key}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  navigateToSun(sun);
                }}
                class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-transform hover:scale-150 z-10"
                style="
                  left: {rx}px;
                  top: {ry}px;
                  width: {isSunActive ? 8 : 6}px;
                  height: {isSunActive ? 8 : 6}px;
                  background-color: {sun.color};
                  box-shadow: 0 0 {isSunActive ? '8px' : '3px'} {sun.color};
                "
                title="前往 {sun.name} ({sun.shortName})"
              ></button>
            {/each}

            <!-- 中央原點 NEXUS 標記 (精確置中在 62px, 62px) -->
            <div
              class="absolute w-1.5 h-1.5 rounded-full bg-[#FA383E] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style="left: 62px; top: 62px;"
            ></div>

            <!-- 即時相機視口矩形框 (Camera Viewport Frame) -->
            <div
              class="absolute border border-[#FEC486] bg-[#FEC486]/15 rounded-[1px] pointer-events-none transition-all duration-75 {isDraggingMinimap ? 'border-[#FFA552] bg-[#FFA552]/25 ring-1 ring-[#FFA552]' : ''}"
              style="
                left: {radarCameraBox.x}px;
                top: {radarCameraBox.y}px;
                width: {radarCameraBox.w}px;
                height: {radarCameraBox.h}px;
                box-shadow: 0 0 {isDraggingMinimap ? '12px rgba(255,165,82,0.7)' : '6px rgba(254,196,134,0.4)'};
              "
            ></div>
          </div>
        </div>

        <!-- 畫布右下角：全功能星系 HUD 導航控制台 (Floating Cosmic Navigator HUD) -->
        <div class="hud-controls absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto select-none">
          <div class="flex items-center gap-1.5 bg-[#08090C]/90 backdrop-blur-md p-1.5 rounded border border-[#2B303C] shadow-2xl font-mono">
            <!-- 縮小按鈕 -->
            <button
              type="button"
              onclick={() => flyTo(panX, panY, Math.max(30, zoomLevel - 15), 300)}
              class="w-7 h-7 flex items-center justify-center bg-[#12141A] hover:bg-[#1C2029] text-[#8E9298] hover:text-white rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer"
              title="縮小視野 (快捷鍵 -)"
            >
              <Minus class="w-3.5 h-3.5" />
            </button>

            <!-- 縮放數值膠囊 (點擊平滑重設為 100%) -->
            <button
              type="button"
              onclick={() => flyTo(panX, panY, 100, 350)}
              class="px-2.5 h-7 flex items-center justify-center bg-[#12141A] hover:bg-[#1C2029] text-[#FEC486] hover:text-[#FFA552] text-xs font-bold rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer"
              title="重設為 1:1 標準比例 (100%)"
            >
              <span>{zoomLevel}%</span>
            </button>

            <!-- 放大按鈕 -->
            <button
              type="button"
              onclick={() => flyTo(panX, panY, Math.min(220, zoomLevel + 15), 300)}
              class="w-7 h-7 flex items-center justify-center bg-[#12141A] hover:bg-[#1C2029] text-[#8E9298] hover:text-white rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer"
              title="放大視野 (快捷鍵 +)"
            >
              <Plus class="w-3.5 h-3.5" />
            </button>

            <div class="h-4 w-px bg-[#2B303C] mx-0.5"></div>

            <!-- 一鍵全宇宙按鈕 (Orbit Reset View) -->
            <button
              type="button"
              onclick={resetView}
              class="h-7 px-2.5 flex items-center gap-1.5 bg-[#12141A] hover:bg-[#1C2029] text-[#8E9298] hover:text-[#FEC486] text-xs rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer group"
              title="攝影機鏡頭拉回全宇宙 (快捷鍵 R / Home / 0)"
            >
              <Orbit class="w-3.5 h-3.5 text-[#FEC486] group-hover:rotate-45 transition-transform duration-300" />
              <span class="hidden sm:inline text-[11px] font-bold text-[#EEF0F2] group-hover:text-[#FEC486]">全宇宙 [R]</span>
            </button>

            <!-- 聚焦藝人按鈕 -->
            <button
              type="button"
              onclick={focusSelected}
              disabled={!selectedArtist}
              class="h-7 px-2.5 flex items-center gap-1 bg-[#12141A] hover:bg-[#1C2029] disabled:opacity-40 text-[#8E9298] hover:text-[#FEC486] text-xs rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer"
              title="聚焦當前藝人 (快捷鍵 F)"
            >
              <Crosshair class="w-3.5 h-3.5" />
              <span class="hidden sm:inline text-[11px] font-bold">聚焦 [F]</span>
            </button>
          </div>
        </div>

        <!-- 宇宙深空本體 (2600 x 2600 空間，Google Map 式航行平滑過渡) -->
        <div
          class="relative shrink-0"
          style="
            width: {GALAXY_CANVAS_SIZE}px;
            height: {GALAXY_CANVAS_SIZE}px;
            transform: translate({panX}px, {panY}px) scale({zoomLevel / 100});
            transform-origin: center center;
            transition: {isFlying
              ? 'transform 650ms cubic-bezier(0.16, 1, 0.3, 1)'
              : isPanningCanvas || draggingArtistId
              ? 'none'
              : 'transform 80ms ease-out'};
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
                  <stop offset="0%" stop-color={sun.color} stop-opacity="0.38" />
                  <stop offset="35%" stop-color={sun.secondaryColor} stop-opacity="0.16" />
                  <stop offset="70%" stop-color={sun.color} stop-opacity="0.05" />
                  <stop offset="100%" stop-color="#040507" stop-opacity="0" />
                </radialGradient>
              {/each}

              <radialGradient id="nexus-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FA383E" stop-opacity="0.18" />
                <stop offset="50%" stop-color="#E0A96D" stop-opacity="0.06" />
                <stop offset="100%" stop-color="#040507" stop-opacity="0" />
              </radialGradient>
            </defs>

            <!-- 宇宙中央原點 NEXUS 彗星群光環 -->
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="280" fill="url(#nexus-glow)" />
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="820" fill="none" stroke="#161820" stroke-width="1.5" stroke-dasharray="6 12" />

            <!-- 1. 太陽母星三大層級星雲氣旋與電漿環 (480px 領地輝光) -->
            {#each hierarchicalData.suns as sun}
              {@const isSunActive = activeSectorFilter === sun.key || activeSectorFilter === 'all'}
              <!-- 巨集星雲光暈領地 (Radius 480px) -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="480"
                fill="url(#sun-glow-{sun.key})"
                opacity={isSunActive ? 1 : 0.18}
                class="transition-opacity duration-500"
              />
              <!-- 旋轉電漿能量軌道環 (Radius 140px，自轉動畫) -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="140"
                fill="none"
                stroke={sun.color}
                stroke-width="1.5"
                stroke-dasharray="5 10"
                stroke-opacity={isSunActive ? 0.55 : 0.15}
                class="animate-spin"
                style="transform-origin: {sun.x}px {sun.y}px; animation-duration: 60s;"
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

          <!-- ================= 第 1 級：八大太陽母星核心 (Solar Hubs - 120px 超巨星大張力) ================= -->
          {#each hierarchicalData.suns as sun}
            {@const isSunActive = activeSectorFilter === sun.key || activeSectorFilter === 'all'}
            <div
              role="button"
              tabindex="0"
              onclick={() => navigateToSun(sun)}
              onkeydown={(e) => e.key === 'Enter' && navigateToSun(sun)}
              title="點擊前往【{sun.name}】太陽系中心 (Google Map 航行)"
              class="sun-core-node absolute flex flex-col items-center justify-center cursor-pointer group z-20 transition-transform duration-300 hover:scale-108"
              style="left: {sun.x - sun.size / 2}px; top: {sun.y - sun.size / 2}px; width: {sun.size}px; height: {sun.size}px;"
            >
              <!-- 電漿日冕旋轉能量環 (Corona Plasma Ring) -->
              <div
                class="absolute -inset-4 rounded-full border border-dashed pointer-events-none transition-opacity duration-500 {isSunActive ? 'opacity-75 animate-spin' : 'opacity-20'}"
                style="
                  border-color: {sun.color};
                  border-width: 1.5px;
                  border-dasharray: 6 10;
                  animation-duration: 40s;
                  box-shadow: 0 0 30px {sun.color}50;
                "
              ></div>

              <!-- 太陽母星本體 (雙色熔融球體與強烈自發光) -->
              <div
                class="w-full h-full rounded-full flex flex-col items-center justify-center text-center p-3 shadow-2xl relative transition-all group-hover:scale-105"
                style="
                  background: radial-gradient(circle at 35% 35%, {sun.color} 0%, {sun.secondaryColor} 60%, #060709 100%);
                  box-shadow: 0 0 55px {sun.color}99, inset 0 0 25px rgba(255,255,255,0.5), inset 0 0 45px {sun.color};
                  border: 2.5px solid {sun.color};
                "
              >
                <!-- 恆星呼吸脈衝 -->
                <div
                  class="absolute inset-0 rounded-full border border-white/60 animate-ping opacity-25 pointer-events-none"
                  style="animation-duration: 4s;"
                ></div>

                <!-- 流派專屬具象圖示 (8 大分類個性彰顯) -->
                <div class="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] mb-1 group-hover:scale-115 transition-transform duration-300">
                  {@render sectorIcon(sun.icon, "w-7 h-7")}
                </div>

                <!-- 流派中文短標題與英文代號 -->
                <div class="flex flex-col items-center pointer-events-none">
                  <span class="font-serif text-xs font-black text-white leading-tight drop-shadow tracking-tight">
                    {sun.shortName}
                  </span>
                  <span class="font-mono text-[7px] text-white/80 font-bold tracking-widest uppercase mt-0.5">
                    {sun.key}
                  </span>
                </div>

                <!-- 天體藝人數量膠囊 -->
                <div class="mt-1 px-2 py-0.5 rounded-full bg-[#050608]/75 border border-white/20 backdrop-blur-sm pointer-events-none shadow-sm">
                  <span class="font-mono text-[8px] text-[#FEC486] font-black tracking-wider">
                    {sun.artistCount} 星體
                  </span>
                </div>
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

          <!-- ================= 第 3 級：具體藝人實體行星節點 (分層語意縮放與微觀檢視) ================= -->
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
            {@const showLabel = zoomLevel >= 55 || isSelected}
            {@const showDetails = zoomLevel >= 85 || isSelected}

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

                  <!-- 語意縮放：宏觀模式下微星光點，中微觀模式展開文字資訊 -->
                  {#if showLabel}
                    <div class="relative z-10 flex flex-col items-center px-1 pointer-events-none transition-opacity duration-200">
                      <span
                        class="font-serif font-bold text-[#EEF0F2] group-hover:text-[#FEC486] leading-tight block truncate text-center"
                        style="font-size: {Math.max(9, Math.min(13, Math.round(pos.size * 0.16)))}px; max-w: {pos.size - 12}px;"
                      >
                        {artist.name.split(' ')[0]}
                      </span>

                      {#if showDetails}
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
                      {/if}
                    </div>
                  {:else}
                    <!-- 宏觀深空極簡模式：小星點光芒 -->
                    <div class="w-2 h-2 rounded-full bg-[#FEC486] shadow-[0_0_8px_#FEC486] pointer-events-none"></div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- 右側 Dossier 檢查抽屜與 Weight 發燒調節面板 (4 欄) -->
    <div class="col-span-12 xl:col-span-4 bg-[#0D0E11] border border-[#1F2228] p-5 rounded-[4px] shadow-2xl flex flex-col gap-4">
      <!-- 頂部視圖切換 Tab 列 -->
      <div class="flex items-center justify-between border-b border-[#1F2228] pb-3">
        <div class="flex items-center gap-1.5 bg-[#050608] p-1 rounded-[3px] border border-[#1F2228]">
          <button
            type="button"
            onclick={() => (panelViewMode = 'roster')}
            class="px-2.5 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all flex items-center gap-1.5 {panelViewMode === 'roster' || !selectedArtist
              ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40'
              : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
          >
            <Users class="w-3.5 h-3.5 text-[#FEC486]" />
            <span>類別名錄 ({rosterArtists.length})</span>
          </button>

          {#if selectedArtist}
            <button
              type="button"
              onclick={() => (panelViewMode = 'dossier')}
              class="px-2.5 py-1 rounded-[2px] font-mono text-xs cursor-pointer transition-all flex items-center gap-1.5 {panelViewMode === 'dossier'
                ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40'
                : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            >
              <Sun class="w-3.5 h-3.5 text-[#FEC486]" />
              <span>星體檔案</span>
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full" style="background-color: {currentCategoryColor};"></span>
          <span class="font-mono text-[10px] text-[#8E9298] uppercase tracking-wider">
            {activeSectorFilter}
          </span>
        </div>
      </div>

      <!-- 模式 A：群組名錄模式 (Sector & Sub-Genre Roster) -->
      {#if panelViewMode === 'roster' || !selectedArtist}
        <div class="flex flex-col gap-3">
          <!-- 分類導航與麵包屑資訊 -->
          <div class="bg-[#050608] p-3 rounded-[3px] border border-[#1F2228] flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]" style="background-color: {currentCategoryColor}; box-shadow: 0 0 10px {currentCategoryColor};"></span>
                <span class="font-serif text-sm font-bold text-[#EEF0F2]">
                  {currentCategoryTitle}
                </span>
              </div>
              <span class="px-2 py-0.5 rounded bg-[#101217] text-[#FEC486] font-mono text-xs border border-[#2B303C] font-bold">
                {rosterArtists.length} 藝人
              </span>
            </div>

            <!-- 子類別標記與退回大類按鈕 -->
            {#if selectedSubGenre}
              <div class="flex items-center gap-2 pt-1 border-t border-[#14161C]">
                <span class="text-[#8E9298] font-mono text-xs">子流派過濾:</span>
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#181B24] border border-[#FEC486]/50 text-[#FEC486] font-mono text-xs font-bold">
                  <Layers class="w-3 h-3 text-[#FEC486]" />
                  <span>{selectedSubGenre}</span>
                  <button
                    type="button"
                    onclick={() => selectSubGenreFilter(null)}
                    class="ml-1 hover:text-[#FA383E] cursor-pointer"
                    title="取消子流派過濾，顯示大類全部"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
            {/if}

            <!-- 該大類底下的子流派快速切換膠囊 (Sub-genre Chips) -->
            {#if availableSubGenres.length > 0}
              <div class="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 max-w-full">
                <button
                  type="button"
                  onclick={() => selectSubGenreFilter(null)}
                  class="px-2 py-0.5 rounded-[2px] font-mono text-[10px] cursor-pointer shrink-0 transition-all {!selectedSubGenre
                    ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#FEC486]/40'
                    : 'bg-[#0E1015] text-[#8E9298] border border-[#1F2228] hover:text-[#EEF0F2]'}"
                >
                  全部子流派
                </button>
                {#each availableSubGenres as subItem}
                  <button
                    type="button"
                    onclick={() => selectSubGenreFilter(selectedSubGenre === subItem.name ? null : subItem.name)}
                    class="px-2 py-0.5 rounded-[2px] font-mono text-[10px] cursor-pointer shrink-0 transition-all flex items-center gap-1 {selectedSubGenre === subItem.name
                      ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#FEC486]/50 shadow-[0_0_8px_rgba(254,196,134,0.2)]'
                      : 'bg-[#0E1015] text-[#8E9298] border border-[#1F2228] hover:text-[#EEF0F2]'}"
                  >
                    <span>{subItem.name}</span>
                    <span class="opacity-70 text-[9px]">({subItem.count})</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- 搜尋框與排序切換工具列 -->
          <div class="flex items-center gap-2">
            <div class="flex-1 relative">
              <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8E9298]" />
              <input
                type="text"
                bind:value={rosterSearchQuery}
                placeholder="搜尋藝人名稱或風格..."
                class="w-full pl-8 pr-7 py-1.5 bg-[#050608] border border-[#1F2228] focus:border-[#FEC486]/60 rounded-[3px] text-xs text-[#EEF0F2] placeholder-[#52565E] outline-none font-mono"
              />
              {#if rosterSearchQuery}
                <button
                  type="button"
                  onclick={() => (rosterSearchQuery = '')}
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E9298] hover:text-[#EEF0F2]"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              {/if}
            </div>

            <!-- 排序按鈕組 -->
            <div class="flex items-center bg-[#050608] p-0.5 rounded-[3px] border border-[#1F2228] shrink-0">
              <button
                type="button"
                onclick={() => (rosterSortBy = 'weight')}
                title="依天體質量 Weight 排序"
                class="px-2 py-1 rounded-[2px] font-mono text-[10px] cursor-pointer {rosterSortBy === 'weight' ? 'bg-[#1C2027] text-[#FEC486] font-bold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
              >
                質量
              </button>
              <button
                type="button"
                onclick={() => (rosterSortBy = 'dr')}
                title="依動態範圍 DR 排序"
                class="px-2 py-1 rounded-[2px] font-mono text-[10px] cursor-pointer {rosterSortBy === 'dr' ? 'bg-[#1C2027] text-[#FEC486] font-bold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
              >
                DR
              </button>
              <button
                type="button"
                onclick={() => (rosterSortBy = 'name')}
                title="依名稱字母排序"
                class="px-2 py-1 rounded-[2px] font-mono text-[10px] cursor-pointer {rosterSortBy === 'name' ? 'bg-[#1C2027] text-[#FEC486] font-bold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
              >
                A-Z
              </button>
            </div>
          </div>

          <!-- 符合藝人名錄滾動列表 -->
          <div class="flex flex-col gap-2 overflow-y-auto max-h-[580px] pr-1">
            {#if rosterArtists.length === 0}
              <div class="py-16 text-center text-[#8E9298] font-mono text-xs bg-[#050608] rounded border border-[#1A1D23] p-6 flex flex-col items-center gap-2">
                <ListFilter class="w-6 h-6 text-[#52565E]" />
                <span class="text-[#CCCFD6] font-bold">在此分類或篩選條件下無符合之藝人</span>
                <span class="text-[10px] text-[#52565E]">可嘗試清除搜尋詞或切換子流派標籤</span>
              </div>
            {:else}
              {#each rosterArtists as artist (artist.id)}
                {@const isSelected = selectedArtistId === artist.id}
                {@const weight = artist.weight ?? 20}
                {@const isGasGiant = weight >= 70}
                {@const isDrHigh = (artist.dynamicRange ?? 0) >= 14}
                <div
                  role="button"
                  tabindex="0"
                  onclick={() => selectArtistFromRoster(artist.id)}
                  onkeydown={(e) => e.key === 'Enter' && selectArtistFromRoster(artist.id)}
                  class="p-2.5 rounded-[4px] border transition-all cursor-pointer flex items-center justify-between gap-3 group {isSelected
                    ? 'bg-[#171A21] border-[#FEC486] shadow-[0_0_12px_rgba(254,196,134,0.25)]'
                    : 'bg-[#050608] border-[#1F2228] hover:border-[#E0A96D]/50 hover:bg-[#0E1015]'}"
                >
                  <!-- 左側：頭像與名稱子類別 -->
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-full bg-[#111317] border border-[#2B303C] overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                      {#if artist.coverImage}
                        <img
                          src={artist.coverImage}
                          alt={artist.name}
                          class="w-full h-full object-cover"
                        />
                      {:else}
                        <Disc3 class="w-5 h-5 text-[#8E9298] group-hover:text-[#FEC486] transition-colors" />
                      {/if}
                    </div>

                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="font-serif text-sm font-bold text-[#EEF0F2] group-hover:text-[#FEC486] truncate">
                          {artist.name}
                        </span>
                        {#if isGasGiant}
                          <span title="氣態巨星 (Weight ≥ 70)">
                            <Flame class="w-3 h-3 text-[#FEC486] shrink-0" />
                          </span>
                        {/if}
                      </div>

                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span class="px-1.5 py-0.2 rounded bg-[#101217] text-[#8E9298] group-hover:text-[#EEF0F2] font-mono text-[10px] border border-[#1F2228] truncate max-w-[130px]">
                          {artist.analysis?.subGenre || '未定流派'}
                        </span>
                        {#if artist.aliases && artist.aliases.length > 0}
                          <span class="font-mono text-[9px] text-[#52565E] truncate max-w-[90px]">
                            {artist.aliases[0]}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- 右側：質量 W 與動態 DR 標籤 -->
                  <div class="flex items-center gap-2 shrink-0 font-mono">
                    <div class="flex flex-col items-end gap-1">
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded {isGasGiant ? 'bg-[#2E1E10] text-[#FEC486] border border-[#E0A96D]/40' : 'bg-[#14161A] text-[#CCCFD6] border border-[#1F2228]'}">
                        W{weight}
                      </span>
                      {#if artist.dynamicRange}
                        <span class="text-[9px] font-bold {isDrHigh ? 'text-[#63C78B]' : 'text-[#8E9298]'}">
                          DR{artist.dynamicRange}
                        </span>
                      {:else if artist.status === 'inbox'}
                        <span class="text-[8px] text-[#FA383E] uppercase font-bold px-1 bg-[#2B0E12] rounded">
                          RAW
                        </span>
                      {/if}
                    </div>

                    <Crosshair class="w-3.5 h-3.5 text-[#52565E] group-hover:text-[#FEC486] transition-colors" />
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

      <!-- 模式 B：單星檔案模式 (Planet Dossier) -->
      {:else}
        {@const weight = selectedArtist.weight ?? 20}
        <div class="border-b border-[#1F2228] pb-3">
          <!-- 返回名錄麵包屑按鈕 -->
          <div class="flex items-center justify-between mb-2">
            <button
              type="button"
              onclick={() => (panelViewMode = 'roster')}
              class="inline-flex items-center gap-1 font-mono text-xs text-[#8E9298] hover:text-[#FEC486] transition-colors cursor-pointer"
            >
              <ArrowLeft class="w-3.5 h-3.5" />
              <span>返回【{currentCategoryTitle}】名錄 ({rosterArtists.length})</span>
            </button>
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
            <button
              type="button"
              onclick={() => {
                const sec = selectedArtist.analysis?.sector || selectedArtist.clusterSector;
                if (sec) {
                  activeSectorFilter = sec;
                  selectedSubGenre = null;
                  panelViewMode = 'roster';
                }
              }}
              class="px-2 py-0.5 rounded bg-[#171A21] text-[#FEC486] font-mono text-xs border border-[#E0A96D]/40 font-bold flex items-center gap-1 hover:border-[#FEC486] cursor-pointer"
              title="點擊檢視此大類別全部藝人"
            >
              <Sun class="w-3 h-3 text-[#FEC486]" />
              <span>{selectedArtist.analysis?.sector || selectedArtist.clusterSector || 'RAW INBOX'}</span>
            </button>
            <span class="text-[#8E9298] font-mono text-xs">➔</span>
            <button
              type="button"
              onclick={() => {
                const sec = selectedArtist.analysis?.sector || selectedArtist.clusterSector;
                const sub = selectedArtist.analysis?.subGenre;
                if (sec) activeSectorFilter = sec;
                if (sub) {
                  selectedSubGenre = sub;
                  panelViewMode = 'roster';
                }
              }}
              class="px-2 py-0.5 rounded bg-[#101217] text-[#EEF0F2] font-mono text-xs border border-[#2B303C] flex items-center gap-1 hover:border-[#FEC486] cursor-pointer"
              title="點擊檢視此子流派全部藝人"
            >
              <Layers class="w-3 h-3 text-[#FEC486]" />
              <span>{selectedArtist.analysis?.subGenre || '未定流派'}</span>
            </button>
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
      {/if}
    </div>
  </div>
</div>
