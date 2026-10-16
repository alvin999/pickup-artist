import type { AcousticSector, ArtistEntry } from '$lib/types/artist';

export const GALAXY_CANVAS_SIZE = 2600;
export const GALAXY_CENTER = { x: 1300, y: 1300 };

/**
 * 8 軸聲學星系羅盤規格定義
 */
export interface SectorConfig {
  key: AcousticSector;
  name: string;
  shortName: string;
  nameEn: string;
  icon: string;           // 專屬天體流派圖示 (Guitar, Flame, Landmark, Disc3, Waves, Cpu, Activity, Globe)
  angleDeg: number;       // 0° ~ 360°
  color: string;          // 太陽日冕主色
  secondaryColor: string; // 漸層次色
  description: string;
}

export const ACOUSTIC_SECTORS: SectorConfig[] = [
  {
    key: 'ROCK',
    name: '搖滾與後搖',
    shortName: '搖滾',
    nameEn: 'Rock & Post-Rock',
    icon: 'Guitar',
    angleDeg: 0,
    color: '#FEC486',
    secondaryColor: '#E0A96D',
    description: '器樂搖滾、數學搖滾、前衛搖滾、獨立搖滾與瞪鞋派系'
  },
  {
    key: 'METAL',
    name: '重型與前衛金屬',
    shortName: '金屬',
    nameEn: 'Metalcore / Sludge / Extreme',
    icon: 'Flame',
    angleDeg: 45,
    color: '#FA383E',
    secondaryColor: '#9E0A12',
    description: '超低弦下壓、極限爆發瞬態與密集雙大鼓打擊'
  },
  {
    key: 'CLASSICAL',
    name: '古典版本學與詮釋',
    shortName: '古典',
    nameEn: 'Classical / Chamber / Baroque',
    icon: 'Landmark',
    angleDeg: 90,
    color: '#A0B4D8',
    secondaryColor: '#5C749E',
    description: '大編制管弦交響、原木廳堂自然殘響與樂派版本考證'
  },
  {
    key: 'JAZZ',
    name: '當代爵士與融合',
    shortName: '爵士',
    nameEn: 'Modern Jazz / Modal / Trio',
    icon: 'Disc3',
    angleDeg: 135,
    color: '#E8B06C',
    secondaryColor: '#B07530',
    description: '即興微動態、低音大提琴撥弦空氣感與清脆鈸音'
  },
  {
    key: 'AMBIENT',
    name: '氛圍音景與新古典',
    shortName: '氛圍',
    nameEn: 'Ambient / Soundscape / Neo-Classical',
    icon: 'Waves',
    angleDeg: 180,
    color: '#84D2C5',
    secondaryColor: '#3E9687',
    description: '靜謐水滴共鳴、極低底噪、無邊際殘響與空間沈浸'
  },
  {
    key: 'ELECTRONIC',
    name: '前衛電子與合成',
    shortName: '電子',
    nameEn: 'IDM / Glitch / Synthwave',
    icon: 'Cpu',
    angleDeg: 225,
    color: '#BD88EE',
    secondaryColor: '#7A48B2',
    description: '次低音下潛、精確切片微節奏與類比合成器波形'
  },
  {
    key: 'GROOVE',
    name: '律動與靈魂樂',
    shortName: '律動靈魂',
    nameEn: 'Groove & Soul',
    icon: 'Activity',
    angleDeg: 270,
    color: '#FFA552',
    secondaryColor: '#C46A14',
    description: '有機搖擺 Groove、放克、新靈魂、當代節奏藍調與溫潤貝斯線條'
  },
  {
    key: 'WORLD',
    name: '世界民族與根源',
    shortName: '世界根源',
    nameEn: 'World Fusion / Ethno Folk',
    icon: 'Globe',
    angleDeg: 315,
    color: '#D4B886',
    secondaryColor: '#967A48',
    description: '傳統原聲打擊、民族樂器泛音與跨界調性織理'
  }
];

