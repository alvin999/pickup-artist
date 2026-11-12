import Dexie, { type Table } from 'dexie';
import type { ArtistEntry } from '$lib/types/artist';
import {
  buildAppleMusicSearchUrl,
  extractFromAppleMusicUrl,
  fetchAppleMusicMetadata,
  type ArtistCandidate
} from '$lib/utils/appleMusic';
import { fetchArtistPortrait } from '$lib/utils/artistImage';
import { listeningQueue, type ListeningQueueItem } from '$lib/services/listeningQueue';

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
 * 檢查目前瀏覽器是否處於連線狀態（保留供雲端同步或外部探索功能查詢）
 *
 * 設計意圖 (Why):
 * 本地資料庫寫入採 Local-First 原則，不再以 assertOnline() 阻擋離線新增/編輯，
 * 離線期間的變更會暫存於各雲端同步器的 pendingChanges，待連線恢復後自動 LWW 雙向合併。
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

// 快速拾音（支援自動查詢 Apple Music 高清封面，或直接套用使用者選定之候選藝人；離線時亦可直接寫入本機）
export async function quickPickupArtist(rawInput: string, candidate?: ArtistCandidate): Promise<ArtistEntry> {
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
  // 離線狀態下跳過遠端查詢以免卡頓，待恢復連線時由 autoHealArtistCovers 自動補齊封面
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;
  if (isOnline) {
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

export interface VaultBackupPayload {
  schema: 'pickup-artist-vault';
  version: 1 | 2;
  timestamp: number;
  exportedAt: string;
  artistsCount: number;
  artists: ArtistEntry[];
  tombstones: Tombstone[];
  listeningQueue?: ListeningQueueItem[];
}

/**
 * 封裝完整本機備份封包（包含藝人庫、刪除墓碑與聆賞隊列）
 */
export async function createVaultBackupPayload(): Promise<VaultBackupPayload> {
  const artists = await db.artists.toArray();
  const tombstones = await db.tombstones.toArray();
  const queueItems = listeningQueue.getItems();

  return {
    schema: 'pickup-artist-vault',
    version: 2,
    timestamp: Date.now(),
    exportedAt: new Date().toISOString(),
    artistsCount: artists.length,
    artists,
    tombstones,
    listeningQueue: queueItems
  };
}

/**
 * 匯入並以 Last-Write-Wins 時間戳雙向合併本機 JSON 備份檔
 * 相容新版 VaultBackupPayload 物件與舊版純 ArtistEntry[] 陣列格式
 */
export async function importVaultBackupJson(rawData: unknown): Promise<{
  totalCount: number;
  importedOrUpdatedCount: number;
  queueMergedCount: number;
}> {
  let incomingArtists: ArtistEntry[] = [];
  let incomingTombstones: Tombstone[] = [];
  let incomingQueue: ListeningQueueItem[] = [];

  if (Array.isArray(rawData)) {
    incomingArtists = rawData.filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.name === 'string');
  } else if (rawData && typeof rawData === 'object') {
    const obj = rawData as Partial<VaultBackupPayload>;
    if (Array.isArray(obj.artists)) {
      incomingArtists = obj.artists.filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.name === 'string');
    }
    if (Array.isArray(obj.tombstones)) {
      incomingTombstones = obj.tombstones.filter((t) => t && typeof t === 'object' && typeof t.id === 'string');
    }
    if (Array.isArray(obj.listeningQueue)) {
      incomingQueue = obj.listeningQueue;
    }
  } else {
    throw new Error('無效的備份檔案格式：請確認為 Pickup Artist JSON 備份檔。');
  }

  if (incomingArtists.length === 0 && incomingTombstones.length === 0 && incomingQueue.length === 0) {
    throw new Error('備份檔案中未包含有效的藝人資料或紀錄。');
  }

  let importedOrUpdatedCount = 0;

  await db.transaction('rw', db.artists, db.tombstones, async () => {
    const localArtists = await db.artists.toArray();
    const localTombstones = await db.tombstones.toArray();

    const localArtistMap = new Map(localArtists.map((a) => [a.id, a]));
    const localTombstoneMap = new Map(localTombstones.map((t) => [t.id, t]));

    for (const incArtist of incomingArtists) {
      const cleanArtist: ArtistEntry = JSON.parse(JSON.stringify(incArtist));
      const incTime = cleanArtist.updatedAt || cleanArtist.addedAt || 0;
      const localTomb = localTombstoneMap.get(cleanArtist.id);
      if (localTomb && localTomb.deletedAt > incTime) {
        continue;
      }

      const localArtist = localArtistMap.get(cleanArtist.id);
      if (!localArtist) {
        await db.artists.put(cleanArtist);
        await db.tombstones.delete(cleanArtist.id);
        importedOrUpdatedCount++;
      } else {
        const localTime = localArtist.updatedAt || localArtist.addedAt || 0;
        if (incTime > localTime) {
          await db.artists.put(cleanArtist);
          await db.tombstones.delete(cleanArtist.id);
          importedOrUpdatedCount++;
        }
      }
    }

    for (const incTomb of incomingTombstones) {
      const localArtist = localArtistMap.get(incTomb.id);
      if (localArtist) {
        const localTime = localArtist.updatedAt || localArtist.addedAt || 0;
        if (incTomb.deletedAt > localTime) {
          await db.artists.delete(incTomb.id);
          await db.tombstones.put(incTomb);
          importedOrUpdatedCount++;
        }
      } else {
        const localTomb = localTombstoneMap.get(incTomb.id);
        if (!localTomb || incTomb.deletedAt > localTomb.deletedAt) {
          await db.tombstones.put(incTomb);
        }
      }
    }
  });

  const queueMergedCount = listeningQueue.mergeItems(incomingQueue);
  const totalCount = await db.artists.count();

  notifyDatabaseChange({ type: 'batch', count: importedOrUpdatedCount });

  return {
    totalCount,
    importedOrUpdatedCount,
    queueMergedCount
  };
}


