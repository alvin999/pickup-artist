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
