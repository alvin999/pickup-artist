import Dexie, { type Table } from 'dexie';
import type { ArtistEntry } from '$lib/types/artist';
import {
  buildAppleMusicSearchUrl,
  extractFromAppleMusicUrl,
  fetchAppleMusicMetadata,
  type ArtistCandidate
} from '$lib/utils/appleMusic';
import { fetchArtistPortrait } from '$lib/utils/artistImage';

export interface Tombstone {
  id: string;
  deletedAt: number;
}

export class PuaDatabase extends Dexie {
  artists!: Table<ArtistEntry, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super('PickupArtistDB');
    this.version(1).stores({
      artists: 'id, name, status, addedAt, updatedAt, *aliases, *analysis.genres',
      tombstones: 'id, deletedAt'
    });
  }
}

export const db = new PuaDatabase();

// ----------------------------------------------------
// 資料庫變更監聽機制（供自動雲端同步等服務解耦訂閱）
// ----------------------------------------------------
export type DbChangeEvent =
  | { type: 'upsert'; artist: ArtistEntry }
  | { type: 'delete'; id: string }
  | { type: 'batch'; count?: number };

type DbChangeListener = (event?: DbChangeEvent) => void;
const changeListeners = new Set<DbChangeListener>();

export function onDatabaseChange(listener: DbChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function notifyDatabaseChange(event?: DbChangeEvent): void {
  changeListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('[DB] Change listener error:', err);
    }
  });
}

/**
 * 離線防護檢查：若當前斷網，禁止修改本地資料庫以避免雲端狀態脫節
 */
export function assertOnline(): void {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    throw new Error('目前處於離線狀態，無法即時同步至雲端，請檢查網路連線後再試。');
  }
}

// 產生安全 ID
export function generateId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'artist'}-${Date.now().toString(36)}`;
}

/**
 * 比對本地既有藝人是否有重複或同名
 * 優先判定 Apple Music 來源一致（代表同一位藝人），次之判定名稱相符（潛在同名藝人）
 */
export function checkDuplicateArtist(
  existingArtists: ArtistEntry[],
  name: string,
  appleMusicUrl?: string
): { exactUrlMatch?: ArtistEntry; nameMatch?: ArtistEntry } | null {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName && !appleMusicUrl) return null;

  let exactUrlMatch: ArtistEntry | undefined;
  if (appleMusicUrl) {
    const cleanUrl = appleMusicUrl.trim().toLowerCase();
    exactUrlMatch = existingArtists.find(
      (a) => a.appleMusicUrl && a.appleMusicUrl.trim().toLowerCase() === cleanUrl
    );
  }

  const nameMatch = existingArtists.find(
    (a) => a.name.trim().toLowerCase() === cleanName
  );

  if (exactUrlMatch || nameMatch) {
    return { exactUrlMatch, nameMatch };
  }
  return null;
}

/**
 * 非同步直接查閱 IndexedDB 資料庫比對重複或同名藝人
 */
export async function findDuplicateArtist(
  name: string,
  appleMusicUrl?: string
): Promise<{ exactUrlMatch?: ArtistEntry; nameMatch?: ArtistEntry } | null> {
  const all = await db.artists.toArray();
  return checkDuplicateArtist(all, name, appleMusicUrl);
}

// 快速拾音（支援自動查詢 Apple Music 高清封面，或直接套用使用者選定之候選藝人）
export async function quickPickupArtist(rawInput: string, candidate?: ArtistCandidate): Promise<ArtistEntry> {
  assertOnline();
  const now = Date.now();

  if (candidate) {
    const finalName = candidate.name;
    const appleMusicUrl = candidate.appleMusicUrl || buildAppleMusicSearchUrl(finalName);
    const formatSpec = candidate.releaseYear ? `${candidate.releaseYear} // Lossless Master` : 'Lossless Hi-Res';

    const entry: ArtistEntry = {
      id: generateId(finalName),
      name: finalName,
      status: 'inbox',
      appleMusicUrl,
      coverImage: candidate.coverImage,
      formatSpec,
      addedAt: now,
      updatedAt: now
    };

    await db.artists.put(entry);
    notifyDatabaseChange({ type: 'upsert', artist: entry });
    return entry;
  }

  const trimmed = rawInput.trim();
  const { isUrl, name, cleanUrl } = extractFromAppleMusicUrl(trimmed);

  const finalName = name || (isUrl ? 'Apple Music 拾音' : trimmed);
  let appleMusicUrl = cleanUrl || (isUrl ? trimmed : buildAppleMusicSearchUrl(finalName));
  let coverImage: string | undefined = undefined;
  let formatSpec = 'Lossless Hi-Res';

  // 視覺配置原則：優先採用 Apple Music 官方代表作母帶封面（800x800），若無封面才以代表作品交叉驗證 Wiki 肖像
  try {
    const meta = await fetchAppleMusicMetadata(finalName);
    if (meta) {
      if (meta.coverImage) coverImage = meta.coverImage;
      if (meta.appleMusicUrl && !isUrl) appleMusicUrl = meta.appleMusicUrl;
      if (meta.releaseYear) formatSpec = `${meta.releaseYear} // Lossless Master`;
    }

    if (!coverImage) {
      const portrait = await fetchArtistPortrait(finalName, meta?.albumTitle);
      if (portrait) coverImage = portrait;
    }
  } catch (err) {
    console.warn('[PickupArtist] 查詢藝人肖像與 Apple Music 異常:', err);
  }

  const entry: ArtistEntry = {
    id: generateId(finalName),
    name: finalName,
    status: 'inbox',
    appleMusicUrl,
    coverImage,
    formatSpec,
    addedAt: now,
    updatedAt: now
  };

  await db.artists.put(entry);
  notifyDatabaseChange({ type: 'upsert', artist: entry });
  return entry;
}

