import type { AcousticSector } from '$lib/types/artist';

export interface SectorDefinition {
  id: AcousticSector;
  name: string;
  nameTw: string;
  angleDeg: number;       // 羅盤極座標角度 (0° ~ 315°)
  colorHex: string;       // 扇區主題色
  description: string;
  subGenreExamples: string[];
}

/**
 * 聲學蜂巢 8 軸全景星系羅盤 (Acoustic 8-Axis Compass)
 * 解決音樂分類難題：
 * 1. 幾何鎖死 8 方位（零飄移）
 * 2. GROOVE 收納 Funk / Soul / Neo-Soul / R&B / Hip-Hop
 * 3. CLASSICAL 採「樂派 ✕ 樂器」二維結構
 * 4. Indie 作為 Level 3 美學標籤跨領域流動
 */
export const ACOUSTIC_SECTORS: Record<AcousticSector, SectorDefinition> = {
  ROCK: {
    id: 'ROCK',
    name: 'Rock & Post-Rock',
    nameTw: '搖滾與後搖',
    angleDeg: 0,
    colorHex: '#f59e0b', // Amber
    description: '器樂搖滾、數學搖滾、前衛搖滾、獨立搖滾與瞪鞋派系',
    subGenreExamples: ['Math Rock', 'Post-Rock', 'Indie Rock', 'Shoegaze', 'Progressive Rock', 'Art Rock']
  },
  METAL: {
    id: 'METAL',
    name: 'Metal & Heavy',
    nameTw: '重型與極限金屬',
    angleDeg: 45,
    colorHex: '#ef4444', // Red
    description: '重金屬、前衛金屬、金屬核、淤泥與末日金屬等極限重型流派',
    subGenreExamples: ['Prog Metal', 'Post-Metal', 'Metalcore', 'Sludge Metal', 'Doom Metal', 'Djent']
  },
  CLASSICAL: {
    id: 'CLASSICAL',
    name: 'Classical & Early',
    nameTw: '古典與早期音樂',
    angleDeg: 90,
    colorHex: '#eab308', // Gold
    description: '以演奏家/指揮為核心，按「時代樂派 ✕ 編制樂器」雙軸展開',
    subGenreExamples: ['Baroque Keyboard', 'Romantic Piano', 'Classical Chamber', 'Chamber Cello', 'Modern Orchestral']
  },
  JAZZ: {
    id: 'JAZZ',
    name: 'Jazz & Fusion',
    nameTw: '爵士與融合樂',
    angleDeg: 135,
    colorHex: '#10b981', // Emerald
    description: '現代爵士、融合爵士、硬咆哮、酷派與當代即興器樂',
    subGenreExamples: ['Modern Jazz', 'Jazz Fusion', 'Hard Bop', 'Cool Jazz', 'Modal Jazz', 'Contemporary Piano Trio']
  },
  AMBIENT: {
    id: 'AMBIENT',
    name: 'Ambient & Drone',
    nameTw: '氛圍音景與實驗',
    angleDeg: 180,
    colorHex: '#06b6d4', // Cyan
    description: '氛圍音樂、新古典環境音景、無人聲器樂共振與實驗噪音',
    subGenreExamples: ['Dark Ambient', 'Drone', 'Modern Classical', 'Soundscape', 'Field Recording', 'Minimalism']
  },
  ELECTRONIC: {
    id: 'ELECTRONIC',
    name: 'Electronic & Avant',
    nameTw: '前衛電子與合成',
    angleDeg: 225,
    colorHex: '#6366f1', // Indigo
    description: '智能舞曲 (IDM)、微聲音樂 (Glitch)、合成器氛圍波與電氣前衛',
    subGenreExamples: ['IDM', 'Glitch', 'Ambient Techno', 'Synthwave', 'Downtempo', 'Folktronica']
  },
  GROOVE: {
    id: 'GROOVE',
    name: 'Groove & Soul',
    nameTw: '律動與靈魂樂',
    angleDeg: 270,
    colorHex: '#ec4899', // Pink / Rose
    description: '根源律動：放克、靈魂樂、新靈魂、當代節奏藍調與意識嘻哈',
    subGenreExamples: ['Funk', 'Soul', 'Neo-Soul', 'Contemporary R&B', 'Boom Bap Hip-Hop', 'Jazz Rap', 'Lo-Fi Hip-Hop']
  },
  WORLD: {
    id: 'WORLD',
    name: 'World & Roots',
    nameTw: '世界音樂與民族根源',
    angleDeg: 315,
    colorHex: '#8b5cf6', // Violet
    description: '跨文化世界音樂、民族傳統器樂、非洲律動、南美探戈與跨界根源聲響',
    subGenreExamples: ['World Fusion', 'Afrobeat', 'Traditional Folk', 'Ethno-Ambient', 'Flamenco', 'Latin Roots']
  }
};

export const SECTOR_LIST = Object.values(ACOUSTIC_SECTORS);