export interface SectorSun {
  key: AcousticSector;
  name: string;
  shortName: string;
  nameEn: string;
  icon: string;
  x: number;
  y: number;
  size: number;
  color: string;
  secondaryColor: string;
  artistCount: number;
}

export interface SubGenreNode {
  id: string; // `${sectorKey}:::${subGenre}`
  sectorKey: AcousticSector;
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  artistCount: number;
  sunCenter: { x: number; y: number };
}

export interface NodePosition {
  x: number;
  y: number;
  size: number;           // 星體直徑 (px)
  sector?: AcousticSector;
  subGenre?: string;
  subNodeId?: string;
  isInbox?: boolean;
  isCustomPos?: boolean;  // 使用者手動拖曳座標標記
  subCenter?: { x: number; y: number };
}

export interface SunToSubEdge {
  id: string;
  sunKey: AcousticSector;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

export interface SubToArtistEdge {
  id: string;
  subNodeId: string;
  artistId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

export interface GravityVector {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePos: { x: number; y: number };
  targetPos: { x: number; y: number };
  strength: number;
  isFocused: boolean;
}

export interface GhostDiscoveryNode {
  name: string;
  parentArtistId: string;
  parentArtistName: string;
  x: number;
  y: number;
  size: number;
}

/**
 * 將使用者 Weight (1 ~ 100) 映射為星體視覺直徑 (px)
 */
export function calculateStarSize(rawWeight?: number): number {
  const weight = Math.max(1, Math.min(100, rawWeight ?? 20));
  return Math.round(32 + Math.sqrt(weight / 100) * 80);
}

/**
 * 簡易字串雜湊
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 圓形彈性互斥演算法 (Elastic Repulsion Relaxer)
 * 當兩節點距離過近時，產生反比排斥向量彈開，保證不重疊
 */
export function relaxCollisions(
  nodes: { id: string; x: number; y: number; size: number; isCustomPos?: boolean }[],
  iterations = 8,
  safetyGap = 20
) {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = (a.size + b.size) / 2 + safetyGap;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          a.x -= nx * (overlap * 0.5);
          a.y -= ny * (overlap * 0.5);
          b.x += nx * (overlap * 0.5);
          b.y += ny * (overlap * 0.5);
        }
      }
    }
  }
}

/**
 * 計算三級天體拓撲：
 * 太陽 (Sun) ➔ Sub 實體節點 (SubNode) ➔ 藝人行星 (Artist)
 */
