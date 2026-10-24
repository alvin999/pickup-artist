/**
 * 串流服務跳轉與中繼資料出口 (Streaming Platform Bridge)
 *
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 職責分離（Decoupled Pipeline）：
 *    維持 Apple Music / iTunes 作為核心中繼資料與 800x800 封面來源（因其為唯一免 API 金鑰、免登入的前端公開資料來源），
 *    將「音訊播放與外部聆賞出口」解耦為支援多串流平台的 Universal Target 架構。
 * 2. 零憑證外連（Zero-Credential Outbound）：
 *    不依賴 Spotify / Tidal 繁複且需 Secret / OAuth 的官方 API，一律採用官方標準 Web Universal URL 
 *    或 Deep Link 進行無痛直跳，徹底維持純前端 Local-First 與零伺服器安全原則。
 * 3. 使用者偏好持久化：
 *    透過 localStorage 儲存預設串流平台偏好，預設為 Apple Music，隨選隨時切換。
 */

export type StreamingPlatform =
  | 'apple_music'
  | 'spotify'
  | 'youtube_music'
  | 'tidal'
  | 'bandcamp';

export interface StreamingPlatformInfo {
  id: StreamingPlatform;
  label: string;
  shortLabel: string;
  brandColor: string;
  textColor: string;
  description: string;
}

export const STREAMING_PLATFORMS: Record<StreamingPlatform, StreamingPlatformInfo> = {
  apple_music: {
    id: 'apple_music',
    label: 'Apple Music',
    shortLabel: 'Apple',
    brandColor: '#FA383E',
    textColor: '#FFFFFF',
    description: 'Lossless / Hi-Res 無損音質串流'
  },
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    shortLabel: 'Spotify',
    brandColor: '#1DB954',
    textColor: '#000000',
    description: '全球熱門音樂串流與動態探索'
  },
  youtube_music: {
    id: 'youtube_music',
    label: 'YouTube Music',
    shortLabel: 'YT Music',
    brandColor: '#FF0000',
    textColor: '#FFFFFF',
    description: 'Live 現場錄音、罕見版本與影音'
  },
  tidal: {
    id: 'tidal',
    label: 'Tidal',
    shortLabel: 'Tidal',
    brandColor: '#000000',
    textColor: '#FFFFFF',
    description: 'Hi-Fi 錄音室級高音質串流'
  },
  bandcamp: {
    id: 'bandcamp',
    label: 'Bandcamp',
    shortLabel: 'Bandcamp',
    brandColor: '#1DA0C3',
    textColor: '#FFFFFF',
    description: '獨立廠牌、地下樂團與實體黑膠'
  }
};

const STREAMING_STORAGE_KEY = 'pua_preferred_streaming';

/**
 * 取得目前設定的預設串流服務（預設為 apple_music）
 */
export function getPreferredStreamingPlatform(): StreamingPlatform {
  if (typeof window === 'undefined') return 'apple_music';
  const stored = localStorage.getItem(STREAMING_STORAGE_KEY) as StreamingPlatform | null;
  if (stored && stored in STREAMING_PLATFORMS) {
    return stored;
  }
  return 'apple_music';
}

/**
 * 儲存預設串流服務偏好
 */
export function setPreferredStreamingPlatform(platform: StreamingPlatform): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STREAMING_STORAGE_KEY, platform);
  // 發送自定義事件通知各視圖同步更新
  window.dispatchEvent(new CustomEvent('pua:streaming-platform-changed', { detail: platform }));
}

/**
 * 依據目標平台生成播放/搜尋跳轉 URL
 */
export function getStreamingSearchUrl(
  platform: StreamingPlatform,
  target: {
    artistName: string;
    albumTitle?: string;
    appleMusicUrl?: string;
  }
): string {
  const artist = target.artistName?.trim() || '';
  const album = target.albumTitle?.trim() || '';
  const query = [artist, album].filter(Boolean).join(' ');

  switch (platform) {
    case 'apple_music':
      if (target.appleMusicUrl && target.appleMusicUrl.trim()) {
        return target.appleMusicUrl;
      }
      return query
        ? `https://music.apple.com/search?term=${encodeURIComponent(query)}`
        : 'https://music.apple.com';

    case 'spotify':
      return query
        ? `https://open.spotify.com/search/${encodeURIComponent(query)}`
        : 'https://open.spotify.com';

    case 'youtube_music':
      return query
        ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
        : 'https://music.youtube.com';

    case 'tidal':
      return query
        ? `https://listen.tidal.com/search?q=${encodeURIComponent(query)}`
        : 'https://listen.tidal.com';

    case 'bandcamp':
      return query
        ? `https://bandcamp.com/search?q=${encodeURIComponent(query)}`
        : 'https://bandcamp.com';

    default:
      return target.appleMusicUrl || 'https://music.apple.com';
  }
}
