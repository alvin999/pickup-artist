import type { AcousticSector } from '$lib/types/artist';
import { t, type TranslationKey } from '$lib/i18n';

export interface SectorDefinition {
  id: AcousticSector;
  name: string;
  nameKey: TranslationKey;
  readonly nameTw: string;
  angleDeg: number;       // 羅盤極座標角度 (0° ~ 315°)
  colorHex: string;       // 扇區主題色
  descKey: TranslationKey;
  readonly description: string;
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
    nameKey: 'sector_rock_name',
    get nameTw() { return t('sector_rock_name'); },
    angleDeg: 0,
    colorHex: '#f59e0b', // Amber
    descKey: 'sector_rock_desc',
    get description() { return t('sector_rock_desc'); },
    subGenreExamples: ['Math Rock', 'Post-Rock', 'Indie Rock', 'Shoegaze', 'Progressive Rock', 'Art Rock']
  },
  METAL: {
    id: 'METAL',
    name: 'Metal & Heavy',
    nameKey: 'sector_metal_name',
    get nameTw() { return t('sector_metal_name'); },
    angleDeg: 45,
    colorHex: '#ef4444', // Red
    descKey: 'sector_metal_desc',
    get description() { return t('sector_metal_desc'); },
    subGenreExamples: ['Prog Metal', 'Post-Metal', 'Metalcore', 'Sludge Metal', 'Doom Metal', 'Djent']
  },
  CLASSICAL: {
    id: 'CLASSICAL',
    name: 'Classical & Early',
    nameKey: 'sector_classical_name',
    get nameTw() { return t('sector_classical_name'); },
    angleDeg: 90,
    colorHex: '#eab308', // Gold
    descKey: 'sector_classical_desc',
    get description() { return t('sector_classical_desc'); },
    subGenreExamples: ['Baroque Keyboard', 'Romantic Piano', 'Classical Chamber', 'Chamber Cello', 'Modern Orchestral']
  },
  JAZZ: {
    id: 'JAZZ',
    name: 'Jazz & Fusion',
    nameKey: 'sector_jazz_name',
    get nameTw() { return t('sector_jazz_name'); },
    angleDeg: 135,
    colorHex: '#10b981', // Emerald
    descKey: 'sector_jazz_desc',
    get description() { return t('sector_jazz_desc'); },
    subGenreExamples: ['Modern Jazz', 'Jazz Fusion', 'Hard Bop', 'Cool Jazz', 'Modal Jazz', 'Contemporary Piano Trio']
  },
  AMBIENT: {
    id: 'AMBIENT',
    name: 'Ambient & Drone',
    nameKey: 'sector_ambient_name',
    get nameTw() { return t('sector_ambient_name'); },
    angleDeg: 180,
    colorHex: '#06b6d4', // Cyan
    descKey: 'sector_ambient_desc',
    get description() { return t('sector_ambient_desc'); },
    subGenreExamples: ['Dark Ambient', 'Drone', 'Modern Classical', 'Soundscape', 'Field Recording', 'Minimalism']
  },
  ELECTRONIC: {
    id: 'ELECTRONIC',
    name: 'Electronic & Avant',
    nameKey: 'sector_electronic_name',
    get nameTw() { return t('sector_electronic_name'); },
    angleDeg: 225,
    colorHex: '#6366f1', // Indigo
    descKey: 'sector_electronic_desc',
    get description() { return t('sector_electronic_desc'); },
    subGenreExamples: ['IDM', 'Glitch', 'Ambient Techno', 'Synthwave', 'Downtempo', 'Folktronica']
  },
  GROOVE: {
    id: 'GROOVE',
    name: 'Groove & Soul',
    nameKey: 'sector_groove_name',
    get nameTw() { return t('sector_groove_name'); },
    angleDeg: 270,
    colorHex: '#ec4899', // Pink / Rose
    descKey: 'sector_groove_desc',
    get description() { return t('sector_groove_desc'); },
    subGenreExamples: ['Funk', 'Soul', 'Neo-Soul', 'Contemporary R&B', 'Boom Bap Hip-Hop', 'Jazz Rap', 'Lo-Fi Hip-Hop']
  },
  WORLD: {
    id: 'WORLD',
    name: 'World & Roots',
    nameKey: 'sector_world_name',
    get nameTw() { return t('sector_world_name'); },
    angleDeg: 315,
    colorHex: '#8b5cf6', // Violet
    descKey: 'sector_world_desc',
    get description() { return t('sector_world_desc'); },
    subGenreExamples: ['World Fusion', 'Afrobeat', 'Traditional Folk', 'Ethno-Ambient', 'Flamenco', 'Latin Roots']
  }
};

export const SECTOR_LIST = Object.values(ACOUSTIC_SECTORS);