export function calculateHierarchicalGalaxy(
  artists: ArtistEntry[],
  center = GALAXY_CENTER,
  solarOrbitRadius = 820
): {
  suns: SectorSun[];
  subNodes: SubGenreNode[];
  sunToSubEdges: SunToSubEdge[];
  subToArtistEdges: SubToArtistEdge[];
  posMap: Map<string, NodePosition>;
} {
  const suns: SectorSun[] = [];
  const subNodes: SubGenreNode[] = [];
  const sunToSubEdges: SunToSubEdge[] = [];
  const subToArtistEdges: SubToArtistEdge[] = [];
  const posMap = new Map<string, NodePosition>();

  // 1. 依據 Sector 將藝人歸類
  const sectorMap = new Map<AcousticSector | 'INBOX', ArtistEntry[]>();
  for (const a of artists) {
    if (a.status === 'inbox' && !a.analysis?.sector && !a.clusterSector) {
      const list = sectorMap.get('INBOX') || [];
      list.push(a);
      sectorMap.set('INBOX', list);
    } else {
      const sec = a.analysis?.sector || a.clusterSector || 'ROCK';
      const list = sectorMap.get(sec) || [];
      list.push(a);
      sectorMap.set(sec, list);
    }
  }

  const allNodesForRelax: { id: string; x: number; y: number; size: number; isCustomPos?: boolean }[] = [];

  // 2. 佈局 8 顆太陽母星
  for (const conf of ACOUSTIC_SECTORS) {
    const rad = (conf.angleDeg * Math.PI) / 180;
    const sunX = Math.round(center.x + Math.cos(rad) * solarOrbitRadius);
    const sunY = Math.round(center.y + Math.sin(rad) * solarOrbitRadius);

    const sectorArtists = sectorMap.get(conf.key) || [];

    suns.push({
      key: conf.key,
      name: conf.name,
      shortName: conf.shortName,
      nameEn: conf.nameEn,
      icon: conf.icon,
      x: sunX,
      y: sunY,
      size: 120,
      color: conf.color,
      secondaryColor: conf.secondaryColor,
      artistCount: sectorArtists.length
    });

    // 依據子流派 (subGenre) 聚類
    const subGenreGroups = new Map<string, ArtistEntry[]>();
    for (const a of sectorArtists) {
      const sub = a.analysis?.subGenre || 'General';
      const list = subGenreGroups.get(sub) || [];
      list.push(a);
      subGenreGroups.set(sub, list);
    }

    const subList = Array.from(subGenreGroups.entries());
    const subCount = subList.length;

    // 3. 圍繞太陽佈局 Sub 實體節點 (第 2 級)
    subList.forEach(([subName, subArtists], subIdx) => {
      const subNodeId = `${conf.key}:::${subName}`;
      // Sub 節點環繞太陽半徑約 210px ~ 260px
      const subAngle = subCount === 1 ? rad : rad + ((subIdx - (subCount - 1) / 2) * (0.85 * Math.PI)) / Math.max(1, subCount);
      const subDist = 220 + (subIdx % 2) * 35;
      const subX = Math.round(sunX + Math.cos(subAngle) * subDist);
      const subY = Math.round(sunY + Math.sin(subAngle) * subDist);
      const subSize = Math.max(48, Math.min(72, 44 + subArtists.length * 6));

      const subNode: SubGenreNode = {
        id: subNodeId,
        sectorKey: conf.key,
        name: subName,
        x: subX,
        y: subY,
        size: subSize,
        color: conf.color,
        artistCount: subArtists.length,
        sunCenter: { x: sunX, y: sunY }
      };
      subNodes.push(subNode);

      // 太陽 ➔ Sub 節點主骨幹連線
      sunToSubEdges.push({
        id: `edge:::sun:::${subNodeId}`,
        sunKey: conf.key,
        from: { x: sunX, y: sunY },
        to: { x: subX, y: subY },
        color: conf.color
      });

      // 4. 圍繞 Sub 節點佈局藝人行星 (第 3 級)
      subArtists.sort((a, b) => (b.weight ?? 20) - (a.weight ?? 20));
      const artistCountInSub = subArtists.length;

      subArtists.forEach((artist, aIdx) => {
        // 若使用者曾手動拖曳座標，優先保留
        if (artist.clusterPos && artist.clusterPos.x && artist.clusterPos.y) {
          const pos: NodePosition = {
            x: artist.clusterPos.x,
            y: artist.clusterPos.y,
            size: calculateStarSize(artist.weight),
            sector: conf.key,
            subGenre: subName,
            subNodeId,
            isInbox: artist.status === 'inbox',
            isCustomPos: true,
            subCenter: { x: subX, y: subY }
          };
          posMap.set(artist.id, pos);
          allNodesForRelax.push({ id: artist.id, x: pos.x, y: pos.y, size: pos.size, isCustomPos: true });

          // Sub 節點 ➔ 藝人連線
          subToArtistEdges.push({
            id: `edge:::sub:::${artist.id}`,
            subNodeId,
            artistId: artist.id,
            from: { x: subX, y: subY },
            to: { x: pos.x, y: pos.y },
            color: conf.color
          });
          return;
        }

        // 藝人行星圍繞 Sub 節點環形展開 (半徑 95 ~ 170px)
        const aStep = (2 * Math.PI) / Math.max(1, artistCountInSub);
        const aAngle = subAngle + aIdx * aStep;
        const ring = Math.floor(aIdx / 5);
        const aDist = 105 + ring * 55;

        const ax = Math.round(subX + Math.cos(aAngle) * aDist);
        const ay = Math.round(subY + Math.sin(aAngle) * aDist);
        const size = calculateStarSize(artist.weight);

        const pos: NodePosition = {
          x: ax,
          y: ay,
          size,
          sector: conf.key,
          subGenre: subName,
          subNodeId,
          isInbox: artist.status === 'inbox',
          isCustomPos: false,
          subCenter: { x: subX, y: subY }
        };
        posMap.set(artist.id, pos);
        allNodesForRelax.push({ id: artist.id, x: ax, y: ay, size, isCustomPos: false });

        // Sub 節點 ➔ 藝人連線
        subToArtistEdges.push({
          id: `edge:::sub:::${artist.id}`,
          subNodeId,
          artistId: artist.id,
          from: { x: subX, y: subY },
          to: { x: ax, y: ay },
          color: conf.color
        });
      });
    });
  }

  // 5. 待解剖收件匣 (INBOX) 藝人：置於宇宙核心 NEXUS 00
  const inboxList = sectorMap.get('INBOX') || [];
  inboxList.forEach((artist, index) => {
    if (artist.clusterPos && artist.clusterPos.x && artist.clusterPos.y) {
      const pos: NodePosition = {
        x: artist.clusterPos.x,
        y: artist.clusterPos.y,
        size: calculateStarSize(artist.weight),
        isInbox: true,
        isCustomPos: true,
        subCenter: center
      };
      posMap.set(artist.id, pos);
      allNodesForRelax.push({ id: artist.id, x: pos.x, y: pos.y, size: pos.size, isCustomPos: true });
      return;
    }

    const angle = (index * 137.51 * Math.PI) / 180;
    const dist = 110 + (index % 5) * 45 + Math.floor(index / 5) * 35;
    const x = Math.round(center.x + Math.cos(angle) * dist);
    const y = Math.round(center.y + Math.sin(angle) * dist);
    const size = calculateStarSize(artist.weight);

    const pos: NodePosition = {
      x,
      y,
      size,
      isInbox: true,
      isCustomPos: false,
      subCenter: center
    };
    posMap.set(artist.id, pos);
    allNodesForRelax.push({ id: artist.id, x, y, size, isCustomPos: false });
  });

  // 6. 執行全天體彈性排斥鬆弛，消除所有重疊
  relaxCollisions(allNodesForRelax, 6, 20);
  for (const n of allNodesForRelax) {
    const cur = posMap.get(n.id);
    if (cur) {
      cur.x = n.x;
      cur.y = n.y;
    }
  }

  // 同步更新連線終點
  for (const edge of subToArtistEdges) {
    const p = posMap.get(edge.artistId);
    if (p) {
      edge.to = { x: p.x, y: p.y };
    }
  }

  return {
    suns,
    subNodes,
    sunToSubEdges,
    subToArtistEdges,
    posMap
  };
}

