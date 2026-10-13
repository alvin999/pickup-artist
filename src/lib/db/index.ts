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

// 預設發燒友種子資料（初次使用時載入 toe 經典資料）
export async function seedInitialSampleIfEmpty(): Promise<void> {
  const count = await db.artists.count();
  if (count > 0) return;

  const now = Date.now();
  const toeSample: ArtistEntry = {
    id: 'toe-math-rock-master',
    name: 'toe',
    aliases: ['トー', 'Toe (Japan)'],
    appleMusicUrl: 'https://music.apple.com/search?term=toe',
    status: 'analyzed',
    addedAt: now,
    updatedAt: now,
    audiophileGrade: 'Reference',
    dynamicRange: 14,
    personalNotes: '吉他 Fender Twin Reverb 管機音色顆粒清脆，小鼓 Ghost Notes 極度動態，發燒測試片首選。',
    analysis: {
      genres: ['Math Rock', 'Post-Rock', 'Instrumental Rock'],
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
        },
        {
          title: 'NOW I SEE THE LIGHT',
          year: '2024',
          description: '相隔九年的全新錄音室長篇，維持一貫的高動態錄音室類比後製水準。',
          appleMusicSearchUrl: 'https://music.apple.com/search?term=toe+NOW+I+SEE+THE+LIGHT'
        }
      ]
    }
  };

  await db.artists.put(toeSample);
}
