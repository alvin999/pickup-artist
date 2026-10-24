import type { AcousticSector, ArtistEntry } from '$lib/types/artist';
import { ACOUSTIC_SECTORS } from '$lib/constants/sectors';
import { fetchMoreSimilarArtists } from '$lib/ai/client';

export type LuckySectorOption = AcousticSector | 'ALL';

export interface LuckyCandidateResult {
  name: string;
  sourceType: 'local-ghost' | 'ai-seed' | 'curated-seed';
  sourceArtists: string[]; // 推薦溯源名單 (Lineage)
  sector?: AcousticSector;
  subGenre?: string;
}

/**
 * 8 大聲學板塊精選種子庫（發燒友基石與冷門珍寶）
 * 作用：當本地 AI 相似庫見底且未配置 AI 金鑰時，提供零延遲、零 Token 的高品質後備保底
 */
const CURATED_SEEDS: Record<AcousticSector, string[]> = {
  ROCK: [
    'toe', 'Elephant Gym', 'LITE', 'Tortoise', 'Mono', 
    'American Football', 'Don Caballero', 'Chon', 'Enemies', 'mouse on the keys'
  ],
  METAL: [
    'Animals as Leaders', 'Gojira', 'Deafheaven', 'Between the Buried and Me', 
    'Meshuggah', 'Cult of Luna', 'Ne Obliviscaris', 'Leprous', 'The Ocean', 'Boris'
  ],
  CLASSICAL: [
    'Glenn Gould', 'Hilary Hahn', 'Víkingur Ólafsson', 'Hélène Grimaud', 
    'Max Richter', 'Jordi Savall', 'Krystian Zimerman', 'Patricia Kopatchinskaja', 'Teodor Currentzis', 'Janine Jansen'
  ],
  JAZZ: [
    'Bill Evans', 'Miles Davis', 'Hiromi Uehara', 'Tigran Hamasyan', 
    'Brad Mehldau', 'Snarky Puppy', 'Avishai Cohen', 'GoGo Penguin', 'Kamasi Washington', 'Christian McBride'
  ],
  AMBIENT: [
    'Brian Eno', 'Stars of the Lid', 'Tim Hecker', 'Celer', 
    'William Basinski', 'Harold Budd', 'Fennesz', 'Alva Noto', 'Gas', 'Chihei Hatakeyama'
  ],
  ELECTRONIC: [
    'Aphex Twin', 'Boards of Canada', 'Autechre', 'Jon Hopkins', 
    'Tycho', 'Four Tet', 'Floating Points', 'Moderat', 'Clark', 'Rival Consoles'
  ],
  GROOVE: [
    'D’Angelo', 'Erykah Badu', 'Vulfpeck', 'Hiatus Kaiyote', 
    'Tom Misch', 'FKJ', 'Masego', 'Moonchild', 'Thundercat', 'Khruangbin'
  ],
  WORLD: [
    'Tinariwen', 'Ali Farka Touré', 'Anoushka Shankar', 'Toumani Diabaté', 
    'Buena Vista Social Club', 'Mulatu Astatke', 'Songhoy Blues', 'Rokia Traoré', 'Astor Piazzolla', 'Ballaké Sissoko'
  ]
};

/**
 * 取得在庫所有藝人名稱與別名的標準化集合
 */
export function getExistingNamesSet(allArtists: ArtistEntry[]): Set<string> {
  const set = new Set<string>();
  for (const a of allArtists) {
    if (a.name) set.add(a.name.toLowerCase().trim());
    if (a.aliases && Array.isArray(a.aliases)) {
      for (const al of a.aliases) {
        if (al) set.add(al.toLowerCase().trim());
      }
    }
  }
  return set;
}

interface GhostCandidate {
  name: string;
  sourceArtists: string[];
  sector?: AcousticSector;
  score: number;
}

/**
 * 從本地已分析藝人的 AI 相似推薦名單（similarArtists）中進行加權隨機採樣
 * 
 * 核心演算法：
 * 1. 提取符合指定 Sector 的未收錄藝人。
 * 2. 統計頻率（共振度）與母體藝人的引力權重（weight）。
 * 3. 採用 Efraimidis-Spirakis 加權隨機輪盤搭配隨機抖動（Jitter）：
 *    Score_i = (Weight_seed * 0.5) + (Freq * 20)
 *    Key_i = R^(1 / Score_i^alpha)，其中 R ~ Uniform(0, 1), alpha = 0.5
 *    能有效防止單一高 weight 藝人霸佔抽取結果，同時保有高共振藝人的吸引力。
 */