/**
 * 拖曳時的即時彈性互斥推力運算 (Realtime Interactive Elastic Repulsion)
 * 當被拖曳的節點逼近周圍節點時，動態將周圍節點向外推開
 */
export function applyInteractiveRepulsion(
  draggingId: string,
  draggingPos: { x: number; y: number },
  nodes: { id: string; x: number; y: number; size: number }[],
  safetyGap = 24
): Record<string, { x: number; y: number }> {
  const displacementMap: Record<string, { x: number; y: number }> = {};
  const currentPositions = new Map<string, { x: number; y: number; size: number }>();

  for (const n of nodes) {
    if (n.id === draggingId) {
      currentPositions.set(n.id, { x: draggingPos.x, y: draggingPos.y, size: n.size });
    } else {
      currentPositions.set(n.id, { x: n.x, y: n.y, size: n.size });
    }
  }

  const draggingNode = currentPositions.get(draggingId) || { x: draggingPos.x, y: draggingPos.y, size: 60 };

  // 多輪連鎖推擠 (Cascade Repulsion)
  for (let round = 0; round < 2; round++) {
    for (const [id, target] of currentPositions.entries()) {
      if (id === draggingId) continue;

      const dx = target.x - draggingPos.x;
      const dy = target.y - draggingPos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = (draggingNode.size + target.size) / 2 + safetyGap;

      if (dist < minDist) {
        const force = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        target.x = Math.round(target.x + nx * force);
        target.y = Math.round(target.y + ny * force);
        displacementMap[id] = { x: target.x, y: target.y };
      }
    }
  }

  return displacementMap;
}

