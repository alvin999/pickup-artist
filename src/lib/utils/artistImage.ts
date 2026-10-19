/**
 * 藝人專屬肖像/舞台照片擷取器 (Artist Visual Pipeline with Album Cross-Validation)
 * 設計原則：
 * 1. 優先原則：封面與主視覺預設優先採用 Apple Music 官方代表作母帶封面（最權威、不失真）。
 * 2. Wiki 配對原則：若使用 Wikipedia 檢索藝人，必須提供 Apple Music 查得之代表專輯 (knownAlbum) 進行交叉驗證。
 *    維基條目的標題或內文必須吻合該代表作（如 Underworld），杜絕將 Samuel Barber 等同名古典樂曲/作曲家誤認為金屬樂團。
 */

export async function fetchArtistPortrait(artistName: string, knownAlbum?: string): Promise<string | null> {
  const clean = artistName.trim();
  if (!clean) return null;

  const cleanAlbum = knownAlbum?.trim() || '';

  // 1. 產生搜尋候選詞：
  // 若有已知專輯，優先以 "藝人 + 專輯" 進行嚴密配對檢索；若無則搭配 "band" 或藝人名
  const queries: string[] = [];
  if (cleanAlbum) {
    queries.push(`${clean} ${cleanAlbum}`);
  }
  if (clean.length <= 5) {
    queries.push(`${clean} band`, `${clean} musician`, clean);
  } else {
    queries.push(`${clean} band`, clean);
  }

  // 嘗試多語系 Wikipedia API
  for (const q of queries) {
    // A. 英文維基百科
    try {
      const enUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q
      )}&gsrlimit=3&prop=pageimages|extracts&exintro&explaintext&exchars=300&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`;

      const res = await fetch(enUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          for (const key of Object.keys(pages)) {
            const page = pages[key];
            const titleLower = (page.title || '').toLowerCase();
            const extractLower = (page.extract || '').toLowerCase();

            // 專輯交叉配對：若指定了已知專輯，條目標題或摘要必須包含該專輯關鍵字
            if (cleanAlbum) {
              const albumLower = cleanAlbum.toLowerCase();
              const hasAlbumMatch = titleLower.includes(albumLower) || extractLower.includes(albumLower);
              if (!hasAlbumMatch) {
                continue; // 摘要完全未提及該代表作，判定非同一音樂主體（例如 Samuel Barber 不會提 Underworld）
              }
            }

            // 避免誤抓人體解剖（如 toes 腳趾）
            if (clean.toLowerCase() === 'toe' && !titleLower.includes('toe (band)') && !titleLower.includes('toe')) {
              continue;
            }

            const thumb = page?.thumbnail?.source;
            if (thumb && typeof thumb === 'string') {
              return thumb;
            }
          }
        }
      }
    } catch (err) {
      // 容錯靜默
    }

    // B. 中文維基百科
    try {
      const zhUrl = `https://zh.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q
      )}&gsrlimit=3&prop=pageimages|extracts&exintro&explaintext&exchars=300&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`;

      const res = await fetch(zhUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          for (const key of Object.keys(pages)) {
            const page = pages[key];
            const titleLower = (page.title || '').toLowerCase();
            const extractLower = (page.extract || '').toLowerCase();

            if (cleanAlbum) {
              const albumLower = cleanAlbum.toLowerCase();
              const hasAlbumMatch = titleLower.includes(albumLower) || extractLower.includes(albumLower);
              if (!hasAlbumMatch) {
                continue;
              }
            }

            const thumb = page?.thumbnail?.source;
            if (thumb && typeof thumb === 'string') {
              return thumb;
            }
          }
        }
      }
    } catch (err) {
      // 容錯靜默
    }
  }

  return null;
}
