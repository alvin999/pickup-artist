import { fetchArtistPortrait } from './artistImage';

/**
 * Apple Music Bridge
 * 提供搜尋連結轉換與剪貼簿 URL 提取
 */

export function buildAppleMusicSearchUrl(query: string): string {
  const clean = query.trim();
  if (!clean) return 'https://music.apple.com';
  return `https://music.apple.com/search?term=${encodeURIComponent(clean)}`;
}

export function extractFromAppleMusicUrl(rawInput: string): { isUrl: boolean; name?: string; cleanUrl?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { isUrl: false };
  }

  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes('music.apple.com')) {
      return { isUrl: false };
    }

    // 例如: https://music.apple.com/tw/artist/toe/123456
    // 或: https://music.apple.com/tw/album/the-book-about-my-idle-plot-on-a-vague-anxiety/123456
    const pathParts = url.pathname.split('/').filter(Boolean);
    // pathParts 例如 ['tw', 'artist', 'toe', '123456']
    if (pathParts.length >= 3) {
      const type = pathParts[1];
      const rawName = pathParts[2];
      const cleanName = decodeURIComponent(rawName).replace(/-/g, ' ');
      return {
        isUrl: true,
        name: cleanName,
        cleanUrl: trimmed
      };
    }

    return {
      isUrl: true,
      cleanUrl: trimmed
    };
  } catch {
    return { isUrl: false };
  }
}

export interface AppleMusicMetadata {
  coverImage?: string;
  albumTitle?: string;
  artistName?: string;
  releaseYear?: string;
  primaryGenre?: string;
  appleMusicUrl?: string;
}

/**
 * 方案 A：以「藝人肖像優先」為原則，自動獲取官方藝人照片；若查無藝人照則降級由 Apple Music / iTunes 取得高解析度代表專輯封面
 */
export async function fetchAppleMusicMetadata(query: string): Promise<AppleMusicMetadata | null> {
  const clean = query.trim();
  if (!clean) return null;

  // 1. 優先嘗試獲取藝人本人舞台/宣傳肖像 (Artist Photo First)
  let artistPortrait: string | null = null;
  try {
    artistPortrait = await fetchArtistPortrait(clean);
  } catch (err) {
    console.warn('[AppleMusic Bridge] 藝人肖像搜尋略過:', err);
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=album&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      if (artistPortrait) {
        return {
          coverImage: artistPortrait,
          artistName: clean
        };
      }
      return null;
    }

    const data = await res.json();
    if (data.resultCount > 0 && data.results[0]) {
      const item = data.results[0];
      const rawArtwork = (item.artworkUrl100 || item.artworkUrl60) as string | undefined;
      // 若查無藝人專屬照片，才使用專輯封面做為 fallback
      const albumCover = rawArtwork
        ? rawArtwork.replace(/\/\d+x\d+bb\./, '/800x800bb.')
        : undefined;

      return {
        coverImage: artistPortrait || albumCover,
        albumTitle: item.collectionName,
        artistName: item.artistName || clean,
        releaseYear: item.releaseDate ? item.releaseDate.substring(0, 4) : undefined,
        primaryGenre: item.primaryGenreName,
        appleMusicUrl: item.collectionViewUrl
      };
    } else if (artistPortrait) {
      return {
        coverImage: artistPortrait,
        artistName: clean
      };
    }
  } catch (err) {
    console.warn('[AppleMusic Bridge] 自動抓取中繼資料失敗，啟用 fallback:', err);
    if (artistPortrait) {
      return {
        coverImage: artistPortrait,
        artistName: clean
      };
    }
  }

  return null;
}

export interface ArtistCandidate {
  id: string;
  name: string;
  albumTitle?: string;
  primaryGenre?: string;
  releaseYear?: string;
  coverImage?: string;
  appleMusicUrl?: string;
}

/**
 * 搜尋多筆候選藝人 (以藝人 entity=musicArtist 為核心搜尋，並批次取得代表作品與封面)
 */