// 取得全部藝人（按更新時間倒序）
export async function getArtists(): Promise<ArtistEntry[]> {
  return await db.artists.orderBy('updatedAt').reverse().toArray();
}

// 更新藝人
export async function updateArtist(id: string, updates: Partial<ArtistEntry>): Promise<void> {
  assertOnline();
  const existing = await db.artists.get(id);
  if (!existing) return;

  const now = Date.now();
  const updatedEntry: ArtistEntry = {
    ...existing,
    ...updates,
    updatedAt: now
  };

  // 剝離 Svelte 5 Reactive Proxy，防止 IndexedDB put 觸發 DataCloneError
  const cloneableEntry = JSON.parse(JSON.stringify(updatedEntry));

  await db.artists.put(cloneableEntry);
  notifyDatabaseChange({ type: 'upsert', artist: cloneableEntry });
}

// 刪除藝人（記錄墓碑）
export async function deleteArtist(id: string): Promise<void> {
  assertOnline();
  const now = Date.now();
  await db.transaction('rw', db.artists, db.tombstones, async () => {
    await db.artists.delete(id);
    await db.tombstones.put({ id, deletedAt: now });
  });
  notifyDatabaseChange({ type: 'delete', id });
}

// 取得所有墓碑 ID
export async function getTombstones(): Promise<string[]> {
  const rows = await db.tombstones.toArray();
  return rows.map((r) => r.id);
}

// 自動修復封面：若藝人無封面或使用失效的原型暫存網址，自動向 Apple Music 抓取官方高清封面
export async function autoHealArtistCovers(): Promise<boolean> {
  const all = await db.artists.toArray();
  let updatedAny = false;

  for (const artist of all) {
    const isInvalid = !artist.coverImage || artist.coverImage.includes('lh3.googleusercontent.com');
    if (isInvalid) {
      try {
        const cleanName = artist.name.replace(/\(.*?\)/g, '').trim();
        const meta = await fetchAppleMusicMetadata(cleanName || artist.name);
        if (meta?.coverImage) {
          await db.artists.update(artist.id, {
            coverImage: meta.coverImage,
            appleMusicUrl: artist.appleMusicUrl || meta.appleMusicUrl,
            updatedAt: Date.now()
          });
          updatedAny = true;
        }
      } catch (err) {
        console.warn(`[AutoHeal] 修復藝人「${artist.name}」封面失敗:`, err);
      }
    }
  }

  if (updatedAny) {
    notifyDatabaseChange();
  }
  return updatedAny;
}

