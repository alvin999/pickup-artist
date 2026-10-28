export interface NotableAlbum {
  title: string;
  year: string;
  tier?: 'milestone' | 'hidden-treasure'; // 時代基石 vs 深埋寶藏 (Hidden Treasure)
  trackType?: string;                     // 相容別名
  losslessSpec?: string;                  // 無損規格 (例如 96kHz 24bit ALAC)
  description: string;
  appleMusicSearchUrl: string;
  rarityReason?: string;                  // 挖寶理由 (非演算法芭樂、冷門現場、絕版小品)
  audiophileHighlight?: string;           // 聲學亮點 (極致動態、原木共振、真空管純度)
  dynamicRangeScore?: number;             // DR 動態值 (如 14+)
}

/** 語意別名：本專案以 Artist 為本體核心，notableAlbums 投影為藝人代表作品 (Notable Works) */
export type NotableWork = NotableAlbum;

// 蜂巢 8 軸全景星系羅盤 (Level 1 固定大板塊)
export type AcousticSector =
  | 'ROCK'        // 0°: 搖滾 (含 Indie Rock, Math Rock, Post-Rock, Prog)
  | 'METAL'       // 45°: 重型金屬 (Metalcore, Death Metal, Sludge, Doom)
  | 'CLASSICAL'   // 90°: 古典 (古典/巴洛克/浪漫/現代，依 樂派 ✕ 樂器 編制)
  | 'JAZZ'        // 135°: 爵士 (Modern Jazz, Fusion, Bebop, Hard Bop)
  | 'AMBIENT'     // 180°: 氛圍與實驗 (Drone, Modern Classical, Soundscape)
  | 'ELECTRONIC'  // 225°: 電子前衛 (IDM, Ambient Techno, Synthwave, Glitch)
  | 'GROOVE'      // 270°: 律動與靈魂 (Funk, Soul, Neo-Soul, R&B, Hip-Hop)
  | 'WORLD';      // 315°: 世界音樂與民族根源 (World Fusion, Afrobeat, Traditional Folk, Ethno-Ambient)

export interface ArtistAnalysis {
  // 三層分類體系
  sector: AcousticSector;        // Level 1: 蜂巢 8 軸固定大板塊
  subGenre: string;              // Level 2: AI 決定的代表子流派 (例如 Neo-Soul, Baroque Cello, Math Rock)
  artistRole?: string;           // 藝人核心角色與專精 (例如 Bassist / Vocalist, Piano Trio, Producer)
  era?: string;                  // 代表年代或活躍時期 (例如 '2000s', '1970s Golden Era', '1950s - 1970s')
  aestheticTags?: string[];      // Level 3: 美學與態度標籤 (例如 indie, analog-warmth, lo-fi, progressive)
  
  genres: string[];              // 相關音樂標籤
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
  weight?: number;                 // 聲學引力權重 1 ~ 100 (預設 20，直接控制星體體積、引力場與 LOD 宏觀可見度)
  audiophileGrade?: 'Reference' | 'Hi-Res Lossless' | 'Standard';
  dynamicRange?: number;           // DR 分數（例如 14）
  
  // 發燒友發行規格與識別欄位 (Audiophile Release Spec)
  catalogNumber?: string;          // 例如 'CAT# XQIF-1003'
  runoutMatrix?: string;           // 例如 'RUNOUT: A-1 SST'
  formatSpec?: string;             // 例如 'DR 14 // 96kHz 24bit'
  fileSize?: string;               // 例如 '1.18 GB FLAC'
  coverImage?: string;             // 藝人或代表作品封面
  countryCode?: string;            // 產地/版本標記 (如 'JP', 'TW', 'US', 'NO')
  
  // 藝人歷史時空與音樂史定位 (Artist Origin & Canon Telemetry)
  originLocation?: string;        // 發跡地 (例如 'TOKYO_JP', 'OXFORD_UK', 'NEW_YORK_US')
  formedYear?: string;            // 成軍/出道年份 (例如 '2000', '1956', '1985')
  canonTier?: string;             // 音樂史定位 (例如 'CULT_CLASSIC', 'GENRE_DEFINING', 'VIRTUOSO', 'PIONEER')
  formation?: string;             // 編制型態 (例如 '4-PIECE', 'POWER_TRIO', 'SOLO_ACOUSTIC')
  
  // 聲學星系座標 (Honeycomb Cluster Matrix)
  clusterCategory?: AcousticSector | 'math-rock' | 'jazz' | 'neo-classical' | 'ambient';
  clusterSector?: AcousticSector;
  clusterPos?: { x: number; y: number };

  // 聆賞手札擴充 (Listening Journal)
  listeningContext?: {
    scene?: 'headphone' | 'speaker' | 'on-the-go' | 'night-solitude'; // 極簡聆聽情境 (最低限度)
    pickedAlbums?: string[];       // 點選喜愛的代表作品名稱 (源自 notableAlbums)
    favoriteTracks?: string[];     // 心頭好曲目 (點擊標記或自填)
    moodTags?: string[];           // 氛圍標籤 (點擊即選)
    lastLoggedAt?: number;         // 最後記述時間戳
  };
}

export interface CloudSyncPayload {
  version: 1;
  lastSyncedAt: number;
  artists: ArtistEntry[];
  deletedIds: string[];            // 墓碑記錄 (Tombstones) 支援多端一致刪除
}