export async function searchAppleMusicCandidates(query: string): Promise<ArtistCandidate[]> {
  const clean = query.trim();
  if (!clean) return [];

  try {
    // 1. 優先以藝人主體檢索 (entity=musicArtist)
    const artistUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=musicArtist&limit=10`;
    const res = await fetch(artistUrl);
    if (!res.ok) return [];

    const data = await res.json();
    const rawArtists = (data.results || []).filter((r: any) => r.artistName);

    if (rawArtists.length > 0) {
      const qLower = clean.toLowerCase();
      // 精確排序：完全匹配 > 前綴匹配 > 其他
      const exact = rawArtists.filter((a: any) => a.artistName.toLowerCase() === qLower);
      const prefix = rawArtists.filter((a: any) => a.artistName.toLowerCase().startsWith(qLower) && !exact.includes(a));
      const partial = rawArtists.filter((a: any) => a.artistName.toLowerCase().includes(qLower) && !exact.includes(a) && !prefix.includes(a));
      const others = rawArtists.filter((a: any) => !exact.includes(a) && !prefix.includes(a) && !partial.includes(a));
      const sortedArtists = [...exact, ...prefix, ...partial, ...others].slice(0, 5);

      // 2. 批次查詢這些藝人的代表專輯與母帶封面
      const artistIds = sortedArtists.map((a: any) => a.artistId).filter(Boolean);
      const albumMap = new Map<number, { albumTitle?: string; coverImage?: string; releaseYear?: string; appleMusicUrl?: string }>();

      if (artistIds.length > 0) {
        try {
          const lookupUrl = `https://itunes.apple.com/lookup?id=${artistIds.join(',')}&entity=album&limit=1`;
          const lookupRes = await fetch(lookupUrl);
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            const collections = (lookupData.results || []).filter((r: any) => r.wrapperType === 'collection');
            for (const col of collections) {
              if (col.artistId && !albumMap.has(col.artistId)) {
                const rawArtwork = (col.artworkUrl100 || col.artworkUrl60) as string | undefined;
                albumMap.set(col.artistId, {
                  albumTitle: col.collectionName,
                  coverImage: rawArtwork ? rawArtwork.replace(/\/\d+x\d+bb\./, '/800x800bb.') : undefined,
                  releaseYear: col.releaseDate ? col.releaseDate.substring(0, 4) : undefined,
                  appleMusicUrl: col.collectionViewUrl
                });
              }
            }
          }
        } catch (e) {
          console.warn('[AppleMusic Bridge] 批次查詢代表專輯封面異常:', e);
        }
      }

      // 3. 對候選藝人進行藝人肖像優先補齊 (維基百科藝人照片優先於專輯封面)
      const resultsWithPortrait = await Promise.all(
        sortedArtists.map(async (a: any) => {
          const albumInfo = albumMap.get(a.artistId);
          let portrait: string | null = null;
          try {
            portrait = await fetchArtistPortrait(a.artistName);
          } catch {
            // fallback
          }

          return {
            id: String(a.artistId),
            name: a.artistName,
            albumTitle: albumInfo?.albumTitle,
            primaryGenre: a.primaryGenreName,
            releaseYear: albumInfo?.releaseYear,
            coverImage: portrait || albumInfo?.coverImage,
            appleMusicUrl: a.artistLinkUrl || albumInfo?.appleMusicUrl
          };
        })
      );

      return resultsWithPortrait;
    }

    // Fallback: 若 entity=musicArtist 無結果，才檢索 entity=album
    const albumFallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=album&limit=5`;
    const fbRes = await fetch(albumFallbackUrl);
    if (!fbRes.ok) return [];
    const fbData = await fbRes.json();
    return (fbData.results || []).map((item: any) => ({
      id: String(item.collectionId || Math.random()),
      name: item.artistName || clean,
      albumTitle: item.collectionName,
      primaryGenre: item.primaryGenreName,
      releaseYear: item.releaseDate ? item.releaseDate.substring(0, 4) : undefined,
      coverImage: item.artworkUrl100 ? item.artworkUrl100.replace(/\/\d+x\d+bb\./, '/800x800bb.') : undefined,
      appleMusicUrl: item.collectionViewUrl
    }));
  } catch (err) {
    console.warn('[AppleMusic Bridge] 藝人候選檢索失敗:', err);
    return [];
  }
}