/**
 * 計算已收錄藝人間的跨流派 AI 相似引力光束
 */
export function calculateGravityVectors(
  artists: ArtistEntry[],
  posMap: Map<string, NodePosition>,
  selectedArtistId: string | null
): GravityVector[] {
  const vectors: GravityVector[] = [];
  const processedPairs = new Set<string>();

  const nameToArtistMap = new Map<string, ArtistEntry>();
  for (const a of artists) {
    nameToArtistMap.set(a.name.toLowerCase().trim(), a);
    if (a.aliases) {
      for (const al of a.aliases) {
        nameToArtistMap.set(al.toLowerCase().trim(), a);
      }
    }
  }

  for (const source of artists) {
    if (!source.analysis?.similarArtists) continue;
    const sourcePos = posMap.get(source.id);
    if (!sourcePos) continue;

    for (const simName of source.analysis.similarArtists) {
      const cleanSim = simName.toLowerCase().trim();
      const target = nameToArtistMap.get(cleanSim);
      if (!target || target.id === source.id) continue;

      const targetPos = posMap.get(target.id);
      if (!targetPos) continue;

      const pairKey = [source.id, target.id].sort().join(':::');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const isFocused =
        selectedArtistId === source.id || selectedArtistId === target.id;

      vectors.push({
        id: pairKey,
        sourceId: source.id,
        targetId: target.id,
        sourcePos: { x: sourcePos.x, y: sourcePos.y },
        targetPos: { x: targetPos.x, y: targetPos.y },
        strength: 2,
        isFocused
      });
    }
  }

  return vectors;
}

/**
 * 針對選取藝人，生成「AI 推薦但尚未收錄」的幽靈探索節點
 */
export function calculateGhostDiscoveryNodes(
  selectedArtist: ArtistEntry | null,
  allArtists: ArtistEntry[],
  posMap: Map<string, NodePosition>
): GhostDiscoveryNode[] {
  if (!selectedArtist || !selectedArtist.analysis?.similarArtists) return [];
  const parentPos = posMap.get(selectedArtist.id);
  if (!parentPos) return [];

  const existingNames = new Set<string>();
  for (const a of allArtists) {
    existingNames.add(a.name.toLowerCase().trim());
    a.aliases?.forEach((al) => existingNames.add(al.toLowerCase().trim()));
  }

  const uncollected = selectedArtist.analysis.similarArtists.filter(
    (name) => !existingNames.has(name.toLowerCase().trim())
  );

  const ghosts: GhostDiscoveryNode[] = [];
  const orbitRadius = Math.max(90, parentPos.size / 2 + 50);

  uncollected.forEach((name, idx) => {
    const angle = ((idx * 360) / Math.max(1, uncollected.length)) * (Math.PI / 180);
    const x = Math.round(parentPos.x + Math.cos(angle) * orbitRadius);
    const y = Math.round(parentPos.y + Math.sin(angle) * orbitRadius);

    ghosts.push({
      name,
      parentArtistId: selectedArtist.id,
      parentArtistName: selectedArtist.name,
      x,
      y,
      size: 42
    });
  });

  return ghosts;
}
