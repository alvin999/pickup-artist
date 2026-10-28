<script lang="ts">
  import { onMount } from 'svelte';
  import { tsParticles } from '@tsparticles/engine';
  import { loadSlim } from '@tsparticles/slim';
  import type { ArtistEntry, AcousticSector } from '$lib/types/artist';
  import SpecBadge from '$lib/components/SpecBadge.svelte';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import StreamingTrigger from '$lib/components/studio/StreamingTrigger.svelte';
  import GravityGauge from '$lib/components/studio/GravityGauge.svelte';
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
    Globe,
    HelpCircle,
    Minimize2,
    List
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

  // 側邊欄與 HUD 開關狀態 (點選才展開，HUD 操作一切)
  let isDossierOpen = $state(false);      // 單星解剖艙抽屜 (點選星體時展開)
  let isRosterDrawerOpen = $state(false); // 藝人名錄檢索抽屜 (頂部 HUD 呼叫)
  let isWeightSliderOpen = $state(false); // 右下角控制塢質量門檻滑桿展開
  let isFullscreen = $state(false);       // 全螢幕沉浸模式

  let panelViewMode = $state<'roster' | 'dossier'>('roster');
  let rosterSearchQuery = $state('');
  let rosterSortBy = $state<'weight' | 'name'>('weight');
  
  // 畫布平移狀態 (Pan)
  let panX = $state(0);
  let panY = $state(0);
  let isPanningCanvas = $state(false);
  let startCanvasPanX = $state(0);
  let startCanvasPanY = $state(0);
  let isSpacePressed = $state(false); // 空白鍵按住狀態 (輔助平移手勢)

  // Google Maps 式觸控與指針互動引擎 (單指平移、慣性物理滑行、雙指捏合縮放、雙擊放大)
  const activePointers = new Map<number, { x: number; y: number }>();
  let touchStartDist = 0;
  let touchStartZoom = 60;
  let touchStartMid = { x: 0, y: 0 };
  let pointerStartPos = { x: 0, y: 0 };
  let hasMovedSignificantly = false;
  let lastPointerMoveTime = 0;
  let lastPointerPos = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let inertiaRafId: number | null = null;
  let lastTapTime = 0;
  let lastTapPos = { x: 0, y: 0 };

  // Google Maps 式平滑滾輪即時縮放狀態 (防止 CSS 過渡造成黏滯感)
  let isWheelZooming = $state(false);
  let wheelZoomTimer: ReturnType<typeof setTimeout> | null = null;

  // 操作指南彈窗狀態
  let showGuideModal = $state(false);

  // 星體節點拖曳狀態與動態互斥推力 (Interactive Elastic Repulsion)
  let draggingArtistId = $state<string | null>(null);
  let dragMouseStart = { x: 0, y: 0 };
  let dragNodeStart = { x: 0, y: 0 };
  let liveNodePosOverrides = $state<Record<string, { x: number; y: number }>>({});

  // 刪除二次確認計時器狀態
  let deleteConfirmPending = $state(false);
  let deleteCountdown = $state(3);
  let deleteTimer: ReturnType<typeof setInterval> | null = null;

  // 聲學引力質量 Weight 操作即時回饋狀態 (HUD 浮動標籤與震盪波漣漪)
  let weightFeedback = $state<{
    artistId: string;
    delta: number;
    newWeight: number;
    isGasGiantBreakthrough: boolean;
  } | null>(null);
  let weightFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let rippleKey = $state(0);

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

  // 取得大分類完整全名顯示字串 (繁中全名 + 英文全名)
  function getSectorDisplayName(sectorKey?: string | null): string {
    if (!sectorKey) return 'RAW INBOX';
    if (sectorKey === 'inbox' || sectorKey === 'RAW INBOX') return '待探索彗星 (RAW INBOX)';
    const sec = ACOUSTIC_SECTORS.find((s) => s.key === sectorKey);
    if (sec) return `${sec.name} (${sec.nameEn})`;
    return sectorKey;
  }

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

  // 停止慣性平移
  function stopInertia() {
    if (inertiaRafId !== null) {
      cancelAnimationFrame(inertiaRafId);
      inertiaRafId = null;
    }
  }

  // 啟動 Google Maps 式慣性物理滑行 (Inertia Momentum Scrolling)
  function startInertia() {
    stopInertia();
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed < 0.12) return;

    let vx = velocity.x * 16;
    let vy = velocity.y * 16;
    const maxV = 40;
    vx = Math.max(-maxV, Math.min(maxV, vx));
    vy = Math.max(-maxV, Math.min(maxV, vy));

    function step() {
      if (Math.hypot(vx, vy) < 0.35) {
        inertiaRafId = null;
        return;
      }
      panX = Math.round(panX + vx);
      panY = Math.round(panY + vy);
      vx *= 0.92;
      vy *= 0.92;
      inertiaRafId = requestAnimationFrame(step);
    }
    inertiaRafId = requestAnimationFrame(step);
  }

  // 點選藝人星體：展開解剖艙卡片
  function handleSelectArtistNode(artistId: string, e?: Event) {
    e?.stopPropagation();
    onselectArtist(artistId);
    isDossierOpen = true; // 點選才展開卡片
  }

  // 全螢幕切換
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      canvasViewportEl?.requestFullscreen?.();
      isFullscreen = true;
    } else {
      document.exitFullscreen?.();
      isFullscreen = false;
    }
  }

  // 畫布指針按下：記錄起點、多點觸控狀態與準備平移 / 捏合手勢
  function handleCanvasPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.guide-modal-container, .hud-panel, .floating-hud, input, textarea, button, a')) return;
    if (isFlying) isFlying = false;
    stopInertia();

    try {
      (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch (_) {}

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
      pointerStartPos = { x: e.clientX, y: e.clientY };
      startCanvasPanX = e.clientX - panX;
      startCanvasPanY = e.clientY - panY;
      hasMovedSignificantly = false;
      isPanningCanvas = true;
      lastPointerMoveTime = performance.now();
      lastPointerPos = { x: e.clientX, y: e.clientY };
      velocity = { x: 0, y: 0 };
    } else if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      touchStartDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      touchStartZoom = zoomLevel;
      touchStartMid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };
      hasMovedSignificantly = true;
      isPanningCanvas = false;
      velocity = { x: 0, y: 0 };
    }
  }

  // 畫布指針移動：支援單指平移、雙指捏合縮放 (Pinch-to-zoom)
  function handleCanvasPointerMove(e: PointerEvent) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 1. 若正在拖曳特定藝人節點
    if (draggingArtistId) {
      const scale = zoomLevel / 100;
      const dx = (e.clientX - dragMouseStart.x) / scale;
      const dy = (e.clientY - dragMouseStart.y) / scale;
      const currentDraggingPos = {
        x: Math.round(dragNodeStart.x + dx),
        y: Math.round(dragNodeStart.y + dy)
      };

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

      liveNodePosOverrides = {
        ...liveNodePosOverrides,
        ...pushes,
        [draggingArtistId]: currentDraggingPos
      };
      return;
    }

    // 2. 雙指捏合縮放 (Pinch-to-zoom with Focal Center)
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const currentMid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };

      if (touchStartDist > 0 && canvasViewportEl) {
        const ratio = currentDist / touchStartDist;
        const targetZoom = Math.max(30, Math.min(220, Math.round(touchStartZoom * ratio)));

        if (targetZoom !== zoomLevel) {
          const rect = canvasViewportEl.getBoundingClientRect();
          const mouseOffsetX = currentMid.x - (rect.left + rect.width / 2);
          const mouseOffsetY = currentMid.y - (rect.top + rect.height / 2);
          const zoomRatio = targetZoom / zoomLevel;

          panX = Math.round(panX * zoomRatio - mouseOffsetX * (zoomRatio - 1));
          panY = Math.round(panY * zoomRatio - mouseOffsetY * (zoomRatio - 1));
          zoomLevel = targetZoom;
        }

        const dMidX = currentMid.x - touchStartMid.x;
        const dMidY = currentMid.y - touchStartMid.y;
        panX += dMidX * 0.5;
        panY += dMidY * 0.5;
        touchStartMid = currentMid;
      }
      return;
    }

    // 3. 單指平移畫布 (Pan)
    if (activePointers.size === 1 && isPanningCanvas) {
      const moveDist = Math.hypot(e.clientX - pointerStartPos.x, e.clientY - pointerStartPos.y);
      if (moveDist > 8) {
        hasMovedSignificantly = true;
      }

      if (hasMovedSignificantly) {
        panX = e.clientX - startCanvasPanX;
        panY = e.clientY - startCanvasPanY;

        const now = performance.now();
        const dt = now - lastPointerMoveTime;
        if (dt > 10) {
          velocity.x = (e.clientX - lastPointerPos.x) / dt;
          velocity.y = (e.clientY - lastPointerPos.y) / dt;
          lastPointerMoveTime = now;
          lastPointerPos = { x: e.clientX, y: e.clientY };
        }
      }
    }
  }

  // 畫布指針放開：處理慣性物理滑行或單擊/雙擊事件
  function handleCanvasPointerUp(e: PointerEvent) {
    try {
      (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch (_) {}

    activePointers.delete(e.pointerId);

    if (activePointers.size === 0) {
      if (hasMovedSignificantly) {
        startInertia();
      } else {
        handleCanvasTap(e);
      }
      isPanningCanvas = false;
    } else if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0];
      startCanvasPanX = remaining.x - panX;
      startCanvasPanY = remaining.y - panY;
      lastPointerMoveTime = performance.now();
      lastPointerPos = { ...remaining };
      velocity = { x: 0, y: 0 };
    }
  }

  function handleCanvasPointerCancel(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    isPanningCanvas = false;
    stopInertia();
  }

  // 輕觸點擊與雙擊放大 (Tap & Double-Tap Zoom)
  function handleCanvasTap(e: PointerEvent) {
    const now = performance.now();
    const tapTarget = e.target as HTMLElement;

    // 若點在互動元件上，由該元件自身事件處理
    if (tapTarget.closest('button, input, textarea, a, .hud-panel, .minimap-radar')) return;

    // 雙擊快速放大 (Double-tap Zoom)
    if (now - lastTapTime < 320 && Math.hypot(e.clientX - lastTapPos.x, e.clientY - lastTapPos.y) < 24) {
      lastTapTime = 0;
      if (canvasViewportEl) {
        const rect = canvasViewportEl.getBoundingClientRect();
        const clickOffsetX = e.clientX - (rect.left + rect.width / 2);
        const clickOffsetY = e.clientY - (rect.top + rect.height / 2);
        const nextZoom = Math.min(220, zoomLevel + 35);
        flyTo(
          Math.round(panX - clickOffsetX * 0.6),
          Math.round(panY - clickOffsetY * 0.6),
          nextZoom,
          320
        );
      }
      return;
    }

    lastTapTime = now;
    lastTapPos = { x: e.clientX, y: e.clientY };
  }

  // 星體節點滑鼠/指針按下：啟動節點自由拖曳與互斥動力學，並展開解剖艙
  function handleNodeMouseDown(e: MouseEvent, artistId: string) {
    e.stopPropagation();
    handleSelectArtistNode(artistId, e);

    const pos = posMap.get(artistId);
    if (!pos) return;

    draggingArtistId = artistId;
    dragMouseStart = { x: e.clientX, y: e.clientY };
    dragNodeStart = { x: pos.x, y: pos.y };
  }

  // 全域滑鼠/指針移動處理
  function handleGlobalMouseMove(e: MouseEvent) {
    if (draggingArtistId) {
      const scale = zoomLevel / 100;
      const dx = (e.clientX - dragMouseStart.x) / scale;
      const dy = (e.clientY - dragMouseStart.y) / scale;
      const currentDraggingPos = {
        x: Math.round(dragNodeStart.x + dx),
        y: Math.round(dragNodeStart.y + dy)
      };

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
  }

  // 全域放開處理
  function handleGlobalMouseUp() {
    if (isDraggingMinimap) {
      isDraggingMinimap = false;
    }

    if (draggingArtistId) {
      const draggedId = draggingArtistId;
      draggingArtistId = null;

      const finalPos = liveNodePosOverrides[draggedId];
      if (finalPos && onupdatePos) {
        onupdatePos(draggedId, finalPos);
      }

      for (const [id, pos] of Object.entries(liveNodePosOverrides)) {
        if (id !== draggedId && onupdatePos) {
          onupdatePos(id, pos);
        }
      }
    }
  }

  // Google Maps 式游標中心智慧滾輪縮放與手勢
  function handleWheel(e: WheelEvent) {
    // 若滾輪事件發生在浮動抽屜面板 (如藝人解剖艙 aside、藝人名錄、手冊彈窗等)，
    // 保留瀏覽器內部原生捲動，不攔截也不觸發背景星系縮放
    const target = e.target as HTMLElement | null;
    if (target?.closest('aside, .guide-modal-container, .floating-hud, [data-prevent-canvas-wheel]')) {
      return;
    }

    e.preventDefault();

    // 1. Alt + 滾輪：快速增減選取藝人的引力質量 Weight (±2)
    if (e.altKey && selectedArtist) {
      const delta = e.deltaY < 0 ? 2 : -2;
      changeWeight(selectedArtist.id, (selectedArtist.weight ?? 20) + delta);
      return;
    }

    // 2. Shift + 滾輪：水平平移 (Horizontal Pan)
    if (e.shiftKey) {
      panX -= (e.deltaY || e.deltaX) * 0.85;
      return;
    }

    // 3. Google Maps 式滾輪縮放：以滑鼠游標位置為中心縮放 (Zoom towards cursor)
    if (!canvasViewportEl) return;
    if (isFlying) isFlying = false;

    // 進入即時縮放狀態，連續縮放時暫時關閉 CSS transition 達成 60fps 貼手零延遲
    isWheelZooming = true;
    if (wheelZoomTimer) clearTimeout(wheelZoomTimer);
    wheelZoomTimer = setTimeout(() => {
      isWheelZooming = false;
    }, 100);

    // 縮放係數：觸控板捏合手勢 (含 ctrlKey) 使用細緻指數衰減，一般滑鼠滾輪每次縮放約 8%
    const zoomFactor = e.ctrlKey
      ? Math.exp(-e.deltaY * 0.005)
      : e.deltaY < 0 ? 1.08 : 0.92;

    const currentZoom = zoomLevel;
    const nextZoom = Math.max(30, Math.min(220, Math.round(currentZoom * zoomFactor)));
    if (nextZoom === currentZoom) return;

    // 計算滑鼠相對於視口中心的偏移量
    const rect = canvasViewportEl.getBoundingClientRect();
    const mouseOffsetX = e.clientX - (rect.left + rect.width / 2);
    const mouseOffsetY = e.clientY - (rect.top + rect.height / 2);

    // Google Maps 游標錨定補償公式：pan_new = pan_old * ratio - mouseOffset * (ratio - 1)
    const ratio = nextZoom / currentZoom;
    panX = Math.round(panX * ratio - mouseOffsetX * (ratio - 1));
    panY = Math.round(panY * ratio - mouseOffsetY * (ratio - 1));
    zoomLevel = nextZoom;
  }

  // 調整 Weight (1 ~ 100) 並觸發引力震盪波與天體頭頂 HUD 即時回饋
  function changeWeight(artistId: string, targetWeight: number) {
    const artist = artists.find((a) => a.id === artistId);
    const oldWeight = artist?.weight ?? 20;
    const clamped = Math.max(1, Math.min(100, Math.round(targetWeight)));
    if (clamped === oldWeight) return;

    const delta = clamped - oldWeight;
    const isGasGiantBreakthrough = oldWeight < 70 && clamped >= 70;

    weightFeedback = {
      artistId,
      delta,
      newWeight: clamped,
      isGasGiantBreakthrough
    };
    rippleKey += 1;

    if (weightFeedbackTimer) clearTimeout(weightFeedbackTimer);
    weightFeedbackTimer = setTimeout(() => {
      weightFeedback = null;
    }, 1200);

    if (onupdateWeight) {
      onupdateWeight(artistId, clamped);
    }
  }

  // 全域鍵盤快捷鍵
  function handleKeydown(e: KeyboardEvent) {
    const isInputFocused = ['INPUT', 'TEXTAREA'].includes(
      (document.activeElement?.tagName || '')
    );
    if (isInputFocused) return;

    // 空白鍵按住：啟動畫布抓取平移模式
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      isSpacePressed = true;
      return;
    }

    // 操作指引彈窗開關 (? 鍵或 / 鍵)
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      showGuideModal = !showGuideModal;
      return;
    }

    // Esc 鍵：若指南開啟則關閉指南，否則若有展開卡片則關閉卡片，保持星空乾淨
    if (e.key === 'Escape') {
      if (showGuideModal) {
        showGuideModal = false;
        return;
      }
      if (isDossierOpen) {
        isDossierOpen = false;
        return;
      }
      if (isRosterDrawerOpen) {
        isRosterDrawerOpen = false;
        return;
      }
      if (selectedArtistId) {
        selectedArtistId = null;
        return;
      }
    }

    // 方向鍵平移視野 (Pan with Arrow keys)
    const arrowStep = 60;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      panY += arrowStep;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      panY -= arrowStep;
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      panX += arrowStep;
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      panX -= arrowStep;
      return;
    }

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

  // 鍵盤釋放事件 (釋放空白鍵)
  function handleKeyup(e: KeyboardEvent) {
    if (e.code === 'Space') {
      isSpacePressed = false;
    }
  }

  // 深空星塵粒子引擎狀態與清理
  let particlesContainer: any = null;
  const particlesDomId = 'celestial-stardust-particles';

  onMount(() => {
    let isCancelled = false;

    async function initStardust() {
      try {
        await loadSlim(tsParticles);
        if (isCancelled) return;
        particlesContainer = await tsParticles.load({
          id: particlesDomId,
          options: {
            fpsLimit: 60,
            fullScreen: { enable: false },
            particles: {
              number: {
                value: 70,
                density: {
                  enable: true,
                  width: 1200,
                  height: 750
                }
              },
              color: {
                value: ['#FEC486', '#A0B4D8', '#E0A96D', '#FFFFFF', '#84D2C5']
              },
              shape: {
                type: 'circle'
              },
              opacity: {
                value: { min: 0.12, max: 0.45 },
                animation: {
                  enable: true,
                  speed: 0.6,
                  sync: false
                }
              },
              size: {
                value: { min: 0.8, max: 2.2 }
              },
              move: {
                enable: true,
                speed: 0.22,
                direction: 'none',
                random: true,
                straight: false,
                outModes: {
                  default: 'out'
                }
              }
            },
            interactivity: {
              events: {
                onHover: { enable: false },
                onClick: { enable: false }
              }
            },
            detectRetina: true,
            background: {
              color: 'transparent'
            }
          }
        });
      } catch (err) {
        console.warn('Stardust particles initialization skipped:', err);
      }
    }

    initStardust();

    return () => {
      isCancelled = true;
      if (particlesContainer) {
        particlesContainer.destroy();
        particlesContainer = null;
      }
    };
  });