export function pickLuckyFromLocal(
  sector: LuckySectorOption,
  allArtists: ArtistEntry[],
  recentRolls: string[] = []
): LuckyCandidateResult | null {
  const existingSet = getExistingNamesSet(allArtists);
  const recentSet = new Set(recentRolls.map((r) => r.toLowerCase().trim()));

  // 1. 篩選符合扇區且具有 AI 分析結果的藝人
  const analyzedArtists = allArtists.filter((a) => {
    if (a.status !== 'analyzed' || !a.analysis?.similarArtists) return false;
    if (sector === 'ALL') return true;
    const aSector = a.analysis?.sector || a.clusterSector;
    return aSector === sector;
  });

  if (analyzedArtists.length === 0) return null;

  // 2. 建立候選池
  const candidateMap = new Map<string, GhostCandidate>();

  for (const source of analyzedArtists) {
    const motherWeight = source.weight || 20;
    const sourceSector = source.analysis?.sector || source.clusterSector;
    const sims = source.analysis?.similarArtists || [];

    for (const sim of sims) {
      const trimmed = sim.trim();
      const lower = trimmed.toLowerCase();

      // 排除已入庫或近期剛抽中過的藝人
      if (!trimmed || existingSet.has(lower) || recentSet.has(lower)) {
        continue;
      }

      const existing = candidateMap.get(lower);
      if (existing) {
        if (!existing.sourceArtists.includes(source.name)) {
          existing.sourceArtists.push(source.name);
        }
        // 頻率共振加權
        existing.score += motherWeight * 0.4 + 25;
      } else {
        candidateMap.set(lower, {
          name: trimmed,
          sourceArtists: [source.name],
          sector: sourceSector,
          score: motherWeight * 0.5 + 20
        });
      }
    }
  }

  const pool = Array.from(candidateMap.values());
  if (pool.length === 0) return null;

  // 3. 混合加權隨機挑選 (Weighted Reservoir Sampling with Jitter)
  let bestCandidate: GhostCandidate | null = null;
  let highestKey = -Infinity;

  for (const item of pool) {
    // 平滑溫度抑制極端分數
    const smoothedWeight = Math.pow(Math.max(1, item.score), 0.55);
    const r = Math.max(0.0001, Math.random());
    const key = Math.pow(r, 1 / smoothedWeight);

    if (key > highestKey) {
      highestKey = key;
      bestCandidate = item;
    }
  }

  if (!bestCandidate) return null;

  return {
    name: bestCandidate.name,
    sourceType: 'local-ghost',
    sourceArtists: bestCandidate.sourceArtists,
    sector: bestCandidate.sector
  };
}

/**
 * 當本地未收錄池用罄時，動態從該扇區挑選微種子，向 AI 發起低 Token 探勘 (~100 tokens)
 */
export async function pickLuckyFromAI(
  sector: LuckySectorOption,
  allArtists: ArtistEntry[],
  recentRolls: string[] = []
): Promise<LuckyCandidateResult | null> {
  const existingSet = getExistingNamesSet(allArtists);
  const recentSet = new Set(recentRolls.map((r) => r.toLowerCase().trim()));

  // 篩選該扇區可用藝人當作靈感種子
  const targetSector: AcousticSector =
    sector === 'ALL'
      ? (['ROCK', 'JAZZ', 'CLASSICAL', 'ELECTRONIC', 'AMBIENT', 'GROOVE', 'METAL', 'WORLD'][
          Math.floor(Math.random() * 8)
        ] as AcousticSector)
      : sector;

  const sectorArtists = allArtists.filter((a) => {
    const aSector = a.analysis?.sector || a.clusterSector;
    return aSector === targetSector;
  });

  // 挑選 1~2 位種子藝人（加權隨機）
  let seedArtistName = '';
  let subGenre = '';
  if (sectorArtists.length > 0) {
    const pickedSeed = sectorArtists[Math.floor(Math.random() * sectorArtists.length)];
    seedArtistName = pickedSeed.name;
    subGenre = pickedSeed.analysis?.subGenre || '';
  } else {
    // 若庫中該扇區完全無藝人，取用該扇區預置的代表流派作為抽象種子
    const def = ACOUSTIC_SECTORS[targetSector];
    seedArtistName = def.subGenreExamples[Math.floor(Math.random() * def.subGenreExamples.length)];
  }

  // 傳入最近 20 個名字作為排除，控制 Token 消耗
  const excludeList = Array.from(existingSet).slice(0, 25);

  try {
    const aiResults = await fetchMoreSimilarArtists(
      seedArtistName,
      targetSector,
      subGenre,
      excludeList
    );

    // 在本地排除在庫藝人與近期抽取
    const filtered = aiResults.filter(
      (name) => !existingSet.has(name.toLowerCase().trim()) && !recentSet.has(name.toLowerCase().trim())
    );

    if (filtered.length > 0) {
      const winner = filtered[Math.floor(Math.random() * filtered.length)];
      return {
        name: winner,
        sourceType: 'ai-seed',
        sourceArtists: seedArtistName ? [seedArtistName] : [],
        sector: targetSector,
        subGenre
      };
    }
  } catch (err) {
    console.warn('[pickLuckyFromAI] AI 探勘連線異常，轉入保底種子庫:', err);
  }

  // 4. 若 AI 連線失敗或未回傳，退回保底種子庫
  return pickLuckyFromCurated(targetSector, allArtists, recentRolls);
}

/**
 * 保底種子庫隨機抽取（零網路、零 Token）
 */
export function pickLuckyFromCurated(
  sector: LuckySectorOption,
  allArtists: ArtistEntry[],
  recentRolls: string[] = []
): LuckyCandidateResult | null {
  const existingSet = getExistingNamesSet(allArtists);
  const recentSet = new Set(recentRolls.map((r) => r.toLowerCase().trim()));

  const targetSector: AcousticSector =
    sector === 'ALL'
      ? (['ROCK', 'JAZZ', 'CLASSICAL', 'ELECTRONIC', 'AMBIENT', 'GROOVE', 'METAL', 'WORLD'][
          Math.floor(Math.random() * 8)
        ] as AcousticSector)
      : sector;

  const seeds = CURATED_SEEDS[targetSector] || [];
  const available = seeds.filter(
    (name) => !existingSet.has(name.toLowerCase().trim()) && !recentSet.has(name.toLowerCase().trim())
  );

  if (available.length === 0) return null;

  const winner = available[Math.floor(Math.random() * available.length)];
  return {
    name: winner,
    sourceType: 'curated-seed',
    sourceArtists: [],
    sector: targetSector
  };
}
