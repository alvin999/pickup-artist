export interface NotableAlbum {
  title: string;
  year: string;
  description: string;
  appleMusicSearchUrl: string;
}

export interface ArtistAnalysis {
  genres: string[];
  summary: string;
  notableAlbums: NotableAlbum[];
  similarArtists: string[];
  instrumentationNotes?: string;
}

export interface ArtistEntry {
  id: string;                      // UUID 或 slug
  name: string;                    // 藝人名稱
  aliases?: string[];              // 羅馬拼音、日文、英文別名
  appleMusicUrl?: string;          // Apple Music 連結
  status: 'inbox' | 'analyzed';    // inbox (拾音未解剖) | analyzed (已完成 AI 解剖)
  addedAt: number;                 // UTC 毫秒
  updatedAt: number;               // UTC 毫秒
  
  // AI 結構化音樂學分析
  analysis?: ArtistAnalysis;
  
  // 發燒友聆聽筆記與評價
  personalNotes?: string;
  rating?: number;                 // 1 - 5 星級
  audiophileGrade?: 'Reference' | 'Hi-Res Lossless' | 'Standard';
  dynamicRange?: number;           // DR 分數（例如 14）
  
  // 發燒友唱片架與刻號欄位 (Crate Digger Spec)
  catalogNumber?: string;          // 例如 'CAT# XQIF-1003'
  runoutMatrix?: string;           // 例如 'RUNOUT: A-1 SST'
  formatSpec?: string;             // 例如 'DR 14 // 96kHz 24bit'
  fileSize?: string;               // 例如 '1.18 GB FLAC'
  coverImage?: string;             // 專輯或藝人封面
  
  // 聲學星系座標 (Honeycomb Cluster Matrix)
  clusterCategory?: 'math-rock' | 'jazz' | 'neo-classical' | 'ambient';
  clusterPos?: { x: number; y: number };
}

export interface CloudSyncPayload {
  version: 1;
  lastSyncedAt: number;
  artists: ArtistEntry[];
  deletedIds: string[];            // 墓碑記錄 (Tombstones) 支援多端一致刪除
}