</script>

<svelte:window
  onmousemove={handleGlobalMouseMove}
  onmouseup={handleGlobalMouseUp}
  onkeydown={handleKeydown}
  onkeyup={handleKeyup}
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

{#snippet dossierBody(artist: ArtistEntry)}
  {@const weight = artist.weight ?? 20}
  <div class="p-4 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-2">
    <!-- 藝人抬頭與類別 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-mono text-[10px] text-[#8E9298] uppercase">
          ID: {artist.id.slice(0, 8)}
        </span>
        {#if artist.status === 'inbox'}
          <SpecBadge type="inbox" text="RAW INBOX" />
        {:else}
          <SpecBadge type="analyzed" text="ANALYZED" />
        {/if}
      </div>

      <div class="flex items-center gap-3">
        {#if artist.coverImage}
          <img src={artist.coverImage} alt={artist.name} class="w-12 h-12 rounded-full object-cover border border-[#2B303C] shrink-0" />
        {:else}
          <div class="w-12 h-12 rounded-full bg-[#111317] border border-[#2B303C] flex items-center justify-center shrink-0">
            <Disc3 class="w-6 h-6 text-[#FEC486]" />
          </div>
        {/if}
        <div class="min-w-0 flex-1">
          <h3 class="font-serif text-xl font-bold text-[#EEF0F2] truncate">
            {artist.name}
          </h3>
          {#if artist.aliases && artist.aliases.length > 0}
            <div class="font-mono text-[11px] text-[#8E9298] truncate">
              {artist.aliases.join(' / ')}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- 雙層分類標章 (Sun ➔ SubNode) -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onclick={() => {
          const sec = artist.analysis?.sector || artist.clusterSector;
          if (sec) {
            activeSectorFilter = sec;
            selectedSubGenre = null;
          }
        }}
        class="px-2 py-0.5 rounded bg-[#171A21] text-[#FEC486] font-mono text-xs border border-[#E0A96D]/40 font-bold flex items-center gap-1 hover:border-[#FEC486] cursor-pointer"
        title="點擊切換至此母星系"
      >
        <Sun class="w-3 h-3 text-[#FEC486]" />
        <span>{getSectorDisplayName(artist.analysis?.sector || artist.clusterSector)}</span>
      </button>
      <span class="text-[#8E9298] font-mono text-xs">➔</span>
      <button
        type="button"
        onclick={() => {
          const sec = artist.analysis?.sector || artist.clusterSector;
          const sub = artist.analysis?.subGenre;
          if (sec) activeSectorFilter = sec;
          if (sub) selectedSubGenre = sub;
        }}
        class="px-2 py-0.5 rounded bg-[#101217] text-[#EEF0F2] font-mono text-xs border border-[#2B303C] flex items-center gap-1 hover:border-[#FEC486] cursor-pointer"
        title="點擊過濾此子流派"
      >
        <Layers class="w-3 h-3 text-[#FEC486]" />
        <span>{artist.analysis?.subGenre || '未定流派'}</span>
      </button>
    </div>

    <!-- Weight 引力權重半圓儀表與精準調節面板 (1 ~ 100) -->
    <GravityGauge
      variant="detailed"
      label="天體引力質量 (GRAVITY WEIGHT)"
      weight={weight}
      onchange={(w) => changeWeight(artist.id, w)}
    />

    <!-- 操作按鈕列 -->
    <div class="flex items-center gap-2">
      <StreamingTrigger
        artistName={artist.name}
        appleMusicUrl={artist.appleMusicUrl}
        variant="compact"
        className="flex-1"
      />

      <TactileButton
        variant="amber"
        size="md"
        onclick={() => onanalyzeArtist(artist)}
        class="flex-1 py-2 text-xs"
      >
        <Sparkles class="w-3.5 h-3.5 mr-1 text-[#FEC486]" />
        <span>AI 聲學解剖</span>
      </TactileButton>
    </div>

    <!-- 檔案脈絡與 AI 分析細節 -->
    <div class="flex flex-col gap-3">
      {#if artist.analysis}
        <!-- 聲響脈絡介紹 -->
        <div>
          <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
            聲響脈絡 (Summary)
          </h4>
          <p class="font-sans text-xs text-[#CCCFD6] leading-relaxed bg-[#050608] p-3 rounded border border-[#1A1D23]">
            {artist.analysis.summary}
          </p>
        </div>

        <!-- 錄音質地評註 -->
        {#if artist.analysis.instrumentationNotes}
          <div>
            <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
              錄音質地與聲學評註
            </h4>
            <p class="font-mono text-xs text-[#E0A96D]/90 bg-[#12100A] p-3 rounded border border-[#E0A96D]/30 leading-relaxed">
              {artist.analysis.instrumentationNotes}
            </p>
          </div>
        {/if}

        <!-- 推薦專輯卡片矩陣 -->
        {#if artist.analysis.notableAlbums && artist.analysis.notableAlbums.length > 0}
          <div>
            <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1.5">
              推薦唱片精選 (Notable Works)
            </h4>
            <div class="flex flex-col gap-2">
              {#each artist.analysis.notableAlbums as album}
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
        {#if artist.analysis.similarArtists && artist.analysis.similarArtists.length > 0}
          <div>
            <h4 class="font-mono text-[11px] uppercase text-[#8E9298] font-bold mb-1">
              AI 相似頻率藝人 (點擊知悉入庫)
            </h4>
            <div class="flex flex-wrap gap-1.5">
              {#each artist.analysis.similarArtists as sim}
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
        <div class="py-8 text-center text-[#8E9298] font-mono text-xs bg-[#050608] rounded border border-[#1A1D23] p-4 flex flex-col items-center gap-2">
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
          <span>確認移除「{artist.name}」？ ({deleteCountdown}s)</span>
        {:else}
          <Trash2 class="w-3.5 h-3.5 text-[#8E9298]" />
          <span>自星系與庫存中移除藝人</span>
        {/if}
      </button>
    </div>
  </div>
{/snippet}

{#snippet rosterDrawer()}
  <div class="p-3.5 flex flex-col gap-3 h-full overflow-hidden">
    <!-- 頂部標題與關閉 -->
    <div class="flex items-center justify-between pb-2 border-b border-[#1F2228]">
      <div class="flex items-center gap-2">
        <Users class="w-4 h-4 text-[#FEC486]" />
        <span class="font-serif text-sm font-bold text-[#EEF0F2]">藝人天體名錄 ({rosterArtists.length})</span>
      </div>
      <button
        type="button"
        onclick={() => (isRosterDrawerOpen = false)}
        class="p-1 text-[#8E9298] hover:text-white rounded hover:bg-[#1F2228] cursor-pointer"
        title="關閉名錄 [Esc]"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- 搜尋框與排序 -->
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

      <div class="flex items-center bg-[#050608] border border-[#1F2228] rounded p-0.5 text-[10px] font-mono shrink-0">
        <button
          type="button"
          onclick={() => (rosterSortBy = 'weight')}
          class="px-2 py-0.5 rounded cursor-pointer {rosterSortBy === 'weight' ? 'bg-[#1C2027] text-[#FEC486] font-bold' : 'text-[#8E9298]'}"
          title="按質量排序"
        >
          WT
        </button>
        <button
          type="button"
          onclick={() => (rosterSortBy = 'name')}
          class="px-2 py-0.5 rounded cursor-pointer {rosterSortBy === 'name' ? 'bg-[#1C2027] text-[#FEC486] font-bold' : 'text-[#8E9298]'}"
          title="按名稱字母排序"
        >
          A-Z
        </button>
      </div>
    </div>

    <!-- 子流派膠囊列 -->
    {#if availableSubGenres.length > 0}
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
        <button
          type="button"
          onclick={() => selectSubGenreFilter(null)}
          class="px-2 py-0.5 rounded-[2px] font-mono text-[10px] cursor-pointer shrink-0 transition-all {!selectedSubGenre
            ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#FEC486]/40'
            : 'bg-[#0E1015] text-[#8E9298] border border-[#1F2228] hover:text-[#EEF0F2]'}"
        >
          全部
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

    <!-- 藝人清單 -->
    <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5">
      {#if rosterArtists.length === 0}
        <div class="py-8 text-center text-[#8E9298] font-mono text-xs">
          無符合之藝人
        </div>
      {:else}
        {#each rosterArtists as artist (artist.id)}
          {@const isSelected = selectedArtistId === artist.id}
          {@const weight = artist.weight ?? 20}
          <div
            role="button"
            tabindex="0"
            onclick={() => selectArtistFromRoster(artist.id)}
            onkeydown={(e) => e.key === 'Enter' && selectArtistFromRoster(artist.id)}
            class="p-2 rounded-[3px] border transition-all cursor-pointer flex items-center justify-between gap-2.5 group {isSelected
              ? 'bg-[#171A21] border-[#FEC486] shadow-[0_0_10px_rgba(254,196,134,0.2)]'
              : 'bg-[#050608] border-[#1F2228] hover:border-[#E0A96D]/50 hover:bg-[#0E1015]'}"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-full bg-[#111317] border border-[#2B303C] overflow-hidden shrink-0 flex items-center justify-center">
                {#if artist.coverImage}
                  <img src={artist.coverImage} alt={artist.name} class="w-full h-full object-cover" />
                {:else}
                  <Disc3 class="w-4 h-4 text-[#8E9298]" />
                {/if}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-serif text-xs font-bold text-[#EEF0F2] group-hover:text-[#FEC486] truncate">
                  {artist.name}
                </span>
                <span class="font-mono text-[9px] text-[#8E9298] truncate">
                  {artist.analysis?.subGenre || '未定流派'}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
              <span class="px-1.5 py-0.5 rounded bg-[#14161A] text-[#CCCFD6] border border-[#1F2228] font-bold">
                W{weight}
              </span>
              <Crosshair class="w-3.5 h-3.5 text-[#52565E] group-hover:text-[#FEC486]" />
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/snippet}

<div class="relative w-full h-[calc(100dvh-5.25rem)] min-h-[580px] text-[#EEF0F2] select-none rounded-[6px] border border-[#1F2228] overflow-hidden bg-[#040507] shadow-2xl flex flex-col">
  <!-- 滿版深空畫布視口 (Edge-to-Edge Cosmic Viewport) -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    role="region"
    aria-label="Acoustic Hierarchical Galaxy Canvas"
    bind:this={canvasViewportEl}
    onpointerdown={handleCanvasPointerDown}
    onpointermove={handleCanvasPointerMove}
    onpointerup={handleCanvasPointerUp}
    onpointercancel={handleCanvasPointerCancel}
    onwheel={handleWheel}
    class="relative w-full h-full flex-1 overflow-hidden flex items-center justify-center select-none touch-none overscroll-none {isPanningCanvas ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-default'}"
    style="touch-action: none;"
  >
    <!-- 深空動態星塵粒子層 (Stardust Particles Powered by tsparticles) -->
    <div id={particlesDomId} class="absolute inset-0 pointer-events-none z-0"></div>

    <!-- 深空天文底片微粒噪點層 (Film Grain ISO Texture) -->
    <svg
      class="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-30 mix-blend-overlay"
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="celestial-film-grain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.16 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#celestial-film-grain)" />
    </svg>

    <!-- 深空暗角光罩 (Cosmic Vignette) -->
    <div class="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(4,5,7,0.78)_100%)]"></div>

    <!-- 頂部懸浮 HUD 巡航膠囊 (Top Floating Navigation HUD) -->
    <div class="floating-hud absolute top-3 inset-x-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
      <!-- 左側：麵包屑巡航列 -->
      <div class="pointer-events-auto flex items-center gap-1.5 bg-[#08090C]/90 backdrop-blur-md px-3 py-1.5 rounded-[4px] border border-[#2B303C] shadow-xl font-mono text-[11px] shrink-0">
        <button
          type="button"
          onclick={resetView}
          class="text-[#FEC486] hover:text-white flex items-center gap-1 font-bold cursor-pointer transition-colors"
          title="返回全宇宙全景 (快捷鍵 R / Home / 0)"
        >
          <Compass class="w-3.5 h-3.5 text-[#FEC486]" />
          <span class="hidden sm:inline">全宇宙</span>
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
            class="hover:text-white font-bold cursor-pointer transition-colors flex items-center gap-1 max-w-[90px] sm:max-w-[140px] truncate"
            style="color: {activeSectorDef.color};"
            title="返回【{activeSectorDef.name}】"
          >
            <span class="truncate">{activeSectorDef.name}</span>
          </button>
        {/if}

        {#if selectedSubGenre}
          <ChevronRight class="w-3 h-3 text-[#52565E]" />
          <button
            type="button"
            onclick={() => selectSubGenreFilter(selectedSubGenre)}
            class="text-[#EEF0F2] hover:text-[#FEC486] font-bold cursor-pointer transition-colors max-w-[80px] sm:max-w-[120px] truncate"
            title="聚焦子流派【{selectedSubGenre}】"
          >
            <span class="truncate">{selectedSubGenre}</span>
          </button>
        {/if}

        {#if selectedArtist}
          <ChevronRight class="w-3 h-3 text-[#52565E]" />
          <button
            type="button"
            onclick={focusSelected}
            class="text-[#FEC486] hover:underline font-serif font-bold truncate max-w-[80px] sm:max-w-[120px] cursor-pointer"
            title="聚焦【{selectedArtist.name}】(快捷鍵 F)"
          >
            {selectedArtist.name}
          </button>
        {/if}
      </div>

      <!-- 中間：八大太陽系快速切換膠囊 (Google Maps 式探索 Pills，支援橫向滑動) -->
      <div class="pointer-events-auto flex items-center gap-1 bg-[#08090C]/85 backdrop-blur-md p-1 rounded-[4px] border border-[#2B303C] shadow-xl overflow-x-auto max-w-[50%] md:max-w-[55%] no-scrollbar">
        <button
          type="button"
          onclick={resetView}
          class="px-2.5 py-1 rounded-[2px] font-mono text-[11px] cursor-pointer transition-all shrink-0 flex items-center gap-1 {activeSectorFilter === 'all' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
          title="全宇宙"
        >
          <Orbit class="w-3 h-3 text-[#FEC486]" />
          <span>全宇宙 ({artists.length})</span>
        </button>

        {#each hierarchicalData.suns as sun}
          <button
            type="button"
            onclick={() => navigateToSun(sun)}
            class="px-2 py-1 rounded-[2px] font-mono text-[11px] cursor-pointer transition-all shrink-0 flex items-center gap-1 {activeSectorFilter === sun.key ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            title="前往【{sun.name}】({sun.nameEn})"
          >
            <span style="color: {sun.color};">
              {@render sectorIcon(sun.icon, "w-3 h-3")}
            </span>
            <span>{sun.name}</span>
            {#if sun.artistCount > 0}
              <span class="text-[9px] opacity-70">({sun.artistCount})</span>
            {/if}
          </button>
        {/each}

        <button
          type="button"
          onclick={() => {
            activeSectorFilter = 'inbox';
            selectedSubGenre = null;
          }}
          class="px-2 py-1 rounded-[2px] font-mono text-[11px] cursor-pointer transition-all shrink-0 text-[#FA383E] {activeSectorFilter === 'inbox' ? 'bg-[#2B0E12] font-bold border border-[#FA383E]/50' : 'hover:bg-[#1A0A0C]'}"
        >
          待探索 ({artists.filter((a) => a.status === 'inbox').length})
        </button>
      </div>

      <!-- 右側：藝人名錄檢索按鈕 & 全螢幕開關 -->
      <div class="pointer-events-auto flex items-center gap-1 bg-[#08090C]/90 backdrop-blur-md p-1 rounded-[4px] border border-[#2B303C] shadow-xl font-mono text-xs shrink-0">
        <button
          type="button"
          onclick={() => (isRosterDrawerOpen = !isRosterDrawerOpen)}
          class="px-2 py-1 rounded-[2px] cursor-pointer transition-all flex items-center gap-1.5 {isRosterDrawerOpen ? 'bg-[#1C2027] text-[#FEC486] border border-[#FEC486]/40' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
          title="開啟藝人名錄檢索抽屜"
        >
          <List class="w-3.5 h-3.5 text-[#FEC486]" />
          <span class="hidden sm:inline font-bold">名錄</span>
        </button>

        <button
          type="button"
          onclick={toggleFullscreen}
          class="p-1 rounded-[2px] text-[#8E9298] hover:text-[#FEC486] transition-colors cursor-pointer"
          title={isFullscreen ? '退出全螢幕' : '進入全螢幕漫遊'}
        >
          {#if isFullscreen}
            <Minimize2 class="w-3.5 h-3.5" />
          {:else}
            <Maximize2 class="w-3.5 h-3.5" />
          {/if}
        </button>
      </div>
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
                title="前往 {sun.name} ({sun.nameEn})"
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

        <!-- 畫布右下角：全功能星系 HUD 導航控制台 (Floating Cosmic Control Dock HUD) -->
        <div class="hud-controls absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2 pointer-events-auto select-none">
          <!-- 質量門檻快選懸浮面板 (點擊 WT 按鈕展開) -->
          {#if isWeightSliderOpen}
            <div class="p-3 bg-[#08090C]/95 backdrop-blur-md rounded border border-[#2B303C] shadow-2xl flex flex-col gap-2 font-mono text-xs w-64 animate-fadeIn">
              <div class="flex items-center justify-between text-[#8E9298]">
                <span class="flex items-center gap-1 text-[#FEC486] font-bold">
                  <Sliders class="w-3.5 h-3.5" />
                  <span>天體質量過濾閥 (WT)</span>
                </span>
                <span class="text-[#FEC486] font-bold">
                  {minWeightFilter > 1 ? `≥ ${minWeightFilter}` : 'ALL'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="80"
                step="5"
                bind:value={minWeightFilter}
                class="w-full accent-[#FEC486] cursor-pointer"
              />
              <div class="flex justify-between text-[9px] text-[#52565E]">
                <span>全部天體 (1)</span>
                <span>中量恆星 (40)</span>
                <span>超重恆星 (80)</span>
              </div>
            </div>
          {/if}

          <!-- 控制塢主工具列 -->
          <div class="flex items-center gap-1 bg-[#08090C]/90 backdrop-blur-md p-1.5 rounded border border-[#2B303C] shadow-2xl font-mono text-xs">
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
              class="px-2 h-7 flex items-center justify-center bg-[#12141A] hover:bg-[#1C2029] text-[#FEC486] hover:text-[#FFA552] text-xs font-bold rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer"
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

            <!-- 引力光束開關 -->
            <button
              type="button"
              onclick={() => (showGravityLines = !showGravityLines)}
              class="h-7 px-2 flex items-center gap-1 bg-[#12141A] hover:bg-[#1C2029] rounded-[3px] border transition-colors cursor-pointer {showGravityLines ? 'text-[#FEC486] border-[#FEC486]/50 bg-[#FEC486]/10' : 'text-[#8E9298] border-[#1F2228]'}"
              title="跨星系 AI 引力光束開關"
            >
              <Layers class="w-3.5 h-3.5" />
              <span class="hidden md:inline text-[11px] font-bold">引力束</span>
            </button>

            <!-- 質量過濾開關 -->
            <button
              type="button"
              onclick={() => (isWeightSliderOpen = !isWeightSliderOpen)}
              class="h-7 px-2 flex items-center gap-1 bg-[#12141A] hover:bg-[#1C2029] rounded-[3px] border transition-colors cursor-pointer {isWeightSliderOpen || minWeightFilter > 1 ? 'text-[#FEC486] border-[#FEC486]/50 bg-[#FEC486]/10' : 'text-[#8E9298] border-[#1F2228]'}"
              title="天體質量過濾閥"
            >
              <Sliders class="w-3.5 h-3.5" />
              <span class="hidden md:inline text-[11px] font-bold">WT:{minWeightFilter > 1 ? minWeightFilter : 'ALL'}</span>
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
              <span class="hidden lg:inline text-[11px] font-bold text-[#EEF0F2] group-hover:text-[#FEC486]">全宇宙 [R]</span>
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
              <span class="hidden lg:inline text-[11px] font-bold">聚焦 [F]</span>
            </button>

            <!-- 操作手冊按鈕 -->
            <button
              type="button"
              onclick={() => (showGuideModal = !showGuideModal)}
              class="h-7 px-2 flex items-center gap-1 bg-[#12141A] hover:bg-[#1C2029] text-[#8E9298] hover:text-[#FEC486] text-xs rounded-[3px] border border-[#1F2228] transition-colors cursor-pointer group {showGuideModal ? 'text-[#FEC486] border-[#FEC486]/50 bg-[#FEC486]/10 shadow-[0_0_8px_rgba(254,196,134,0.2)]' : ''}"
              title="星系導航與操作手冊 (快捷鍵 ? 或 /)"
            >
              <HelpCircle class="w-3.5 h-3.5 text-[#FEC486]" />
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
              : isPanningCanvas || draggingArtistId || isWheelZooming
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
              <!-- 深空星雲氣體微粒擾動濾鏡 (Nebular Gas Disturbance) -->
              <filter id="nebula-dust-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
              </filter>

              {#each hierarchicalData.suns as sun}
                <radialGradient id="sun-glow-{sun.key}" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#040507" stop-opacity="0" />
                  <stop offset="12%" stop-color={sun.color} stop-opacity="0.35" />
                  <stop offset="28%" stop-color={sun.color} stop-opacity="0.16" />
                  <stop offset="60%" stop-color={sun.secondaryColor} stop-opacity="0.05" />
                  <stop offset="100%" stop-color="#040507" stop-opacity="0" />
                </radialGradient>
              {/each}

              <radialGradient id="nexus-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FA383E" stop-opacity="0.15" />
                <stop offset="45%" stop-color="#E0A96D" stop-opacity="0.05" />
                <stop offset="100%" stop-color="#040507" stop-opacity="0" />
              </radialGradient>
            </defs>

            <!-- 宇宙中央原點 NEXUS 彗星群光環 -->
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="280" fill="url(#nexus-glow)" />
            <circle cx={GALAXY_CENTER.x} cy={GALAXY_CENTER.y} r="820" fill="none" stroke="#1F232E" stroke-width="1.2" stroke-dasharray="4 8" />

            <!-- 1. 太陽母星三大層級星雲氣旋與天文星盤軌道環 (480px 領地輝光) -->
            {#each hierarchicalData.suns as sun}
              {@const isSunActive = activeSectorFilter === sun.key || activeSectorFilter === 'all'}
              <!-- 巨集星雲光暈領地 (Radius 480px) 加上微擾動濾鏡消除純平滑色帶 -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="480"
                fill="url(#sun-glow-{sun.key})"
                opacity={isSunActive ? 0.95 : 0.16}
                filter="url(#nebula-dust-filter)"
                class="transition-opacity duration-500"
              />
              <!-- 精密天文度盤外刻度環 (Radius 210px) -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="210"
                fill="none"
                stroke={sun.color}
                stroke-width="0.75"
                stroke-dasharray="2 12"
                stroke-opacity={isSunActive ? 0.35 : 0.08}
              />
              <!-- 精密象限參考環 (Radius 165px) -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="165"
                fill="none"
                stroke="#EEF0F2"
                stroke-width="0.5"
                stroke-opacity={isSunActive ? 0.22 : 0.06}
              />
              <!-- 天文星盤微刻度旋轉軌道 (Radius 135px，深色髮絲線) -->
              <circle
                cx={sun.x}
                cy={sun.y}
                r="135"
                fill="none"
                stroke="#3E4554"
                stroke-width="0.6"
                stroke-dasharray="2 8"
                stroke-opacity={isSunActive ? 0.35 : 0.08}
                class="animate-spin"
                style="transform-origin: {sun.x}px {sun.y}px; animation-duration: 90s;"
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
              <!-- 1. 【邊旋轉 × 邊呼吸】精密天文星盤複合動態環 (無螢光、純機械工藝) -->
              <div class="absolute inset-0 pointer-events-none celestial-breathe">
                <!-- 旋轉刻線環 (以 24s 順時針平穩自轉，刻度線清晰有力) -->
                <div
                  class="absolute -inset-4 rounded-full pointer-events-none animate-spin transition-opacity duration-500 {isSunActive ? 'opacity-80' : 'opacity-25'}"
                  style="
                    border: 1.2px dashed {sun.color};
                    border-dasharray: 4 8;
                    animation-duration: 24s;
                  "
                >
                  <!-- 4 個隨自轉巡航的天文象限微刻點 (Cardinal Tracking Ticks) -->
                  <span class="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style="background-color: {sun.color};"></span>
                  <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style="background-color: {sun.color};"></span>
                  <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="background-color: {sun.color};"></span>
                  <span class="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="background-color: {sun.color};"></span>
                </div>

                <!-- 靜止天文基準環 (提供相對運動參照系，彰顯自轉機械齒輪感) -->
                <div
                  class="absolute -inset-2 rounded-full pointer-events-none transition-opacity duration-500 {isSunActive ? 'opacity-40' : 'opacity-15'}"
                  style="border: 0.5px solid rgba(255, 255, 255, 0.22);"
                ></div>
              </div>

              <!-- 2. 近核微刻度基準環 (Inner Hairline Bezel - 暗色調微勾邊，非螢光) -->
              <div
                class="absolute -inset-1 rounded-full pointer-events-none transition-opacity duration-300 {isSunActive ? 'opacity-60' : 'opacity-20'}"
                style="
                  border: 0.75px solid {sun.color}40;
                "
              ></div>

              <!-- 4. 曜石暗核天體本體 (深邃無反光、黑膠同心暗紋、深碳沉穩質地) -->
              <div
                class="w-full h-full rounded-full flex flex-col items-center justify-center text-center p-3.5 relative transition-all group-hover:scale-105 overflow-hidden z-10"
                style="
                  background:
                    repeating-radial-gradient(circle at center, transparent 0px, transparent 1.5px, rgba(255,255,255,0.02) 2px, transparent 2.5px),
                    radial-gradient(circle at center, #0B0E14 0%, #07080C 70%, #030406 100%);
                  border: 1px solid rgba(255, 255, 255, 0.16);
                  box-shadow:
                    inset 0 1px 1px rgba(255, 255, 255, 0.14),
                    inset 0 0 22px rgba(0, 0, 0, 0.98),
                    0 2px 8px rgba(0, 0, 0, 0.5);
                "
              >
                <!-- 曜石深空微光呼吸 -->
                <div
                  class="absolute inset-0 rounded-full border border-white/20 animate-pulse opacity-15 pointer-events-none"
                  style="animation-duration: 5s;"
                ></div>

                <!-- 星光雷射蝕刻流派圖示 -->
                <div
                  class="mb-1 transition-transform duration-300 group-hover:scale-110"
                  style="color: {sun.color}; filter: drop-shadow(0 0 6px {sun.color}bb);"
                >
                  {@render sectorIcon(sun.icon, "w-6 h-6")}
                </div>

                <!-- 星光蝕刻全稱標題與英文名 -->
                <div class="flex flex-col items-center pointer-events-none px-1">
                  <span class="font-serif text-xs font-black text-[#EEF0F2] tracking-tight leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] text-center">
                    {sun.name}
                  </span>
                  <span
                    class="font-mono text-[7px] font-bold tracking-wider uppercase mt-0.5 text-center truncate max-w-[100px]"
                    style="color: {sun.color};"
                  >
                    {sun.nameEn}
                  </span>
                </div>

                <!-- 精密天文天體計數刻度 -->
                <div class="mt-1.5 flex items-center gap-1 font-mono text-[8px] text-[#8E9298] tracking-widest uppercase pointer-events-none">
                  <span class="w-1 h-1 rounded-full" style="background-color: {sun.color};"></span>
                  <span class="font-bold text-[#EEF0F2]">{sun.artistCount}</span>
                  <span class="text-[7px] text-[#52565E]">STARS</span>
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
              class="subgenre-node absolute flex flex-col items-center justify-center cursor-pointer group z-25 transition-transform duration-200 hover:scale-110"
              style="left: {sub.x - sub.size / 2}px; top: {sub.y - sub.size / 2}px; width: {sub.size}px; height: {sub.size}px;"
            >
              <!-- Sub 節點晶片本體 -->
              <div
                class="w-full h-full rounded-2xl flex flex-col items-center justify-center text-center p-1.5 shadow-lg relative border transition-all {isSubActive
                  ? 'bg-[#161A24] border-2 border-[#FEC486] ring-1 ring-[#FEC486]/50'
                  : 'bg-[#0C0E14] border border-[#2B303C] hover:border-[#FEC486]'}"
                style="box-shadow: {isSubActive ? `0 0 16px ${sub.color}60` : 'none'};"
              >
                <span class="font-mono text-[7px] text-[#8E9298] uppercase leading-none tracking-widest font-bold">SUB</span>
                <span class="font-mono text-[11px] text-[#FEC486] font-bold mt-1">
                  {sub.artistCount}
                </span>
                <span class="font-mono text-[6px] text-[#52565E] uppercase tracking-tighter">BODIES</span>
              </div>

              <!-- 外部懸浮完整子流派全名標籤 (不遮擋、不裁切) -->
              <div
                class="absolute top-[calc(100%+4px)] left-1/2 -translate-x-1/2 z-35 pointer-events-none px-2 py-0.5 rounded-[3px] bg-[#080A0F]/90 backdrop-blur-md border border-[#262C38] shadow-md text-center whitespace-nowrap max-w-[130px] group-hover:border-[#FEC486]/60 transition-colors"
              >
                <span class="font-serif text-[10px] font-bold text-[#EEF0F2] group-hover:text-[#FEC486] leading-tight block truncate">
                  {sub.name}
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
            {@const haloGlow = isSelected
              ? '0 0 16px rgba(254,196,134,0.65), inset 0 0 8px rgba(254,196,134,0.35)'
              : isGasGiant
              ? '0 0 14px rgba(224,169,109,0.38)'
              : 'none'}
            {@const showLabel = zoomLevel >= 55 || isSelected}
            {@const showDetails = zoomLevel >= 85 || isSelected}

            <div
              role="button"
              tabindex="0"
              onmousedown={(e) => handleNodeMouseDown(e, artist.id)}
              onclick={(e) => handleSelectArtistNode(artist.id, e)}
              onkeydown={(e) => e.key === 'Enter' && handleSelectArtistNode(artist.id, e)}
              class="artist-star-node absolute flex flex-col items-center justify-center z-30 cursor-grab active:cursor-grabbing group {isDraggingThis ? 'z-50 scale-110' : ''}"
              style="
                left: {pos.x - pos.size / 2}px;
                top: {pos.y - pos.size / 2}px;
                width: {pos.size}px;
                height: {pos.size}px;
                transition: {isDraggingThis ? 'none' : 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, left 0.1s ease-out, top 0.1s ease-out, width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'};
              "
            >
              <!-- 聲學引力波震盪漣漪 (Gravitational Shockwave Ripple) -->
              {#if weightFeedback && weightFeedback.artistId === artist.id}
                {#key rippleKey}
                  <div
                    class="gravity-shockwave pointer-events-none absolute -inset-2 rounded-full border-2 {weightFeedback.isGasGiantBreakthrough ? 'border-[#FA383E] shadow-[0_0_20px_#FA383E]' : 'border-[#FEC486] shadow-[0_0_15px_#FEC486]'}"
                  ></div>
                {/key}
              {/if}

              <!-- 天體頭頂即時 HUD 浮動刻度膠囊 (快捷鍵 / 滾輪微調即時反饋) -->
              {#if weightFeedback && weightFeedback.artistId === artist.id}
                <div
                  class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center whitespace-nowrap"
                >
                  <div class="px-2 py-0.5 rounded-[4px] font-mono text-[11px] font-bold shadow-[0_0_16px_rgba(0,0,0,0.9)] border flex items-center gap-1.5 {weightFeedback.isGasGiantBreakthrough ? 'bg-[#2B0E12] border-[#FA383E] text-[#FEC486]' : 'bg-[#090C12] border-[#FEC486] text-[#FEC486]'}">
                    <span class={weightFeedback.delta > 0 ? 'text-[#63C78B]' : 'text-[#FA383E]'}>
                      {weightFeedback.delta > 0 ? `+${weightFeedback.delta}` : weightFeedback.delta}
                    </span>
                    <span class="text-[#8E9298] text-[9px]">➔</span>
                    <span class="text-white">W{weightFeedback.newWeight}</span>
                    {#if weightFeedback.isGasGiantBreakthrough}
                      <span class="text-[#FA383E] text-[9px] animate-pulse">💥 氣態巨星!</span>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- 行星外環 (拉絲金屬與真空管琥珀收斂環) -->
              <div
                class="w-full h-full rounded-full p-1 transition-all flex items-center justify-center {isSelected
                  ? 'bg-gradient-to-tr from-[#FA383E] via-[#FEC486] to-[#FA383E] ring-1 ring-[#FEC486]/80'
                  : isGasGiant
                  ? 'bg-gradient-to-tr from-[#E0A96D] via-[#1C1F26] to-[#E0A96D] border border-[#E0A96D]/80'
                  : 'bg-[#15171C] border border-[#2C313B] hover:border-[#E0A96D]'}"
                style="box-shadow: {haloGlow};"
              >
                <!-- 行星黑膠/肖像鏡面載體 (100% 純淨不遮擋圖片，同心黑膠刻紋) -->
                <div
                  class="w-full h-full rounded-full bg-[#08090C] overflow-hidden relative flex flex-col items-center justify-center p-1 text-center shadow-inner"
                  style="
                    background-image:
                      repeating-radial-gradient(circle at center, transparent 0px, transparent 1.5px, rgba(255,255,255,0.035) 2px, transparent 2.5px),
                      radial-gradient(circle at center, #11141A 0%, #050608 100%);
                  "
                >
                  {#if artist.coverImage}
                    <img
                      src={artist.coverImage}
                      alt={artist.name}
                      class="absolute inset-0 w-full h-full object-cover {isSelected ? 'opacity-95' : 'opacity-75 group-hover:opacity-95'} transition-opacity pointer-events-none"
                    />
                    <!-- 黑膠同心刻紋覆蓋層 -->
                    <div
                      class="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
                      style="background-image: repeating-radial-gradient(circle at center, transparent 0px, transparent 2px, rgba(255,255,255,0.12) 3px);"
                    ></div>
                    <!-- 黑膠中心微軸孔 (Center Spindle) -->
                    <div class="w-1.5 h-1.5 rounded-full bg-[#050608] border border-white/30 z-10 pointer-events-none"></div>
                  {:else}
                    <!-- 無封面時：黑膠中心唱片標籤紙與音樂圖示 -->
                    <div class="w-5 h-5 rounded-full bg-[#151922] border border-[#2B313D] flex items-center justify-center pointer-events-none">
                      <Music class="w-2.5 h-2.5 text-[#FEC486]/70" />
                    </div>
                  {/if}
                </div>
              </div>

              <!-- 外部懸浮完整全名標籤膠囊 (不遮擋天體圖片、完整顯示藝人全名) -->
              {#if showLabel}
                <div
                  class="absolute top-[calc(100%+5px)] left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center transition-all duration-200 {isSelected ? 'scale-105' : 'group-hover:scale-105'}"
                >
                  <div
                    class="px-2 py-0.5 rounded-[3px] bg-[#07090E]/92 backdrop-blur-md border {isSelected
                      ? 'border-[#FEC486] shadow-[0_2px_10px_rgba(254,196,134,0.35)]'
                      : 'border-[#262C38] group-hover:border-[#FEC486]/70'} shadow-lg flex flex-col items-center text-center whitespace-nowrap max-w-[140px] transition-colors"
                  >
                    <!-- 藝人完整全名 (不裁切單詞，完整呈現) -->
                    <span
                      class="font-serif font-bold text-[11px] {isSelected ? 'text-[#FEC486]' : 'text-[#EEF0F2] group-hover:text-[#FEC486]'} leading-tight block truncate max-w-full"
                      title={artist.name}
                    >
                      {artist.name}
                    </span>

                    <!-- 規格微標籤 (Weight / Inbox) -->
                    {#if showDetails}
                      <div class="flex items-center gap-1 mt-0.5 font-mono text-[8px] leading-none">
                        <span class="text-[#FEC486] font-bold">W{weight}</span>
                        {#if artist.status === 'inbox'}
                          <span class="text-[#52565E]">·</span>
                          <span class="text-[#FA383E] uppercase font-bold px-1 bg-[#2B0E12] rounded-[2px]">RAW</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {:else}
                <!-- 宏觀深空極簡模式：小星點光芒提示 -->
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#FEC486] shadow-[0_0_6px_#FEC486] pointer-events-none"></div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- 畫布層全螢幕操作手冊彈窗 (HUD Navigation Manual Modal) -->
        {#if showGuideModal}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onwheel={(e) => e.stopPropagation()}
            class="guide-modal-container absolute inset-0 z-40 bg-[#040507]/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-200"
            onclick={(e) => {
              if (e.target === e.currentTarget) showGuideModal = false;
            }}
          >
            <div class="relative w-full max-w-2xl bg-[#0B0D12] border border-[#FEC486]/30 rounded-[4px] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] font-sans flex flex-col gap-5 text-[#EEF0F2] select-none">
              <!-- 裝飾邊角發光指示 -->
              <div class="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-[#FEC486]"></div>
              <div class="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-[#FEC486]"></div>
              <div class="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-[#FEC486]"></div>
              <div class="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-[#FEC486]"></div>

              <!-- 彈窗頂部標題與關閉按鈕 -->
              <div class="flex items-center justify-between border-b border-[#1F232E] pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-2.5 h-2.5 rounded-full bg-[#FEC486] shadow-[0_0_8px_#FEC486]"></div>
                  <div>
                    <h3 class="font-mono text-sm font-bold text-[#FEC486] tracking-wider uppercase">
                      星系導航與操作手冊 · CELESTIAL NAV MANUAL
                    </h3>
                    <p class="font-mono text-[10px] text-[#8E9298]">GOOGLE MAPS 級游標縮放 · 物理引力排斥 · 快捷鍵速查</p>
                  </div>
                </div>

                <button
                  type="button"
                  onclick={() => (showGuideModal = false)}
                  class="w-7 h-7 flex items-center justify-center rounded-[3px] bg-[#14161F] hover:bg-[#202430] border border-[#2B303C] text-[#8E9298] hover:text-white transition-colors cursor-pointer"
                  title="關閉手冊 (快捷鍵 Esc 或 ?)"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- 快捷鍵與操作網格 (4 大核心互動模組) -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <!-- 1. 地圖航行與視角控制 (Google Maps 級體驗) -->
                <div class="p-3 bg-[#07080B] rounded border border-[#1C2027] flex flex-col gap-2">
                  <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#FEC486] border-b border-[#181B22] pb-1.5">
                    <Compass class="w-3.5 h-3.5 text-[#FEC486]" />
                    <span>01. 地圖航行與視角導航</span>
                  </div>
                  <ul class="flex flex-col gap-1.5 text-[11px] text-[#8E9298] font-mono leading-relaxed">
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">滑鼠滾輪</span>
                      <span class="text-[#FEC486] font-bold">以游標為中心即時平滑縮放</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">滑鼠左鍵拖曳 / Space + 拖曳</span>
                      <span>自由平移星系視野</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">畫布空白處雙擊</span>
                      <span>向游標點平滑拉近</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">方向鍵 ↑ ↓ ← →</span>
                      <span>平移微調 (Pan)</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">R / Home / 0</span>
                      <span class="text-[#FEC486]">一鍵復位全宇宙視角</span>
                    </li>
                  </ul>
                </div>

                <!-- 2. 星體與藝人互動動力學 -->
                <div class="p-3 bg-[#07080B] rounded border border-[#1C2027] flex flex-col gap-2">
                  <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#84D2C5] border-b border-[#181B22] pb-1.5">
                    <Orbit class="w-3.5 h-3.5 text-[#84D2C5]" />
                    <span>02. 星體互動與動態排斥</span>
                  </div>
                  <ul class="flex flex-col gap-1.5 text-[11px] text-[#8E9298] font-mono leading-relaxed">
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">單擊藝人行星</span>
                      <span>選取並開啟單星檔案</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">按住拖曳藝人星體</span>
                      <span class="text-[#84D2C5] font-bold">自由擺放 + 鄰居連鎖彈性推開</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">F 鍵</span>
                      <span class="text-[#FEC486]">鏡頭平滑飛航聚焦選中星體</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">Esc 鍵</span>
                      <span>關閉指南或取消選取藝人</span>
                    </li>
                  </ul>
                </div>

                <!-- 3. 聲學引力質量 Weight 調節 -->
                <div class="p-3 bg-[#07080B] rounded border border-[#1C2027] flex flex-col gap-2">
                  <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#FFA552] border-b border-[#181B22] pb-1.5">
                    <Flame class="w-3.5 h-3.5 text-[#FFA552]" />
                    <span>03. 聲學引力質量 (Weight)</span>
                  </div>
                  <ul class="flex flex-col gap-1.5 text-[11px] text-[#8E9298] font-mono leading-relaxed">
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">Alt + 滾輪</span>
                      <span class="text-[#FFA552] font-bold">快速增減選取星體質量 (±2)</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">+ / - 或 [ / ]</span>
                      <span>步長微調質量 (Shift 鍵 ±10)</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">質量 ≥ 70</span>
                      <span class="text-[#FFA552]">躍遷為「氣態巨行星」輝光巨星</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">引力震盪波</span>
                      <span>質量更動時釋放天體重力漣漪</span>
                    </li>
                  </ul>
                </div>

                <!-- 4. 雷達與高階巡航 -->
                <div class="p-3 bg-[#07080B] rounded border border-[#1C2027] flex flex-col gap-2">
                  <div class="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#A0B4D8] border-b border-[#181B22] pb-1.5">
                    <Layers class="w-3.5 h-3.5 text-[#A0B4D8]" />
                    <span>04. 雷達巡航與巨集母星</span>
                  </div>
                  <ul class="flex flex-col gap-1.5 text-[11px] text-[#8E9298] font-mono leading-relaxed">
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">點擊左下雷達母星</span>
                      <span class="text-[#A0B4D8]">相機高速跳躍至指定母星系</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">按住拖曳雷達矩形框</span>
                      <span>相機視野即時同步航行</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">點擊母星核心或子流派</span>
                      <span>聚焦母星或篩選該子類別</span>
                    </li>
                    <li class="flex items-start justify-between">
                      <span class="text-[#EEF0F2]">Shift + 滾輪</span>
                      <span>水平快速平移 (Horizontal Pan)</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- 彈窗底部狀態列 -->
              <div class="flex items-center justify-between border-t border-[#1F232E] pt-3 font-mono text-[11px] text-[#8E9298]">
                <span>提示：隨時按下 <kbd class="px-1.5 py-0.5 bg-[#1C2027] border border-[#2B303C] rounded text-[#FEC486] font-bold">?</kbd> 鍵可開啟或關閉本手冊</span>
                <button
                  type="button"
                  onclick={() => (showGuideModal = false)}
                  class="px-4 py-1 rounded bg-[#FEC486] hover:bg-[#FFA552] text-[#040507] font-bold transition-colors cursor-pointer"
                >
                  開始探索
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- 桌面版：右側懸浮半透明毛玻璃解剖艙抽屜 (Slide-over Dossier Panel) -->
        {#if isDossierOpen && selectedArtist}
          <aside
            onwheel={(e) => e.stopPropagation()}
            class="hidden xl:flex absolute top-14 bottom-4 right-4 z-40 w-[420px] max-w-[calc(100vw-2rem)] bg-[#090B0E]/95 backdrop-blur-xl border border-[#2B303C] rounded-[6px] shadow-2xl flex-col overflow-hidden animate-fadeIn"
          >
            <!-- 抽屜頂部控制列 -->
            <div class="px-4 py-3 border-b border-[#1F2228] flex items-center justify-between bg-[#050608]/80">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[#FEC486] animate-pulse"></span>
                <span class="font-mono text-xs text-[#FEC486] font-bold">星體解剖艙 // DOSSIER</span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  onclick={() => focusSelected()}
                  class="p-1 hover:bg-[#1C2027] text-[#8E9298] hover:text-[#FEC486] rounded text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  title="聚焦天體 [F]"
                >
                  <Crosshair class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onclick={() => (isDossierOpen = false)}
                  class="p-1 hover:bg-[#1C2027] text-[#8E9298] hover:text-white rounded cursor-pointer transition-colors"
                  title="關閉卡片 [Esc]"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
            </div>

            {@render dossierBody(selectedArtist)}
          </aside>
        {/if}

        <!-- 浮動藝人名錄檢索抽屜 (Roster Drawer - Slide-over) -->
        {#if isRosterDrawerOpen}
          <aside
            onwheel={(e) => e.stopPropagation()}
            class="absolute top-14 bottom-4 left-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] bg-[#090B0E]/95 backdrop-blur-xl border border-[#2B303C] rounded-[6px] shadow-2xl flex flex-col overflow-hidden animate-fadeIn"
          >
            {@render rosterDrawer()}
          </aside>
        {/if}
      </div>

  <!-- 行動端：Mobile Bottom Sheet 藝人解剖艙卡片 (點選星體時展開，比照藝人展間) -->
  {#if isDossierOpen && selectedArtist}
    <!-- 霧黑半透明背景遮罩 (Backdrop) -->
    <div
      role="button"
      tabindex="0"
      onclick={() => (isDossierOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (isDossierOpen = false)}
      class="xl:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
      aria-label="收合解剖艙卡片"
    ></div>

    <!-- 底部抽屜卡片本體 (Bottom Sheet) -->
    <div
      class="xl:hidden fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] bg-[#090B0E]/98 backdrop-blur-xl border-t border-[#2B303C] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out"
    >
      <!-- 金屬滑動把手與關閉按鈕 -->
      <div class="pt-2.5 pb-2 px-4 border-b border-[#1F2228] flex flex-col items-center gap-2 bg-[#050608]/80">
        <div class="w-12 h-1 bg-[#2B303C] rounded-full"></div>
        <div class="flex items-center justify-between w-full">
          <span class="font-mono text-xs text-[#FEC486] font-bold flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-[#FEC486] animate-pulse"></span>
            <span>藝人星體檔案 // DOSSIER</span>
          </span>
          <button
            type="button"
            onclick={() => (isDossierOpen = false)}
            class="px-2.5 py-1 bg-[#14161B] border border-[#2B303C] text-[#8E9298] hover:text-[#FEC486] rounded font-mono text-[10px] transition-colors cursor-pointer"
          >
            收合面板
          </button>
        </div>
      </div>

      {@render dossierBody(selectedArtist)}
    </div>
  {/if}

</div>

<style>
  @keyframes celestialBreathe {
    0%, 100% {
      transform: scale(0.96);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.95;
    }
  }

  .celestial-breathe {
    animation: celestialBreathe 4.5s ease-in-out infinite;
  }

  @keyframes gravityShockwave {
    0% {
      transform: scale(0.9);
      opacity: 0.95;
    }
    100% {
      transform: scale(2.6);
      opacity: 0;
    }
  }

  .gravity-shockwave {
    animation: gravityShockwave 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>