// 預設發燒友種子資料（初次使用時載入經典 Studio 資料）
export async function seedInitialSampleIfEmpty(): Promise<void> {
  const count = await db.artists.count();
  if (count > 0) return;

  const now = Date.now();
  const samples: ArtistEntry[] = [
    {
      id: 'toe-math-rock-master',
      name: 'toe (トー)',
      aliases: ['Toe', 'Toe Japan'],
      appleMusicUrl: 'https://music.apple.com/search?term=toe',
      status: 'analyzed',
      addedAt: now - 3600000 * 24 * 3,
      updatedAt: now - 3600000 * 12,
      audiophileGrade: 'Reference',
      dynamicRange: 14,
      catalogNumber: 'CAT# XQIF-1003',
      runoutMatrix: 'RUNOUT: A-1 SST',
      formatSpec: 'DR 14 // 96kHz 24bit',
      fileSize: '1.18 GB FLAC',
      coverImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBNLqkgl6LIvCPRm3PJ7vvSR9yQkN4eOwekMdbIPPvuxwWJl_gKbdga0PxkjKxdu0lqPTZUrUfCJcT4Tc0GZm56AYfaJah3GJWBrOjNLl0fPtgTLWHbCGSa1UeUgzB6MPlI2VDHZ6gH9Oy-DQ87suf38iqBYrswRpNXsV8-32mnRp0zaT8NfeeArCk7mGoPhY9aUzcbv5b3Adj1qU1LaknYrK91pLpJPyUVPSo2Fud0SjJ6DlGTup0',
      countryCode: 'JP',
      clusterCategory: 'ROCK',
      clusterSector: 'ROCK',
      clusterPos: { x: 390, y: 520 },
      personalNotes: '吉他 Fender Twin Reverb 管機音色顆粒清脆，小鼓 Ghost Notes 極度動態，發燒測試片首選。',
      analysis: {
        sector: 'ROCK',
        subGenre: 'Math Rock',
        aestheticTags: ['indie', 'analog-recording', 'complex-polyrhythm'],
        genres: ['Math Rock', 'Instrumental Rock', 'Post-Rock'],
        summary: '2000 年成軍於日本東京的傳奇器樂搖滾/數學搖滾名團。由山嵜廣和（吉他）、美濃隆章（吉他）、山根敏史（貝斯）與柏倉隆史（鼓）四人組成。以細密繁複的點弦、動態龐大的鼓點切分以及無可挑剔的類比錄音品質聞名於世。',
        instrumentationNotes: '極低壓縮比的純淨錄音。柏倉隆史狂暴卻精確的軍鼓多節奏切分、美濃隆章空間系延遲以及 Fender 原聲吉他琴弦摩擦質地清晰可聞。',
        similarArtists: ['mouse on the keys', 'LITE', 'elephant gym', 'Tricot', 'Enemies'],
        notableAlbums: [
          {
            title: 'The Book About My Idle Plot on a Vague Anxiety',
            year: '2005',
            tier: 'milestone',
            description: '數學搖滾界的不朽神作，收錄經典曲目《Lonely God》。展現無懈可擊的聲學層次與殘響控制。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=toe+The+Book+About+My+Idle+Plot'
          },
          {
            title: 'RGBDVD (Live Session Uncompressed)',
            year: '2006',
            tier: 'hidden-treasure',
            rarityReason: '演算法幾乎不推的排練室未過度壓縮實況直錄，小鼓 Ghost Notes 殘響比正規專輯更具野性動態。',
            audiophileHighlight: '無壓限 Brickwall Limiter，鼓組踏鈸動態飽滿，錄音室空氣振動歷歷在目。',
            dynamicRangeScore: 15,
            description: '發燒友秘密試音天碟，極度純淨的雙吉他空間延遲與多節奏切分直錄。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=toe+RGBDVD'
          }
        ]
      }
    },
    {
      id: 'ichiko-aoba-master',
      name: '青葉市子 (Ichiko Aoba)',
      aliases: ['Ichiko Aoba'],
      appleMusicUrl: 'https://music.apple.com/search?term=Ichiko+Aoba',
      status: 'analyzed',
      addedAt: now - 3600000 * 24 * 5,
      updatedAt: now - 3600000 * 8,
      audiophileGrade: 'Reference',
      dynamicRange: 15,
      catalogNumber: 'CAT# DDCZ-1920',
      runoutMatrix: 'TASCAM 2-TRACK',
      formatSpec: '192kHz Master Tape',
      fileSize: '1.84 GB ALAC',
      coverImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDMys1KzvRVMY8yMLhehAhAQlCemU59ljtuVLMGMNrrsgXG21bpD_PxmK7Y4LKzHeihDQx0TDrJBFTsTEHJ8ipM7OCP-hNNCsdaJO0i12k06VDPB46Wgx6GOi8Id3IlYCRFhTDlUIKePSbdhwll-Qs-AUJ8795ckLy49R47Y9fzK3YRiSH-6XU5vU2SMk24IEWgazIh_VIUmgZN4kJeUErR_LRVQD3FPfaUYUnrq9MzyayJFAJ3lDY',
      countryCode: 'JP',
      clusterCategory: 'AMBIENT',
      clusterSector: 'AMBIENT',
      clusterPos: { x: 550, y: 380 },
      personalNotes: '尼龍弦古典吉他與超近場人聲拾音，底噪極低，空氣感如同置身原木錄音室。',
      analysis: {
        sector: 'AMBIENT',
        subGenre: 'Ambient Folk',
        aestheticTags: ['indie', 'pure-acoustic', 'tube-mic'],
        genres: ['Ambient Folk', 'Acoustic Folk', 'Chamber Music'],
        summary: '日本當代氛圍民謠作曲家、吉他手兼歌手。善於利用空間自然混響與清澈透明的古典吉他指彈，建構如同水底世界般的沉浸聽覺場景。',
        instrumentationNotes: '單聲道與立體聲麥克風超微距收音，人聲喉音細節與吉他琴體共振被完整捕捉，高頻泛音延伸自然不刺耳。',
        similarArtists: ['Cornelius', '細野晴臣', 'Haruka Nakamura', 'Meitei'],
        notableAlbums: [
          {
            title: 'Windswept Adan (アダンの風)',
            year: '2020',
            tier: 'milestone',
            description: '融合室內樂管弦樂與海洋音景的顛峰之作，發燒友空間定位必備試金石。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Ichiko+Aoba+Windswept+Adan'
          },
          {
            title: '剃刀乙女 (Kamisori Otome)',
            year: '2010',
            tier: 'hidden-treasure',
            rarityReason: '十九歲初試啼聲之作。僅憑一把古董古典吉他與超近場麥克風單軌直錄，純度超越後期繁複編制。',
            audiophileHighlight: '指尖刮弦松香顆粒感清晰，換氣喉音與現場自然堂音零人工混響修飾。',
            dynamicRangeScore: 16,
            description: '極簡聲學奇蹟，深埋於串流長尾的超高動態無瑕原音。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Ichiko+Aoba+Kamisori+Otome'
          }
        ]
      }
    },
    {
      id: 'bill-evans-trio-sacd',
      name: 'Bill Evans Trio',
      aliases: ['Bill Evans', 'The Bill Evans Trio'],
      appleMusicUrl: 'https://music.apple.com/search?term=Bill+Evans+Trio',
      status: 'analyzed',
      addedAt: now - 3600000 * 24 * 10,
      updatedAt: now - 3600000 * 2,
      audiophileGrade: 'Reference',
      dynamicRange: 16,
      catalogNumber: 'CAT# RLP-9399',
      runoutMatrix: 'DSD64 SACD RIVERSIDE',
      formatSpec: 'DSD64 SACD Riverside 1961',
      fileSize: '1.45 GB DFF',
      coverImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCtWYRNDOdNst_nEcLM7STm8h9RKIqSSdSA5p17OBKxRbRt-iMZ2GQStUOoGAd19pY5TTX4JSUcqWa2oOtYGL_WyHnda4M29fwhaPIUHqo2lObbo1T5LxI2ECRvF27xx80sFCS9JiY_-16NhV6QQ_3Nk-JIyZEaKOvUkumdvdmLOFO_BH6sb_4WtWWc1kg-B9N38Utq-gIN9Snp8d67zK0HV_9D6qWdxMDVFZ0hIT9HC3tj11wSLDs',
      countryCode: 'US',
      clusterCategory: 'JAZZ',
      clusterSector: 'JAZZ',
      clusterPos: { x: 230, y: 260 },
      personalNotes: '現場杯盤碰撞聲與空氣流動感歷歷在目，史考特·拉法羅低音提琴撥弦彈跳感無敵。',
      analysis: {
        sector: 'JAZZ',
        subGenre: 'Modal Jazz Trio',
        aestheticTags: ['legendary-trio', 'vanguard-live', 'deep-soundstage'],
        genres: ['Modal Jazz', 'Cool Jazz', 'Piano Trio'],
        summary: '爵士鋼琴傳奇大師 Bill Evans 與天才貝斯手 Scott LaFaro、鼓手 Paul Motian 共同組成的歷史標竿三重奏。1961 年在 Village Vanguard 的現場錄音奠定了三方對等即興對話之典範。',
        instrumentationNotes: '三軌類比母帶極致還原。低音提琴高頻泛音與琴身木質共鳴深沉而飽滿，鼓刷在鈸片上的微弱沙沙聲精雕細琢。',
        similarArtists: ['Keith Jarrett', 'Brad Mehldau', 'Thelonious Monk', 'Miles Davis'],
        notableAlbums: [
          {
            title: 'Waltz for Debby',
            year: '1962',
            tier: 'milestone',
            description: '發燒友試音神碟，琴鍵敲擊的瞬態反應與泛音無可取代。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Bill+Evans+Waltz+for+Debby'
          },
          {
            title: 'Undercurrent (with Jim Hall)',
            year: '1962',
            tier: 'hidden-treasure',
            rarityReason: '擺脫三重奏常規，僅由鋼琴與空心電吉他進行即興交織。著名水底浮沉白衣女子封面。',
            audiophileHighlight: '吉他音箱電子管溫暖微醺感與鋼琴音槌落點分離度極高，聲底漆黑如夜。',
            dynamicRangeScore: 16,
            description: '爵士史上最私密的二重奏明珠，深埋於主流推薦清單之外。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Bill+Evans+Jim+Hall+Undercurrent'
          }
        ]
      }
    },
    {
      id: 'glenn-gould-classical-master',
      name: 'Glenn Gould (格連·顧爾德)',
      aliases: ['Glenn Gould'],
      appleMusicUrl: 'https://music.apple.com/search?term=Glenn+Gould',
      status: 'analyzed',
      addedAt: now - 3600000 * 24 * 7,
      updatedAt: now - 3600000 * 4,
      entityType: 'solo',
      classicalRole: 'performer',
      countryCode: 'CA',
      classicalMetadata: {
        composer: 'J.S. Bach / Johannes Brahms',
        workTitle: 'Goldberg Variations / Intermezzi',
        instrumentOrRole: 'Piano',
        recordingYear: '1981 DSD Master'
      },
      audiophileGrade: 'Reference',
      dynamicRange: 15,
      catalogNumber: 'CAT# S3K-87703',
      runoutMatrix: 'SONY CLASSICAL DSD',
      formatSpec: 'DSD Master Tape 1981',
      fileSize: '1.92 GB DFF',
      coverImage: 'https://images.unsplash.com/photo-1513883049090-d0b7439799bf?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'CLASSICAL',
      clusterSector: 'CLASSICAL',
      clusterPos: { x: 420, y: 190 },
      personalNotes: '1981 年數位錄音成熟之際的告別遺作，哼唱聲與琴槌運動渾然一體。',
      analysis: {
        sector: 'CLASSICAL',
        subGenre: 'Baroque Keyboard',
        aestheticTags: ['analytical-clarity', 'unpedaled-counterpoint', 'columbia-master'],
        genres: ['Classical', 'Baroque Piano', 'Romantic Piano'],
        summary: '二十世紀最富爭議與天才特質的加拿大鋼琴怪傑。以極度清晰、無踏板獨立聲部跳音演奏巴哈複調音樂奠定不可撼動之歷史地位。',
        instrumentationNotes: '特製調校 Steinway CD 318 鋼琴，極淺觸鍵深度，音色兼具古大鍵琴的顆粒分離度與現代平台鋼琴之共振。錄音中甚至保留其標誌性的低聲哼唱。',
        similarArtists: ['Sviatoslav Richter', 'Martha Argerich', 'Murray Perahia'],
        notableAlbums: [
          {
            title: 'Bach: The Goldberg Variations (1981 Digital Recording)',
            year: '1981',
            tier: 'milestone',
            description: '生命終曲的深沉冥想，與 1955 年急速狂飆版形成天壤之別的聲學名盤。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Glenn+Gould+Goldberg+Variations+1981'
          },
          {
            title: 'Brahms: 10 Intermezzi, Op. 116–119',
            year: '1961',
            tier: 'hidden-treasure',
            rarityReason: '巴哈權威顧爾德極罕見的浪漫派私密詮釋，被他本人稱作「自己錄過最深情溫暖的唱片」。',
            audiophileHighlight: '觸鍵極度輕柔舒緩，哥倫比亞錄音室 30 街教堂自然殘響溫暖充盈。',
            dynamicRangeScore: 15,
            description: '深埋於巴哈光環之後的浪漫派試音神作。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Glenn+Gould+Brahms+10+Intermezzi'
          }
        ]
      }
    },
    {
      id: 'mouse-on-the-keys-master',
      name: 'mouse on the keys',
      aliases: ['マウス・オン・ザ・キーズ'],
      appleMusicUrl: 'https://music.apple.com/search?term=mouse+on+the+keys',
      status: 'analyzed',
      addedAt: now - 3600000 * 24 * 2,
      updatedAt: now - 3600000 * 5,
      audiophileGrade: 'Hi-Res Lossless',
      dynamicRange: 13,
      catalogNumber: 'CAT# PECF-3004',
      runoutMatrix: 'RUNOUT: M-2 TOKYO',
      formatSpec: '96kHz 24bit FLAC',
      fileSize: '0.95 GB FLAC',
      coverImage: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'ROCK',
      clusterSector: 'ROCK',
      clusterPos: { x: 260, y: 590 },
      personalNotes: '雙鋼琴與狂暴鼓點的幾何交織，低頻下潛厚重且速度感極佳。',
      analysis: {
        sector: 'ROCK',
        subGenre: 'Math Rock / Post-Jazz',
        aestheticTags: ['indie', 'dual-piano', 'heavy-drumming'],
        genres: ['Math Rock', 'Post-Rock', 'Jazz Fusion'],
        summary: '以雙鋼琴與爵士鼓為核心編制的日本前衛後搖/數學樂團。兼具極簡主義現代音樂之冷冽與後硬核節奏之狂熱爆發力。',
        instrumentationNotes: '雙鋼琴在立體聲場左右兩側精準分佈，琴槌重擊瞬態響應俐落，鼓點多節奏切分清晰可聞。',
        similarArtists: ['toe', 'fox capture plan', 'LITE', 'Jaga Jazzist'],
        notableAlbums: [
          {
            title: 'an anarchic alphabet',
            year: '2009',
            tier: 'milestone',
            description: '代表作之一，呈現冷靜黑白幾何結構與熱烈打擊樂之高度對比。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=mouse+on+the+keys+an+anarchic+alphabet'
          }
        ]
      }
    },
    {
      id: 'elephant-gym-inbox',
      name: '大象體操 (Elephant Gym)',
      aliases: ['Elephant Gym'],
      appleMusicUrl: 'https://music.apple.com/search?term=Elephant+Gym',
      status: 'inbox',
      addedAt: now - 3600000 * 2,
      updatedAt: now - 3600000 * 2,
      catalogNumber: 'CAT# EG-2024-TW',
      runoutMatrix: 'INBOX RAW',
      formatSpec: 'Hi-Res Lossless',
      fileSize: '840 MB FLAC',
      coverImage: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'math-rock',
      clusterPos: { x: 500, y: 580 }
    },
    {
      id: 'lite-inbox',
      name: 'LITE',
      aliases: ['ライト'],
      appleMusicUrl: 'https://music.apple.com/search?term=LITE+band',
      status: 'inbox',
      addedAt: now - 3600000 * 1,
      updatedAt: now - 3600000 * 1,
      catalogNumber: 'CAT# IWMR-001',
      runoutMatrix: 'INBOX RAW',
      formatSpec: 'FLAC 48/24',
      fileSize: '720 MB FLAC',
      coverImage: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'math-rock',
      clusterPos: { x: 440, y: 440 }
    }
  ];

  for (const s of samples) {
    await db.artists.put(s);
  }
}
