import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { db, onDatabaseChange } from '$lib/db';
import type { ArtistEntry } from '$lib/types/artist';
import type { Tombstone } from '$lib/db';

export const ONEDRIVE_CLIENT_ID =
  ((import.meta.env.PUBLIC_ONEDRIVE_CLIENT_ID || import.meta.env.VITE_ONEDRIVE_CLIENT_ID) as string) || '';

// 請求之權限範圍
export const GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite', 'offline_access'];

let msalInstance: PublicClientApplication | null = null;
let isInitialized = false;

/**
 * 清除 MSAL 殘留的 interaction 鎖定標記（徹底解決 interaction_in_progress 鎖死）
 */
export function clearMsalInteractionLocks(): void {
  if (typeof window === 'undefined') return;
  const storages = [window.localStorage, window.sessionStorage];
  for (const store of storages) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && (key.includes('interaction.status') || key.includes('interaction_in_progress'))) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        store.removeItem(k);
      }
    } catch {
      // 忽略特定安全性環境限制
    }
  }
}

/**
 * 取得或初始化 MSAL 客戶端實例
 */
export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (typeof window === 'undefined') {
    throw new Error('MSAL can only be initialized in the browser.');
  }

  if (!ONEDRIVE_CLIENT_ID) {
    throw new Error('缺少環境變數 PUBLIC_ONEDRIVE_CLIENT_ID，請確認專案 .env 設定。');
  }

  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: ONEDRIVE_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: `${window.location.origin}/auth.html`,
      },
      cache: {
        cacheLocation: 'localStorage',
      },
    });
  }

  if (!isInitialized) {
    await msalInstance.initialize();
    isInitialized = true;
  }

  return msalInstance;
}

/**
 * 取得目前已登入的微軟帳戶資訊
 */
export async function getActiveAccount(): Promise<AccountInfo | null> {
  if (!ONEDRIVE_CLIENT_ID) return null;
  const msal = await getMsalInstance();
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    return accounts[0];
  }
  return null;
}

/**
 * 透過彈出視窗（Popup）登入微軟帳號
 */
export async function loginToOneDrive(): Promise<AccountInfo> {
  const msal = await getMsalInstance();
  try {
    const loginResponse = await msal.loginPopup({
      scopes: GRAPH_SCOPES,
      prompt: 'select_account',
      redirectUri: `${window.location.origin}/auth.html`,
    });
    return loginResponse.account;
  } catch (err: any) {
    console.error('[OneDrive] Login failed:', err);
    if (err?.errorCode === 'interaction_in_progress' || err?.message?.includes('interaction_in_progress')) {
      clearMsalInteractionLocks();
      throw new Error('前次登入視窗未正常完成（已重置狀態鎖），請再點選一次重新登入。');
    }
    throw err;
  }
}

/**
 * 登出微軟帳號並清除本機快取
 */
export async function logoutOneDrive(): Promise<void> {
  const msal = await getMsalInstance();
  const account = await getActiveAccount();
  if (account) {
    await msal.logoutPopup({
      account,
      mainWindowRedirectUri: window.location.origin,
    });
  }
  localStorage.removeItem('pua_onedrive_last_sync');
}

/**
 * 取得有效的 Access Token（優先從快取靜默獲取，過期自動刷新）
 * @param allowInteractive 是否允許在過期時喚起 Popup 互動（僅在使用者手勢點擊情境下啟用，避免背景被瀏覽器攔截彈窗）
 */
export async function getAccessToken(allowInteractive = false): Promise<string> {
  const msal = await getMsalInstance();
  const account = await getActiveAccount();

  if (!account) {
    throw new Error('請先登入微軟帳戶');
  }

  try {
    const tokenResponse = await msal.acquireTokenSilent({
      account,
      scopes: GRAPH_SCOPES,
    });
    return tokenResponse.accessToken;
  } catch (err: any) {
    // 若在背景或自動同步環境，靜默獲取失敗切勿呼叫 popup，避免遭瀏覽器封鎖彈窗
    if (!allowInteractive) {
      updateSyncState({
        status: 'session_expired',
        errorMessage: '微軟帳戶登入已過期，請重新驗證以繼續同步。',
      });
      throw new Error('SESSION_EXPIRED');
    }

    // 手動操作時才允許彈窗交互
    const tokenResponse = await msal.acquireTokenPopup({
      account,
      scopes: GRAPH_SCOPES,
    });
    return tokenResponse.accessToken;
  }
}

