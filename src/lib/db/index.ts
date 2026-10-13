import Dexie, { type Table } from 'dexie';
import type { ArtistEntry } from '$lib/types/artist';
import { buildAppleMusicSearchUrl, extractFromAppleMusicUrl } from '$lib/utils/appleMusic';

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

// 快速拾音
export async function quickPickupArtist(rawInput: string): Promise<ArtistEntry> {
  const now = Date.now();
  const trimmed = rawInput.trim();
  const { isUrl, name, cleanUrl } = extractFromAppleMusicUrl(trimmed);

  const finalName = name || (isUrl ? 'Apple Music 拾音' : trimmed);
  const appleMusicUrl = cleanUrl || (isUrl ? trimmed : buildAppleMusicSearchUrl(finalName));

  const entry: ArtistEntry = {
    id: generateId(finalName),
    name: finalName,
    status: 'inbox',
    appleMusicUrl,
    addedAt: now,
    updatedAt: now
  };

  await db.artists.put(entry);
  return entry;
}

// 取得全部藝人（按更新時間倒序）
export async function getArtists(): Promise<ArtistEntry[]> {
  return await db.artists.orderBy('updatedAt').reverse().toArray();
}

// 更新藝人
export async function updateArtist(id: string, updates: Partial<ArtistEntry>): Promise<void> {
  const existing = await db.artists.get(id);
  if (!existing) return;

  const now = Date.now();
  await db.artists.update(id, {
    ...updates,
    updatedAt: now
  });
}

// 刪除藝人（記錄墓碑）
export async function deleteArtist(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.artists, db.tombstones, async () => {
    await db.artists.delete(id);
    await db.tombstones.put({ id, deletedAt: now });
  });
}

// 取得所有墓碑 ID
export async function getTombstones(): Promise<string[]> {
  const rows = await db.tombstones.toArray();
  return rows.map((r) => r.id);
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
      coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'math-rock',
      clusterPos: { x: 390, y: 520 },
      personalNotes: '吉他 Fender Twin Reverb 管機音色顆粒清脆，小鼓 Ghost Notes 極度動態，發燒測試片首選。',
      analysis: {
        genres: ['Math Rock', 'Instrumental Rock', 'Post-Rock'],
        summary: '2000 年成軍於日本東京的傳奇器樂搖滾/數學搖滾名團。由山嵜廣和（吉他）、美濃隆章（吉他）、山根敏史（貝斯）與柏倉隆史（鼓）四人組成。以細密繁複的點弦、動態龐大的鼓點切分以及無可挑剔的類比錄音品質聞名於世。',
        instrumentationNotes: '極低壓縮比的純淨錄音。柏倉隆史狂暴卻精確的軍鼓多節奏切分、美濃隆章空間系延遲以及 Fender 原聲吉他琴弦摩擦質地清晰可聞。',
        similarArtists: ['mouse on the keys', 'LITE', 'elephant gym', 'Tricot', 'Enemies'],
        notableAlbums: [
          {
            title: 'The Book About My Idle Plot on a Vague Anxiety',
            year: '2005',
            description: '數學搖滾界的不朽神作，收錄經典曲目《Lonely God》。展現無懈可擊的聲學層次與殘響控制。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=toe+The+Book+About+My+Idle+Plot'
          },
          {
            title: 'For Long Tomorrow',
            year: '2009',
            description: '融入木吉他、電鋼琴與客座人聲，錄音動態範圍極大，原聲樂器泛音綿密。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=toe+For+Long+Tomorrow'
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
      coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'ambient',
      clusterPos: { x: 550, y: 380 },
      personalNotes: '尼龍弦古典吉他與超近場人聲拾音，底噪極低，空氣感如同置身原木錄音室。',
      analysis: {
        genres: ['Ambient Folk', 'Acoustic Folk', 'Chamber Music'],
        summary: '日本當代氛圍民謠作曲家、吉他手兼歌手。善於利用空間自然混響與清澈透明的古典吉他指彈，建構如同水底世界般的沉浸聽覺場景。',
        instrumentationNotes: '單聲道與立體聲麥克風超微距收音，人聲喉音細節與吉他琴體共振被完整捕捉，高頻泛音延伸自然不刺耳。',
        similarArtists: ['Cornelius', '細野晴臣', 'Haruka Nakamura', 'Meitei'],
        notableAlbums: [
          {
            title: 'Windswept Adan (アダンの風)',
            year: '2020',
            description: '融合室內樂管弦樂與海洋音景的顛峰之作，發燒友空間定位必備試金石。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Ichiko+Aoba+Windswept+Adan'
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
      coverImage: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?auto=format&fit=crop&w=600&q=80',
      clusterCategory: 'jazz',
      clusterPos: { x: 230, y: 260 },
      personalNotes: '現場杯盤碰撞聲與空氣流動感歷歷在目，史考特·拉法羅低音提琴撥弦彈跳感無敵。',
      analysis: {
        genres: ['Modal Jazz', 'Cool Jazz', 'Piano Trio'],
        summary: '爵士鋼琴傳奇大師 Bill Evans 與天才貝斯手 Scott LaFaro、鼓手 Paul Motian 共同組成的歷史標竿三重奏。1961 年在 Village Vanguard 的現場錄音奠定了三方對等即興對話之典範。',
        instrumentationNotes: '三軌類比母帶極致還原。低音提琴高頻泛音與琴身木質共鳴深沉而飽滿，鼓刷在鈸片上的微弱沙沙聲精雕細琢。',
        similarArtists: ['Keith Jarrett', 'Brad Mehldau', 'Thelonious Monk', 'Miles Davis'],
        notableAlbums: [
          {
            title: 'Sunday at the Village Vanguard',
            year: '1961',
            description: '爵士史上最偉大的現場實況錄音之一，兼具文學氣質與聲學現場感。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Bill+Evans+Sunday+at+the+Village+Vanguard'
          },
          {
            title: 'Waltz for Debby',
            year: '1962',
            description: '發燒友試音神碟，琴鍵敲擊的瞬態反應與泛音無可取代。',
            appleMusicSearchUrl: 'https://music.apple.com/search?term=Bill+Evans+Waltz+for+Debby'
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
      clusterCategory: 'math-rock',
      clusterPos: { x: 260, y: 590 },
      personalNotes: '雙鋼琴與狂暴鼓點的幾何交織，低頻下潛厚重且速度感極佳。',
      analysis: {
        genres: ['Math Rock', 'Post-Rock', 'Jazz Fusion'],
        summary: '以雙鋼琴與爵士鼓為核心編制的日本前衛後搖/數學樂團。兼具極簡主義現代音樂之冷冽與後硬核節奏之狂熱爆發力。',
        instrumentationNotes: '雙鋼琴在立體聲場左右兩側精準分佈，琴槌重擊瞬態響應俐落，鼓點多節奏切分清晰可聞。',
        similarArtists: ['toe', 'fox capture plan', 'LITE', 'Jaga Jazzist'],
        notableAlbums: [
          {
            title: 'an anarchic alphabet',
            year: '2009',
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
