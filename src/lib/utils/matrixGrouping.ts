import type { AcousticSector, ArtistEntry } from '$lib/types/artist';
import { ACOUSTIC_SECTORS, SECTOR_LIST } from '$lib/constants/sectors';

export interface MatrixSubGenreGroup {
  name: string;
  count: number;
  artists: ArtistEntry[];
}

export interface MatrixSectorGroup {
  id: AcousticSector | 'INBOX';
  name: string;
  nameTw: string;
  colorHex: string;
  description: string;
  count: number;
  subGenres: MatrixSubGenreGroup[];
}

export interface MatrixHierarchy {
  sectors: MatrixSectorGroup[];
  totalArtists: number;
  totalSubGenres: number;
}

export type MatrixSortMode = 'weight' | 'dr' | 'recent' | 'name';

/**
 * 依據藝人屬性進行階層式分組：
 * Level 1: 8 軸大扇區 (AcousticSector) + INBOX 收件匣
 * Level 2: AI 解剖子流派 (SubGenre)
 * Level 3: 藝人本體列表
 */
export function buildMatrixHierarchy(
  artists: ArtistEntry[],
  searchQuery: string = '',
  sortMode: MatrixSortMode = 'weight'
): MatrixHierarchy {
  const query = searchQuery.trim().toLowerCase();

  // 先過濾搜尋條件
  const filtered = artists.filter((artist) => {
    if (!query) return true;
    const nameMatch = artist.name.toLowerCase().includes(query);
    const aliasMatch = artist.aliases?.some((a) => a.toLowerCase().includes(query)) ?? false;
    const subGenreMatch = artist.analysis?.subGenre?.toLowerCase().includes(query) ?? false;
    const genreMatch = artist.analysis?.genres?.some((g) => g.toLowerCase().includes(query)) ?? false;
    const tagMatch = artist.analysis?.aestheticTags?.some((t) => t.toLowerCase().includes(query)) ?? false;
    const noteMatch = artist.analysis?.instrumentationNotes?.toLowerCase().includes(query) ?? false;
    return nameMatch || aliasMatch || subGenreMatch || genreMatch || tagMatch || noteMatch;
  });

  // 藝人排序函數
  const sortArtists = (list: ArtistEntry[]) => {
    return [...list].sort((a, b) => {
      switch (sortMode) {
        case 'weight': {
          const wA = a.weight ?? 20;
          const wB = b.weight ?? 20;
          if (wB !== wA) return wB - wA;
          return (b.addedAt || 0) - (a.addedAt || 0);
        }
        case 'dr': {
          const drA = a.dynamicRange ?? a.analysis?.notableAlbums?.[0]?.dynamicRangeScore ?? 0;
          const drB = b.dynamicRange ?? b.analysis?.notableAlbums?.[0]?.dynamicRangeScore ?? 0;
          if (drB !== drA) return drB - drA;
          return (b.addedAt || 0) - (a.addedAt || 0);
        }
        case 'recent': {
          return (b.addedAt || 0) - (a.addedAt || 0);
        }
        case 'name': {
          return a.name.localeCompare(b.name, 'zh-Hant');
        }
        default:
          return 0;
      }
    });
  };

  const sectors: MatrixSectorGroup[] = [];
  let totalSubGenres = 0;

  // 1. 走訪 8 軸既定扇區
  for (const def of SECTOR_LIST) {
    const sectorArtists = filtered.filter((artist) => {
      if (artist.status === 'inbox' && !artist.analysis?.sector) return false;
      const targetSector = artist.analysis?.sector || artist.clusterSector || artist.clusterCategory;
      return targetSector === def.id;
    });

    // 依 subGenre 分組
    const subGenreMap = new Map<string, ArtistEntry[]>();
    for (const artist of sectorArtists) {
      const rawSub = artist.analysis?.subGenre?.trim();
      const subName = rawSub && rawSub.length > 0 ? rawSub : '核心風格 // Core Style';
      if (!subGenreMap.has(subName)) {
        subGenreMap.set(subName, []);
      }
      subGenreMap.get(subName)!.push(artist);
    }

    const subGenres: MatrixSubGenreGroup[] = [];
    for (const [name, list] of subGenreMap.entries()) {
      subGenres.push({
        name,
        count: list.length,
        artists: sortArtists(list)
      });
    }

    // 依子流派所含藝人人數由多到少排序
    subGenres.sort((a, b) => b.count - a.count);
    totalSubGenres += subGenres.length;

    sectors.push({
      id: def.id,
      name: def.name,
      nameTw: def.nameTw,
      colorHex: def.colorHex,
      description: def.description,
      count: sectorArtists.length,
      subGenres
    });
  }

  // 2. 處理未剖析收件匣 (INBOX)
  const inboxArtists = filtered.filter((artist) => {
    return artist.status === 'inbox' || (!artist.analysis?.sector && !artist.clusterSector && !artist.clusterCategory);
  });

  if (inboxArtists.length > 0) {
    const inboxSubGenres: MatrixSubGenreGroup[] = [
      {
        name: '待 AI 深度解剖 // Pending Analysis',
        count: inboxArtists.length,
        artists: sortArtists(inboxArtists)
      }
    ];
    totalSubGenres += 1;

    sectors.push({
      id: 'INBOX',
      name: 'Inbox / Unanalyzed',
      nameTw: '待剖析收件匣',
      colorHex: '#94a3b8', // Slate / Neutral
      description: '尚未進行 AI 音樂學解剖之收件匣藝人，可點選快速解剖賦予扇區與子流派',
      count: inboxArtists.length,
      subGenres: inboxSubGenres
    });
  }

  return {
    sectors,
    totalArtists: filtered.length,
    totalSubGenres
  };
}
