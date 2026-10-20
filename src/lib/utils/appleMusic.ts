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
 * Apple Music 官方專輯封面優先原則：
 * 優先獲取 Apple Music / iTunes 高解析度（800x800）代表作品母帶封面，確保視覺 100% 精確且官方授權；
 * 透過藝人主體檢索 (entity=musicArtist) 鎖定正確藝人，避免同名專輯撞名 (例如樂團 Battles 誤抓 In Flames 的專輯《Battles》)；
 * 僅在 Apple Music 官方查無封面時，才啟用具備專輯交叉配對 (Album Cross-validation) 的 Wiki 肖像作為備援。
 */
export async function fetchAppleMusicMetadata(query: string): Promise<AppleMusicMetadata | null> {
  const clean = query.trim();
  if (!clean) return null;

  try {
    const candidates = await searchAppleMusicCandidates(clean);
    if (candidates.length > 0) {
      const lowerClean = clean.toLowerCase();
      // 優先挑選藝人名稱完全相符者，若無則依排序權重取第一筆
      const best = candidates.find((c) => c.name.trim().toLowerCase() === lowerClean) || candidates[0];
      return {
        coverImage: best.coverImage,
        albumTitle: best.albumTitle,
        artistName: best.name,
        releaseYear: best.releaseYear,
        primaryGenre: best.primaryGenre,
        appleMusicUrl: best.appleMusicUrl
      };
    }
  } catch (err) {
    console.warn('[AppleMusic Bridge] 自動抓取中繼資料失敗:', err);
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
 * 優化：
 * 1. 檢索上限由 10 筆大幅提升至 50 筆，避免同名藝人（如 Adagio）之金屬/搖滾樂團被流行/古典結果淹沒截斷。
 * 2. 候選池由 5 筆擴增至 20 筆，提供更完整的排歧視野。
 * 3. lookup 專輯時移除 limit=1 全局限制，確保每個藝人都能取得各自的代表作與封面。
 * 4. 支援關鍵字曲風/風格語意權重排序。
 */
export async function searchAppleMusicCandidates(query: string): Promise<ArtistCandidate[]> {
  const clean = query.trim();
  if (!clean) return [];

  try {
    // 1. 優先以藝人主體檢索 (entity=musicArtist)，上限擴增至 50 筆
    const artistUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=musicArtist&limit=50`;
    const res = await fetch(artistUrl);
    if (!res.ok) return [];

    const data = await res.json();
    let rawArtists: any[] = (data.results || []).filter((r: any) => r.artistName);

    // 若搜尋詞包含風格關鍵字（例如 Adagio metal），或主體搜尋筆數偏少，加測專輯檢索以補足關聯藝人
    const lowerQuery = clean.toLowerCase();
    const styleKeywords = ['metal', 'rock', 'pop', 'jazz', 'classical', 'hip hop', 'rap', 'indie', 'punk', 'folk', '金屬', '前衛', '搖滾'];
    const matchedStyle = styleKeywords.find((kw) => lowerQuery.includes(kw));

    if (matchedStyle || rawArtists.length < 5) {
      try {
        const albumSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=album&limit=25`;
        const albumRes = await fetch(albumSearchUrl);
        if (albumRes.ok) {
          const albumData = await albumRes.json();
          const existingIds = new Set(rawArtists.map((a) => a.artistId));
          for (const alb of albumData.results || []) {
            if (alb.artistId && !existingIds.has(alb.artistId) && alb.artistName) {
              existingIds.add(alb.artistId);
              rawArtists.push({
                artistId: alb.artistId,
                artistName: alb.artistName,
                primaryGenreName: alb.primaryGenreName,
                artistLinkUrl: alb.artistViewUrl
              });
            }
          }
        }
      } catch (err) {
        console.warn('[AppleMusic Bridge] 補充專輯關聯藝人搜尋略過:', err);
      }
    }

    if (rawArtists.length > 0) {
      // 去重保證相同 artistId 唯一
      const uniqueArtistsMap = new Map<number, any>();
      for (const a of rawArtists) {
        if (a.artistId && !uniqueArtistsMap.has(a.artistId)) {
          uniqueArtistsMap.set(a.artistId, a);
        }
      }
      const deduplicated = Array.from(uniqueArtistsMap.values());

      // 智慧多層排序：
      // - 完全匹配藝人名 (如 "adagio" === "adagio")
      // - 若有指定風格關鍵字，符合該風格者優先
      // - 前綴匹配
      // - 包含匹配
      // - 提升候選池容量至最多 20 筆
      const sortedArtists = deduplicated.sort((a: any, b: any) => {
        const aName = (a.artistName || '').toLowerCase();
        const bName = (b.artistName || '').toLowerCase();
        const aGenre = (a.primaryGenreName || '').toLowerCase();
        const bGenre = (b.primaryGenreName || '').toLowerCase();

        const aExact = aName === lowerQuery;
        const bExact = bName === lowerQuery;

        // 若搜尋詞包含風格，符合風格者權重提升
        if (matchedStyle) {
          const aStyleMatch = aGenre.includes(matchedStyle);
          const bStyleMatch = bGenre.includes(matchedStyle);
          if (aStyleMatch && !bStyleMatch) return -1;
          if (!aStyleMatch && bStyleMatch) return 1;
        }

        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aPrefix = aName.startsWith(lowerQuery);
        const bPrefix = bName.startsWith(lowerQuery);
        if (aPrefix && !bPrefix) return -1;
        if (!aPrefix && bPrefix) return 1;

        const aIncludes = aName.includes(lowerQuery);
        const bIncludes = bName.includes(lowerQuery);
        if (aIncludes && !bIncludes) return -1;
        if (!aIncludes && bIncludes) return 1;

        return 0;
      }).slice(0, 20);

      // 2. 批次查詢這些藝人的代表專輯與母帶封面（移除全局 limit=1 限制，確保多 ID 時每位藝人皆能取得專輯）
      const artistIds = sortedArtists.map((a: any) => a.artistId).filter(Boolean);
      const albumMap = new Map<number, { albumTitle?: string; coverImage?: string; releaseYear?: string; appleMusicUrl?: string }>();

      if (artistIds.length > 0) {
        try {
          const lookupUrl = `https://itunes.apple.com/lookup?id=${artistIds.join(',')}&entity=album`;
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

      // 3. 候選藝人視覺配置：優先採用 Apple Music 官方代表作封面 (800x800)
      // 若 Apple Music 無代表專輯封面，才以「藝人名 + 代表作」交叉驗證 Wiki 肖像做為備援
      const resultsWithPortrait = await Promise.all(
        sortedArtists.map(async (a: any) => {
          const albumInfo = albumMap.get(a.artistId);
          let cover = albumInfo?.coverImage;

          // 若 Apple Music 查無封面，且具有代表作品，以代表作名稱交叉配對 Wiki 條目
          if (!cover && albumInfo?.albumTitle) {
            try {
              const wikiCover = await Promise.race([
                fetchArtistPortrait(a.artistName, albumInfo.albumTitle),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))
              ]);
              if (wikiCover) cover = wikiCover;
            } catch {
              // fallback
            }
          }

          return {
            id: String(a.artistId),
            name: a.artistName,
            albumTitle: albumInfo?.albumTitle,
            primaryGenre: a.primaryGenreName,
            releaseYear: albumInfo?.releaseYear,
            coverImage: cover,
            appleMusicUrl: a.artistLinkUrl || albumInfo?.appleMusicUrl
          };
        })
      );

      return resultsWithPortrait;
    }

    // Fallback: 若 entity=musicArtist 無結果，才檢索 entity=album
    const albumFallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=album&limit=15`;
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

