/**
 * 藝人專屬肖像/舞台照片擷取器 (Artist-First Visual Pipeline)
 * 優先序：
 * 1. Wikipedia / Wikimedia 官方頁面高解析主照 (Stage / Promo / Portrait, 最高 1000px)
 * 2. 中文 Wikipedia (繁中條目主照)
 * 3. 備援：由呼叫方降級至 Apple Music / iTunes 代表作封面
 */

export async function fetchArtistPortrait(artistName: string): Promise<string | null> {
  const clean = artistName.trim();
  if (!clean) return null;

  // 1. 產生搜尋候選詞：若名稱較短（如 toe, can, mono），優先補充 "band" 或 "musician" 避免誤中日常辭典單字
  const queries: string[] = [];
  if (clean.length <= 5) {
    queries.push(`${clean} band`, `${clean} musician`, clean);
  } else {
    queries.push(clean, `${clean} band`);
  }

  // 嘗試多語系 Wikipedia API
  for (const q of queries) {
    // A. 英文維基百科
    try {
      const enUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q
      )}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`;

      const res = await fetch(enUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          for (const key of Object.keys(pages)) {
            const page = pages[key];
            const titleLower = (page.title || '').toLowerCase();
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
      )}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json&origin=*`;

      const res = await fetch(zhUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          for (const key of Object.keys(pages)) {
            const thumb = pages[key]?.thumbnail?.source;
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
