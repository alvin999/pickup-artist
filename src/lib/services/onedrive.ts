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
 */
export async function getAccessToken(): Promise<string> {
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
  } catch {
    // 靜默獲取失敗（例如 Refresh Token 失效），改用 Popup 重新認證
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
 * 從 OneDrive 下載並還原資料庫（優先採用 1 次請求的 Gzip 壓縮快照）
 */
export async function restoreBackupFromOneDrive(): Promise<{ restoredCount: number; timestamp: number }> {
  isRestoring = true;
  try {
    let backupData: BackupDataStructure | null = null;

    // 1. 優先嘗試下載 Gzip 壓縮快照（僅 1 個 HTTP 請求，數千位藝人幾百 KB）
    const gzResponse = await downloadFromDrive(SNAPSHOT_GZ_NAME);
    if (gzResponse) {
      const gzBlob = await gzResponse.blob();
      const rawJson = await gzipDecompress(gzBlob);
      backupData = JSON.parse(rawJson);
    }

    // 2. 若無壓縮快照，回退讀取傳統未壓縮 JSON
    if (!backupData) {
      const jsonResponse = await downloadFromDrive(BACKUP_FILE_NAME);
      if (jsonResponse) {
        backupData = await jsonResponse.json();
      }
    }

    if (!backupData || !Array.isArray(backupData.artists)) {
      throw new Error('未在 OneDrive 找到有效備份檔案');
    }

    // 寫入本機 Dexie 資料庫（使用交易保障安全性）
    await db.transaction('rw', db.artists, db.tombstones, async () => {
      await db.artists.clear();
      await db.tombstones.clear();

      if (backupData.artists.length > 0) {
        await db.artists.bulkPut(backupData.artists);
      }
      if (backupData.tombstones && backupData.tombstones.length > 0) {
        await db.tombstones.bulkPut(backupData.tombstones);
      }
    });

    return {
      restoredCount: backupData.artists.length,
      timestamp: backupData.timestamp,
    };
  } finally {
    isRestoring = false;
  }
}

// ----------------------------------------------------
// 即時雲端同步管理器 (Auto-Sync Manager - 雙軌增量與快照整併)
// ----------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

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
    updateSyncState({
      status: 'error',
      errorMessage: err?.message || '即時同步至雲端失敗',
    });
  } finally {
    isSyncInProgress = false;
    if (pendingSyncAfterCurrent) {
      pendingSyncAfterCurrent = false;
      executeCloudSync();
    }
  }
}

/**
 * 系統啟動時若已登入微軟帳號，自動自雲端快照拉取資料（僅 1 次 HTTP 請求，數千筆瞬間載入）
 */
export async function syncFromCloudOnStartup(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!navigator.onLine) {
    updateSyncState({ status: 'offline', errorMessage: '離線狀態，無法載入雲端資料' });
    return false;
  }

  const account = await getActiveAccount();
  if (!account) return false;

  const meta = await getCloudBackupMetadata();
  if (!meta) {
    updateSyncState({ status: 'idle' });
    return false;
  }

  updateSyncState({ status: 'syncing', errorMessage: undefined });
  try {
    const result = await restoreBackupFromOneDrive();
    const now = Date.now();
    localStorage.setItem('pua_onedrive_last_sync', now.toString());
    updateSyncState({
      status: 'synced',
      lastSyncedAt: now,
      errorMessage: undefined,
    });
    return true;
  } catch (err: any) {
    console.warn('[OneDrive AutoSync] 啟動自動下載失敗:', err);
    updateSyncState({
      status: 'error',
      errorMessage: err?.message || '從雲端載入最新資料失敗',
    });
    return false;
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
