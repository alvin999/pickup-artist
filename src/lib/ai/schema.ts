import { z } from 'zod';

export const NotableAlbumSchema = z.object({
  title: z.string().min(1, '專輯名稱不可為空'),
  year: z.string().default(''),
  tier: z.enum(['milestone', 'hidden-treasure']).default('milestone'),
  description: z.string().default(''),
  appleMusicSearchUrl: z.string().default(''),
  rarityReason: z.string().optional(),
  audiophileHighlight: z.string().optional(),
  dynamicRangeScore: z.number().optional()
});

export const ClassicalMetadataSchema = z.object({
  composer: z.string().optional(),
  workTitle: z.string().optional(),
  instrumentOrRole: z.string().optional(),
  orchestra: z.string().optional(),
  recordingYear: z.string().optional()
});

export const ArtistAnalysisResponseSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  
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
  ]),
  subGenre: z.string().min(1, '子流派不可為空'),
  // 藝人核心角色與專精（例如 Bassist / Vocalist、Piano Trio、Producer）
  artistRole: z.string().optional(),
  aestheticTags: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  
  // 藝人與身分型態
  entityType: z.enum(['solo', 'band', 'side-project', 'supergroup']).default('band'),
  lineage: z.object({
    primaryArtistName: z.string().optional(),
    memberRoster: z.array(z.string()).optional()
  }).optional(),
  
  // 古典樂二維指標
  classicalRole: z.enum(['performer', 'conductor', 'composer', 'orchestra']).optional(),
  classicalMetadata: ClassicalMetadataSchema.optional(),
  
  // 發燒友分析與聲響簽名
  summary: z.string().min(10, '簡介至少需包含基本生平與風格'),
  instrumentationNotes: z.string().optional(),
  similarArtists: z.array(z.string()).default([]),
  
  // 雙軌專輯挖掘（Milestone ✕ Hidden Treasure）
  notableAlbums: z.array(NotableAlbumSchema).min(1, '至少需推薦一張專輯'),
  
  // 發燒友指標建議
  suggestedDynamicRange: z.number().min(8).max(20).optional(),
  suggestedAudiophileGrade: z.enum(['Reference', 'Hi-Res Lossless', 'Standard']).optional()
});

export type ValidatedArtistAnalysisResponse = z.infer<typeof ArtistAnalysisResponseSchema>;
