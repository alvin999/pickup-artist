export interface NotableAlbum {
  title: string;
  year: string;
  tier?: 'milestone' | 'hidden-treasure'; // 時代基石 vs 深埋寶藏 (Hidden Treasure)
  description: string;
  appleMusicSearchUrl: string;
  rarityReason?: string;                  // 挖寶理由 (非演算法芭樂、冷門現場、絕版小品)
  audiophileHighlight?: string;           // 聲學亮點 (極致動態、原木共振、真空管純度)
  dynamicRangeScore?: number;             // DR 動態值 (如 14+)
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
  name: string;                    // 藝人名稱 (以 Artist 為本體核心)
  aliases?: string[];              // 羅馬拼音、日文、英文別名
  appleMusicUrl?: string;          // Apple Music 連結
  status: 'inbox' | 'analyzed';    // inbox (拾音未解剖) | analyzed (已完成 AI 解剖)
  addedAt: number;                 // UTC 毫秒
  updatedAt: number;               // UTC 毫秒
  
  // 多重身分系譜 (Side Projects & Collaborations)
  entityType?: 'solo' | 'band' | 'side-project' | 'supergroup';
  lineage?: {
    primaryArtistId?: string;      // 母體藝人 ID (如 Thom Yorke, toe)
    primaryArtistName?: string;    // 母體藝人名稱
    memberRoster?: string[];       // 核心成員名單
  };

  // 古典樂雙軸座標 (Classical Music Dual-Key Dimensions: 作曲家 ✕ 詮釋者)
  classicalRole?: 'performer' | 'conductor' | 'composer' | 'orchestra';
  classicalMetadata?: {
    composer?: string;             // 作曲家 (例如 J.S. Bach, Beethoven, Chopin)
    workTitle?: string;            // 代表作品名稱 (例如 Goldberg Variations, BWV 988)
    instrumentOrRole?: string;     // 樂器/職稱 (例如 Piano, Cello, Conductor)
    orchestra?: string;            // 合作樂團 (例如 Berliner Philharmoniker)
    recordingYear?: string;        // 錄音版本年代 (發燒版本學核心)
  };

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
