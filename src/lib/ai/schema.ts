import { z } from 'zod';

export const NotableAlbumSchema = z.object({
  title: z.string().nullish().transform((v) => v || '代表作品'),
  year: z.string().nullish().transform((v) => v || ''),
  tier: z.enum(['milestone', 'hidden-treasure']).nullish().transform((v) => v || 'milestone'),
  description: z.string().nullish().transform((v) => v || ''),
  appleMusicSearchUrl: z.string().nullish().transform((v) => v || ''),
  rarityReason: z.string().nullish().transform((v) => v || undefined),
  audiophileHighlight: z.string().nullish().transform((v) => v || undefined),
  dynamicRangeScore: z.union([z.number(), z.string()]).nullish().transform((v) => {
    if (!v) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  })
});

export type ValidatedNotableAlbum = z.infer<typeof NotableAlbumSchema>;

export const ClassicalMetadataSchema = z.object({
  composer: z.string().nullish().transform((v) => v || undefined),
  workTitle: z.string().nullish().transform((v) => v || undefined),
  instrumentOrRole: z.string().nullish().transform((v) => v || undefined),
  orchestra: z.string().nullish().transform((v) => v || undefined),
  recordingYear: z.string().nullish().transform((v) => v || undefined)
});

export const ArtistAnalysisResponseSchema = z.object({
  name: z.string().nullish().transform((v) => v || '未知藝人'),
  aliases: z.array(z.string()).nullish().transform((v) => v || []),
  
  // 8 軸三層分類體系
  sector: z.enum([
    'ROCK',
    'METAL',
    'CLASSICAL',
    'JAZZ',
    'AMBIENT',
    'ELECTRONIC',
    'GROOVE',
    'WORLD'
  ]).nullish().transform((v) => v || 'ROCK'),
  subGenre: z.string().nullish().transform((v) => v || 'General'),
  artistRole: z.string().nullish().transform((v) => v || undefined),
  aestheticTags: z.array(z.string()).nullish().transform((v) => v || []),
  genres: z.array(z.string()).nullish().transform((v) => v || []),
  
  // 藝人與身分型態
  entityType: z.enum(['solo', 'band', 'side-project', 'supergroup']).nullish().transform((v) => v || 'band'),
  lineage: z.object({
    primaryArtistId: z.string().nullish().transform((v) => v || undefined),
    primaryArtistName: z.string().nullish().transform((v) => v || undefined),
    memberRoster: z.array(z.string()).nullish().transform((v) => v || [])
  }).nullish().transform((v) => v || undefined),
  
  // 古典樂二維指標
  classicalRole: z.enum(['performer', 'conductor', 'composer', 'orchestra']).nullish().transform((v) => v || undefined),
  classicalMetadata: ClassicalMetadataSchema.nullish().transform((v) => v || undefined),
  
  // 發燒友分析與聲響簽名
  summary: z.string().nullish().transform((v) => v || '該藝人之音樂風格與深度聲學評述。'),
  instrumentationNotes: z.string().nullish().transform((v) => v || undefined),
  similarArtists: z.array(z.string()).nullish().transform((v) => v || []),
  
  // 雙軌專輯挖掘（Milestone ✕ Hidden Treasure）
  notableAlbums: z.array(NotableAlbumSchema).nullish().transform((v): ValidatedNotableAlbum[] => {
    if (!v || v.length === 0) {
      return [{
        title: '代表作精選',
        year: '',
        tier: 'milestone',
        description: '經典代表作品錄音',
        appleMusicSearchUrl: '',
        rarityReason: undefined,
        audiophileHighlight: undefined,
        dynamicRangeScore: undefined
      }];
    }
    return v;
  }),
  
  // 發燒友指標建議
  suggestedDynamicRange: z.union([z.number(), z.string()]).nullish().transform((v) => {
    if (!v) return 14;
    const n = Number(v);
    return isNaN(n) ? 14 : Math.min(20, Math.max(8, n));
  }),
  suggestedAudiophileGrade: z.enum(['Reference', 'Hi-Res Lossless', 'Standard']).nullish().transform((v) => v || 'Reference')
});

export type ValidatedArtistAnalysisResponse = z.infer<typeof ArtistAnalysisResponseSchema>;

/**
 * 健壯型資料預先清洗器 (Pre-normalization)
 * 解決 AI 常見的回傳別名命名差異（如 snake_case vs camelCase）與 null 污染
 */
export function sanitizeAnalysisPayload(raw: any, fallbackName: string): any {
  if (!raw || typeof raw !== 'object') return { name: fallbackName };

  const clean: any = { ...raw };

  // 1. 保證 name 存在
  clean.name = clean.name || fallbackName;

  // 2. 別名對齊相容 (Aliasing Mapping)
  if (!clean.subGenre && clean.sub_genre) clean.subGenre = clean.sub_genre;
  if (!clean.artistRole && clean.artist_role) clean.artistRole = clean.artist_role;
  if (!clean.aestheticTags && clean.aesthetic_tags) clean.aestheticTags = clean.aesthetic_tags;
  if (!clean.similarArtists && clean.similar_artists) clean.similarArtists = clean.similar_artists;
  if (!clean.instrumentationNotes && clean.instrumentation_notes) clean.instrumentationNotes = clean.instrumentation_notes;
  
  // 3. notableAlbums 對齊相容
  if (!clean.notableAlbums && clean.albums) clean.notableAlbums = clean.albums;
  if (!clean.notableAlbums && clean.notable_albums) clean.notableAlbums = clean.notable_albums;
  if (!clean.notableAlbums && clean.recommendedAlbums) clean.notableAlbums = clean.recommendedAlbums;

  // 4. sector 大小寫正規化（若 AI 輸出小寫 rock 轉為大寫 ROCK，有效性統一由 Zod 把關）
  if (clean.sector && typeof clean.sector === 'string') {
    clean.sector = clean.sector.trim().toUpperCase();
  }

  // 5. 遞迴將所有 null 欄位安全轉換為 undefined
  function stripNulls(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(stripNulls);
    }
    if (obj !== null && typeof obj === 'object') {
      const res: any = {};
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        res[key] = val === null ? undefined : stripNulls(val);
      }
      return res;
    }
    return obj;
  }

  return stripNulls(clean);
}