export interface BackupDataStructure {
  schema: 'pickup-artist-vault';
  version: 1 | 2;
  timestamp: number;
  exportedAt: string;
  artistsCount: number;
  artists: ArtistEntry[];
  tombstones: Tombstone[];
}

export interface CloudMetadata {
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl?: string;
}

const BACKUP_FILE_NAME = 'pickup_artist_vault.json';
const SNAPSHOT_GZ_NAME = 'vault_snapshot.json.gz';
const CHANGES_DIR = 'changes';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * 瀏覽器原生 Gzip 壓縮（大幅縮減 80%~90% JSON 體積）
 */
export async function gzipCompress(text: string): Promise<Blob> {
  const stream = new Blob([text], { type: 'application/json' }).stream();
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  return await new Response(compressed).blob();
}

/**
 * 瀏覽器原生 Gzip 解壓縮
 */
export async function gzipDecompress(blob: Blob): Promise<string> {
  const stream = blob.stream();
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(decompressed).text();
}

/**
 * 通用 OneDrive 檔案上傳工具（優先 special/approot，自動回退 root:/PickupArtist）
 */
async function uploadToDrive(path: string, body: Blob | string, contentType = 'application/json'): Promise<{ size: number }> {
  const token = await getAccessToken();
  const blob = typeof body === 'string' ? new Blob([body], { type: contentType }) : body;

  let uploadUrl = `${GRAPH_API_BASE}/me/drive/special/approot:/${path}:/content`;
  let response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!response.ok) {
    uploadUrl = `${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${path}:/content`;
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: blob,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OneDrive 上傳 [${path}] 失敗 (${response.status}): ${errText}`);
    }
  }

  const result = await response.json();
  return { size: result.size || blob.size };
}

/**
 * 通用 OneDrive 檔案下載工具
 */
async function downloadFromDrive(path: string): Promise<Response | null> {
  const token = await getAccessToken();
  let downloadUrl = `${GRAPH_API_BASE}/me/drive/special/approot:/${path}:/content`;
  let response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    downloadUrl = `${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${path}:/content`;
    response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return response.ok ? response : null;
}

interface DriveChildItem {
  id: string;
  name: string;
  size?: number;
  downloadUrl?: string;
}

/**
 * 取得 OneDrive 特定資料夾下的子項目清單
 */
async function getChildrenFromDrive(folderPath: string): Promise<DriveChildItem[]> {
  try {
    const token = await getAccessToken();
    let url = `${GRAPH_API_BASE}/me/drive/special/approot:/${folderPath}:/children`;
    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      url = `${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${folderPath}:/children`;
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.value)) {
      return [];
    }

    return data.value.map((item: any) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
    }));
  } catch (err) {
    console.warn(`[OneDrive] 取得目錄 [${folderPath}] 清單失敗:`, err);
    return [];
  }
}

/**
 * 刪除指定的 OneDrive 檔案項目
 */
async function deleteDriveItem(itemId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${GRAPH_API_BASE}/me/drive/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn(`[OneDrive] 刪除項目 [${itemId}] 失敗:`, err);
  }
}

type CloudChangeEntry =
  | {
      itemId: string;
      type: 'upsert';
      artistId: string;
      artist: ArtistEntry;
    }
  | {
      itemId: string;
      type: 'delete';
      artistId: string;
      deletedAt: number;
    };

/**
 * 獲取並解析 changes/ 目錄中的所有增量變更記錄
 */
async function fetchCloudChanges(): Promise<CloudChangeEntry[]> {
  const children = await getChildrenFromDrive(CHANGES_DIR);
  if (children.length === 0) return [];

  const changePromises: Promise<CloudChangeEntry | null>[] = children.map(async (child): Promise<CloudChangeEntry | null> => {
    try {
      let text = '';
      if (child.downloadUrl) {
        const res = await fetch(child.downloadUrl);
        if (res.ok) text = await res.text();
      }
      if (!text) {
        const res = await downloadFromDrive(`${CHANGES_DIR}/${child.name}`);
        if (res && res.ok) text = await res.text();
      }
      if (!text) return null;

      const json = JSON.parse(text);
      if (child.name.startsWith('tombstone_') && child.name.endsWith('.json')) {
        const artistId = child.name.replace(/^tombstone_/, '').replace(/\.json$/, '');
        return {
          itemId: child.id,
          type: 'delete' as const,
          artistId,
          deletedAt: json.deletedAt || Date.now(),
        };
      } else if (child.name.endsWith('.json')) {
        return {
          itemId: child.id,
          type: 'upsert' as const,
          artistId: json.id,
          artist: json as ArtistEntry,
        };
      }
      return null;
    } catch (err) {
      console.warn(`[OneDrive] 解析增量檔案 [${child.name}] 失敗:`, err);
      return null;
    }
  });

  const results = await Promise.all(changePromises);
  return results.filter((r): r is CloudChangeEntry => r !== null);
}

/**
 * 背景清理 changes/ 資料夾中的過期檔案
 */
async function clearCloudChangesInBackground(): Promise<void> {
  try {
    const children = await getChildrenFromDrive(CHANGES_DIR);
    for (const child of children) {
      await deleteDriveItem(child.id);
    }
  } catch (err) {
    console.warn('[OneDrive] 背景清理 changes 資料夾失敗:', err);
  }
}

export interface CombinedCloudData {
  artists: ArtistEntry[];
  tombstones: Tombstone[];
  timestamp: number;
  changesCount: number;
  unchanged?: boolean;
}

export const SNAPSHOT_MTIME_KEY = 'pua_onedrive_snapshot_mtime';

/**
 * 載入雲端最新完整狀態（基底快照 + 疊加 changes/ 最新增量）
 * 支援「快照未變更時跳過下載」的極致流量優化
 */
async function loadCombinedCloudData(options?: { forceFullSnapshot?: boolean }): Promise<CombinedCloudData | null> {
  const forceFull = options?.forceFullSnapshot ?? false;

  // 1. 查詢雲端快照的元數據（Metadata，僅消耗幾百 bytes）
  const meta = await getCloudBackupMetadata();
  const cachedMtime = typeof localStorage !== 'undefined' ? localStorage.getItem(SNAPSHOT_MTIME_KEY) : null;
  const localArtistsCount = await db.artists.count();

  // 判斷是否可跳過全量快照下載：
  // 條件：非強制還原 + 本機已有資料 + 雲端快照修改時間與上次記錄一致
  const canSkipSnapshot =
    !forceFull &&
    localArtistsCount > 0 &&
    Boolean(meta && cachedMtime && meta.lastModifiedDateTime === cachedMtime);

  let backupData: BackupDataStructure | null = null;

  if (!canSkipSnapshot) {
    // 1-A. 優先嘗試下載 Gzip 壓縮快照
    const gzResponse = await downloadFromDrive(SNAPSHOT_GZ_NAME);
    if (gzResponse) {
      try {
        const gzBlob = await gzResponse.blob();
        const rawJson = await gzipDecompress(gzBlob);
        backupData = JSON.parse(rawJson);
      } catch (e) {
        console.warn('[OneDrive] 快照解壓縮 JSON 解析失敗:', e);
      }
    }

    // 1-B. 若無壓縮快照，回退讀取傳統未壓縮 JSON
    if (!backupData) {
      const jsonResponse = await downloadFromDrive(BACKUP_FILE_NAME);
      if (jsonResponse) {
        try {
          backupData = await jsonResponse.json();
        } catch (e) {
          console.warn('[OneDrive] 傳統備份 JSON 解析失敗:', e);
        }
      }
    }

    // 下載成功後，更新本地快照修改時間快取
    if (meta?.lastModifiedDateTime && typeof localStorage !== 'undefined') {
      localStorage.setItem(SNAPSHOT_MTIME_KEY, meta.lastModifiedDateTime);
    }
  }

  // 2. 抓取 changes/ 增量檔案
  const changes = await fetchCloudChanges();

  // 若快照跳過了，且雲端 changes/ 也完全沒有檔案 ➔ 代表兩端完全同步，零下載
  if (canSkipSnapshot && changes.length === 0) {
    const localArtists = await db.artists.toArray();
    const localTombstones = await db.tombstones.toArray();
    return {
      artists: localArtists,
      tombstones: localTombstones,
      timestamp: Date.now(),
      changesCount: 0,
      unchanged: true,
    };
  }

  // 若快照未跳過，但既無快照也無增量 ➔ 雲端完全無備份
  if (!canSkipSnapshot && !backupData && changes.length === 0) {
    return null;
  }

  const artistsMap = new Map<string, ArtistEntry>();
  const tombstonesMap = new Map<string, Tombstone>();

  if (canSkipSnapshot) {
    // 快照跳過時，基底直接採用本機現有資料庫
    const localArtists = await db.artists.toArray();
    const localTombstones = await db.tombstones.toArray();
    for (const a of localArtists) artistsMap.set(a.id, a);
    for (const t of localTombstones) tombstonesMap.set(t.id, t);
  } else {
    // 採用剛下載的雲端快照作為基底
    if (backupData?.artists) {
      for (const a of backupData.artists) {
        artistsMap.set(a.id, a);
      }
    }
    if (backupData?.tombstones) {
      for (const t of backupData.tombstones) {
        tombstonesMap.set(t.id, t);
      }
    }
  }

  // 疊加 changes/ 最新增量
  for (const change of changes) {
    if (change.type === 'upsert' && change.artist) {
      artistsMap.set(change.artist.id, change.artist);
      tombstonesMap.delete(change.artist.id);
    } else if (change.type === 'delete') {
      artistsMap.delete(change.artistId);
      tombstonesMap.set(change.artistId, { id: change.artistId, deletedAt: change.deletedAt || Date.now() });
    }
  }

  return {
    artists: Array.from(artistsMap.values()),
    tombstones: Array.from(tombstonesMap.values()),
    timestamp: backupData?.timestamp || Date.now(),
    changesCount: changes.length,
    unchanged: false,
  };
}

/**
 * 產生並上傳全量壓縮快照 (Snapshot Compaction)
 */
export async function uploadBackupToOneDrive(): Promise<{ timestamp: number; size: number }> {
  const artists = await db.artists.toArray();
  const tombstones = await db.tombstones.toArray();

  const backupData: BackupDataStructure = {
    schema: 'pickup-artist-vault',
    version: 2,
    timestamp: Date.now(),
    exportedAt: new Date().toISOString(),
    artistsCount: artists.length,
    artists,
    tombstones,
  };

  const jsonContent = JSON.stringify(backupData);
  // 使用 Gzip 壓縮快照
  const compressedGzipBlob = await gzipCompress(jsonContent);

  // 1. 上傳高效壓縮快照（數千位藝人僅數百 KB）
  const result = await uploadToDrive(SNAPSHOT_GZ_NAME, compressedGzipBlob, 'application/gzip');

  // 2. 備份純 JSON 相容檔（供手動匯出或舊系統讀取）
  try {
    await uploadToDrive(BACKUP_FILE_NAME, jsonContent, 'application/json');
  } catch (e) {
    console.warn('[OneDrive] 相容 JSON 備份跳過:', e);
  }

  const now = Date.now();
  localStorage.setItem('pua_onedrive_last_sync', now.toString());
  // 異步更新本地快照修改時間戳，避免下一次同步把自己剛上傳的快照重複下載
  getCloudBackupMetadata()
    .then((m) => {
      if (m?.lastModifiedDateTime && typeof localStorage !== 'undefined') {
        localStorage.setItem(SNAPSHOT_MTIME_KEY, m.lastModifiedDateTime);
      }
    })
    .catch(() => {});

  return {
    timestamp: now,
    size: result.size,
  };
}

/**
 * 查詢雲端備份的檔案資訊 (Metadata)
 */
export async function getCloudBackupMetadata(): Promise<CloudMetadata | null> {
  const account = await getActiveAccount();
  if (!account) return null;

  try {
    const token = await getAccessToken();

    // 優先查壓縮快照
    let res = await fetch(`${GRAPH_API_BASE}/me/drive/special/approot:/${SNAPSHOT_GZ_NAME}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      res = await fetch(`${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${SNAPSHOT_GZ_NAME}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // 若無快照則查詢舊版 JSON
    if (!res.ok) {
      res = await fetch(`${GRAPH_API_BASE}/me/drive/special/approot:/${BACKUP_FILE_NAME}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        res = await fetch(`${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${BACKUP_FILE_NAME}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return {
      name: data.name,
      size: data.size,
      lastModifiedDateTime: data.lastModifiedDateTime,
      webUrl: data.webUrl,
    };
  } catch (err) {
    console.warn('[OneDrive] Failed to check cloud backup metadata:', err);
    return null;
  }
}

let isRestoring = false;

/**
 * 從 OneDrive 下載並還原資料庫（結合 Gzip 壓縮快照與 changes/ 增量）
 */
export async function restoreBackupFromOneDrive(): Promise<{ restoredCount: number; timestamp: number }> {
  isRestoring = true;
  try {
    const cloudData = await loadCombinedCloudData({ forceFullSnapshot: true });
    if (!cloudData) {
      throw new Error('未在 OneDrive 找到有效備份檔案或增量紀錄');
    }

    // 寫入本機 Dexie 資料庫（使用交易保障安全性）
    await db.transaction('rw', db.artists, db.tombstones, async () => {
      await db.artists.clear();
      await db.tombstones.clear();

      if (cloudData.artists.length > 0) {
        await db.artists.bulkPut(cloudData.artists);
      }
      if (cloudData.tombstones.length > 0) {
        await db.tombstones.bulkPut(cloudData.tombstones);
      }
    });

    return {
      restoredCount: cloudData.artists.length,
      timestamp: cloudData.timestamp,
    };
  } finally {
    isRestoring = false;
  }
}

// ----------------------------------------------------
// 即時雲端同步管理器 (Auto-Sync Manager - 雙軌增量與快照整併)
// ----------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'session_expired';

export interface CloudSyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  errorMessage?: string;
}

type StatusListener = (state: CloudSyncState) => void;
const listeners = new Set<StatusListener>();

let currentSyncState: CloudSyncState = {
  status: 'idle',
  lastSyncedAt: typeof localStorage !== 'undefined' ? Number(localStorage.getItem('pua_onedrive_last_sync')) || null : null,
};

export function getSyncState(): CloudSyncState {
  return currentSyncState;
}

export function subscribeSyncState(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(currentSyncState);
  return () => {
    listeners.delete(listener);
  };
}

function updateSyncState(patch: Partial<CloudSyncState>) {
  currentSyncState = { ...currentSyncState, ...patch };
  listeners.forEach((l) => {
    try {
      l(currentSyncState);
    } catch (e) {
      console.warn('[OneDrive AutoSync] Listener error:', e);
    }
  });
}

// 增量變更緩衝隊列
const pendingChanges = new Map<string, { type: 'upsert' | 'delete'; artist?: ArtistEntry; id: string }>();
let needsFullCompaction = false;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncInProgress = false;
let pendingSyncAfterCurrent = false;

/**
 * 觸發即時雲端同步（內建 1.5 秒防抖排程與雙軌處理）
 */
export function triggerAutoCloudSync(delayMs = 1500): void {
  if (typeof window === 'undefined' || isRestoring) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // 離線防呆檢查
  if (!navigator.onLine) {
    updateSyncState({ status: 'offline', errorMessage: '網路已斷線，無法同步至雲端' });
    return;
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await executeCloudSync();
  }, delayMs);
}

/**
 * 執行上傳同步任務（增量優先，累積滿 10 筆或批次異動時自動整併為 Gzip 快照）
 */
async function executeCloudSync(): Promise<void> {
  const account = await getActiveAccount();
  if (!account) {
    return;
  }

  if (isSyncInProgress) {
    pendingSyncAfterCurrent = true;
    return;
  }

  isSyncInProgress = true;
  updateSyncState({ status: 'syncing', errorMessage: undefined });

  try {
    const queue = Array.from(pendingChanges.values());

    // 若無變更且不需要壓實快照，則直接標記為已同步
    if (queue.length === 0 && !needsFullCompaction) {
      updateSyncState({ status: 'synced' });
      return;
    }

    // 情況 A：異動超過 10 筆，或是批次異動，或是尚未建立全量快照 ➔ 執行 Gzip 快照整併 (Compaction)
    if (needsFullCompaction || queue.length >= 10) {
      const res = await uploadBackupToOneDrive();
      pendingChanges.clear();
      needsFullCompaction = false;
      updateSyncState({
        status: 'synced',
        lastSyncedAt: res.timestamp,
        errorMessage: undefined,
      });
      // 整併後非同步清理 changes/ 零散檔案
      clearCloudChangesInBackground();
    } else {
      // 情況 B：微量異動（1~9 筆） ➔ 單筆增量部分更新（每筆僅 2 KB）
      for (const item of queue) {
        if (item.type === 'upsert' && item.artist) {
          const itemJson = JSON.stringify(item.artist);
          await uploadToDrive(`${CHANGES_DIR}/${item.artist.id}.json`, itemJson);
        } else if (item.type === 'delete') {
          // 寫入墓碑標記
          const tombstoneJson = JSON.stringify({ id: item.id, deletedAt: Date.now() });
          await uploadToDrive(`${CHANGES_DIR}/tombstone_${item.id}.json`, tombstoneJson);
        }
      }

      pendingChanges.clear();
      const now = Date.now();
      localStorage.setItem('pua_onedrive_last_sync', now.toString());
      updateSyncState({
        status: 'synced',
        lastSyncedAt: now,
        errorMessage: undefined,
      });
    }
  } catch (err: any) {
    console.error('[OneDrive AutoSync] 同步上傳失敗:', err);
    if (err?.message === 'SESSION_EXPIRED' || err?.name === 'InteractionRequiredAuthError') {
      updateSyncState({
        status: 'session_expired',
        errorMessage: '微軟帳戶登入已過期，請重新驗證以繼續同步。',
      });
    } else {
      updateSyncState({
        status: 'error',
        errorMessage: err?.message || '即時同步至雲端失敗',
      });
    }
  } finally {
    isSyncInProgress = false;
    if (pendingSyncAfterCurrent) {
      pendingSyncAfterCurrent = false;
      executeCloudSync();
    }
  }
}

/**
 * 系統啟動時若已登入微軟帳號，自雲端載入快照與增量並與本機資料庫進行雙向時間戳合併 (LWW)
 * 確保本機剛新增的資料絕對不被抹殺，並同步雲端最新狀態
 */
export async function syncFromCloudOnStartup(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!navigator.onLine) {
    updateSyncState({ status: 'offline', errorMessage: '離線狀態，無法載入雲端資料' });
    return false;
  }

  const account = await getActiveAccount();
  if (!account) return false;

  updateSyncState({ status: 'syncing', errorMessage: undefined });
  isRestoring = true;

  try {
    const cloudData = await loadCombinedCloudData();
    if (!cloudData) {
      // 雲端尚無備份檔案，若本機已有資料，自動建立初始快照備份
      const localCount = await db.artists.count();
      if (localCount > 0) {
        await uploadBackupToOneDrive();
      }
      updateSyncState({ status: 'idle' });
      return false;
    }

    // 若雲端快照未變更且無新增量，本機已是最新狀態，達成 0 KB 傳輸與 0 毫秒資料庫重寫
    if (cloudData.unchanged) {
      const now = Date.now();
      localStorage.setItem('pua_onedrive_last_sync', now.toString());
      updateSyncState({
        status: 'synced',
        lastSyncedAt: now,
        errorMessage: undefined,
      });
      return false;
    }

    const localArtists = await db.artists.toArray();
    const localTombstones = await db.tombstones.toArray();

    const localArtistsMap = new Map(localArtists.map((a) => [a.id, a]));
    const localTombstonesMap = new Map(localTombstones.map((t) => [t.id, t]));

    const cloudArtistsMap = new Map(cloudData.artists.map((a) => [a.id, a]));
    const cloudTombstonesMap = new Map(cloudData.tombstones.map((t) => [t.id, t]));

    // 1. 合併墓碑（取較新的刪除時間戳）
    const mergedTombstonesMap = new Map<string, Tombstone>();
    for (const [id, t] of localTombstonesMap) mergedTombstonesMap.set(id, t);
    for (const [id, t] of cloudTombstonesMap) {
      const existing = mergedTombstonesMap.get(id);
      if (!existing || t.deletedAt > existing.deletedAt) {
        mergedTombstonesMap.set(id, t);
      }
    }

    // 2. 雙向合併藝人（Last-Write-Wins 時間戳競態解決）
    const allIds = new Set([...localArtistsMap.keys(), ...cloudArtistsMap.keys()]);
    const finalArtists: ArtistEntry[] = [];
    let localHasNewerData = false;

    for (const id of allIds) {
      const local = localArtistsMap.get(id);
      const cloud = cloudArtistsMap.get(id);
      const tombstone = mergedTombstonesMap.get(id);

      // 若有墓碑且刪除時間晚於最後更新時間，予以過濾排除
      const latestUpdate = Math.max(local?.updatedAt || 0, cloud?.updatedAt || 0);
      if (tombstone && tombstone.deletedAt >= latestUpdate) {
        continue;
      }

      if (local && cloud) {
        if (local.updatedAt >= cloud.updatedAt) {
          finalArtists.push(local);
          if (local.updatedAt > cloud.updatedAt) localHasNewerData = true;
        } else {
          finalArtists.push(cloud);
        }
      } else if (local && !cloud) {
        // 本機新增的藝人：完好保留，不被雲端抹殺！
        finalArtists.push(local);
        localHasNewerData = true;
      } else if (cloud && !local) {
        // 雲端新增的藝人：收錄進本機
        finalArtists.push(cloud);
      }
    }

    const finalTombstones = Array.from(mergedTombstonesMap.values());

    // 寫入本機 Dexie 資料庫
    await db.transaction('rw', db.artists, db.tombstones, async () => {
      await db.artists.clear();
      await db.tombstones.clear();

      if (finalArtists.length > 0) {
        await db.artists.bulkPut(finalArtists);
      }
      if (finalTombstones.length > 0) {
        await db.tombstones.bulkPut(finalTombstones);
      }
    });

    const now = Date.now();
    localStorage.setItem('pua_onedrive_last_sync', now.toString());
    updateSyncState({
      status: 'synced',
      lastSyncedAt: now,
      errorMessage: undefined,
    });

    // 若本機有較新的未上傳資料，或雲端累積增量超過 10 筆，背景觸發快照整併
    if (localHasNewerData || cloudData.changesCount >= 10) {
      setTimeout(async () => {
        try {
          await uploadBackupToOneDrive();
          await clearCloudChangesInBackground();
        } catch (e) {
          console.warn('[OneDrive AutoSync] 背景整併快照失敗:', e);
        }
      }, 1000);
    }

    return true;
  } catch (err: any) {
    console.warn('[OneDrive AutoSync] 啟動自動同步失敗:', err);
    if (err?.message === 'SESSION_EXPIRED' || err?.name === 'InteractionRequiredAuthError') {
      updateSyncState({
        status: 'session_expired',
        errorMessage: '微軟帳戶授權已過期，請點擊重新驗證以同步雲端資料。',
      });
    } else {
      updateSyncState({
        status: 'error',
        errorMessage: err?.message || '從雲端載入最新資料失敗',
      });
    }
    return false;
  } finally {
    isRestoring = false;
  }
}

/**
 * 重新授權並自動同步雲端資料庫（一鍵修復 session 過期，無需手動重新整理）
 * @param onSuccess 成功後的回呼函式（例如重新載入藝人列表 reloadArtists）
 */
export async function reauthenticateAndSync(onSuccess?: () => Promise<void>): Promise<boolean> {
  clearMsalInteractionLocks();
  try {
    await loginToOneDrive();
    updateSyncState({ status: 'syncing', errorMessage: undefined });

    // 執行雲端雙向合併
    const restored = await syncFromCloudOnStartup();

    // 若有斷線期間累積的本機異動，接續上傳至雲端
    if (pendingChanges.size > 0 || needsFullCompaction) {
      executeCloudSync();
    }

    if (onSuccess) {
      await onSuccess();
    }
    return true;
  } catch (err: any) {
    console.error('[OneDrive] 重新授權與同步失敗:', err);
    if (err?.errorCode === 'user_cancelled') {
      updateSyncState({ status: 'session_expired', errorMessage: '使用者已取消登入驗證' });
    } else {
      updateSyncState({ status: 'error', errorMessage: err?.message || '重新驗證失敗' });
    }
    throw err;
  }
}

// ----------------------------------------------------
// 全域監聽：接收資料庫細緻變更事件並自動觸發同步
// ----------------------------------------------------
if (typeof window !== 'undefined') {
  onDatabaseChange((event) => {
    if (!event) {
      needsFullCompaction = true;
    } else if (event.type === 'upsert') {
      pendingChanges.set(event.artist.id, { type: 'upsert', artist: event.artist, id: event.artist.id });
    } else if (event.type === 'delete') {
      pendingChanges.set(event.id, { type: 'delete', id: event.id });
    } else if (event.type === 'batch') {
      needsFullCompaction = true;
    }
    triggerAutoCloudSync();
  });

  window.addEventListener('online', () => {
    updateSyncState({ status: 'idle', errorMessage: undefined });
    triggerAutoCloudSync(500);
  });

  window.addEventListener('offline', () => {
    updateSyncState({ status: 'offline', errorMessage: '網路已斷線，無法同步至雲端' });
  });
}
