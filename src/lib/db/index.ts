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


