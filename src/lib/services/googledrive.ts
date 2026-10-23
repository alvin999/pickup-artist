/**
 * Google Drive 整合服務模組
 * 採用 Google Identity Services (GIS) 與 Google Drive REST API v3
 * 專屬儲存空間：appDataFolder (Application Data 專用隱藏沙盒資料夾)
 * 支援：Gzip 壓縮全量快照、changes_ 增量更新、雙向時間戳衝突解決 (Last-Write-Wins)
 */

import { db, onDatabaseChange, type Tombstone } from '$lib/db';
import type { ArtistEntry } from '$lib/types/artist';

export const GOOGLE_CLIENT_ID =
  ((import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID) as string) || '';

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const TOKEN_KEY = 'pua_gdrive_access_token';
const EXPIRES_KEY = 'pua_gdrive_token_expires';
const USERINFO_KEY = 'pua_gdrive_user_info';
const LAST_SYNC_KEY = 'pua_gdrive_last_sync';
const SNAPSHOT_MTIME_KEY = 'pua_gdrive_snapshot_mtime';

export const BACKUP_FILE_NAME = 'pickup_artist_vault.json';
export const SNAPSHOT_GZ_NAME = 'vault_snapshot.json.gz';
export const CHANGES_PREFIX = 'change_';

export interface GoogleUserInfo {
  name: string;
  email: string;
  picture?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleDriveMetadata {
  id: string;
  name: string;
  size?: number;
  modifiedTime?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'session_expired';

export interface GoogleDriveSyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  errorMessage?: string;
  connectedAccount?: GoogleUserInfo | null;
}

// ----------------------------------------------------
// 瀏覽器原生 Gzip 壓縮 / 解壓縮
// ----------------------------------------------------
export async function gzipCompress(text: string): Promise<Blob> {
  const stream = new Blob([text], { type: 'application/json' }).stream();
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  return await new Response(compressed).blob();
}

export async function gzipDecompress(blob: Blob): Promise<string> {
  const stream = blob.stream();
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(decompressed).text();
}

// ----------------------------------------------------
// GIS 身分認證與 Token 管理
// ----------------------------------------------------
let tokenClient: any = null;

function waitForGoogleScript(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Google Drive 服務僅支援瀏覽器端。'));
    }

    if (window.google?.accounts?.oauth2) {
      return resolve();
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Google Identity Services 腳本載入逾時，請確認網路連線是否正常。'));
      }
    }, 100);
  });
}

export function getStoredGoogleToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY)) || 0;
  if (token && expiresAt > Date.now() + 120 * 1000) {
    return token;
  }
  return null;
}

export function getStoredGoogleUserInfo(): GoogleUserInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USERINFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loginToGoogleDrive(): Promise<{ token: string; user: GoogleUserInfo; grantedScope: string }> {
  await waitForGoogleScript();

  if (!GOOGLE_CLIENT_ID) {
    throw new Error('缺少環境變數 PUBLIC_GOOGLE_CLIENT_ID，請確認 .env 設定。');
  }

  return new Promise((resolve, reject) => {
    try {
      tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: `${DRIVE_APPDATA_SCOPE} https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`,
        prompt: 'consent',
        callback: async (resp) => {
          if (resp.error) {
            return reject(new Error(`Google 登入失敗: ${resp.error}`));
          }
          if (!resp.access_token) {
            return reject(new Error('未能取得 Google 存取憑證 (Access Token)'));
          }

          const token = resp.access_token;
          const grantedScope = resp.scope || '';
          console.log('[GoogleDrive] Granted scopes:', grantedScope);
          const expiresInSec = resp.expires_in || 3600;
          const expiresAt = Date.now() + expiresInSec * 1000;

          localStorage.setItem(TOKEN_KEY, token);
          localStorage.setItem(EXPIRES_KEY, expiresAt.toString());

          try {
            const user = await fetchGoogleUserInfo(token);
            localStorage.setItem(USERINFO_KEY, JSON.stringify(user));
            updateSyncState({ connectedAccount: user, status: 'synced', errorMessage: undefined });
            resolve({ token, user, grantedScope });
          } catch (e: any) {
            console.warn('[GoogleDrive] 取得使用者資訊失敗，繼續執行:', e);
            const fallbackUser = { name: 'Google 使用者', email: '' };
            updateSyncState({ connectedAccount: fallbackUser, status: 'synced', errorMessage: undefined });
            resolve({ token, user: fallbackUser, grantedScope });
          }
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Google 授權視窗已被關閉或發生錯誤'));
        }
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(new Error(`初始化 Google 認證客戶端失敗: ${err.message}`));
    }
  });
}

export async function fetchGoogleUserInfo(token: string): Promise<GoogleUserInfo> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    throw new Error(`取得 Google 使用者資訊失敗 (${resp.status})`);
  }
  const data = await resp.json();
  return {
    name: data.name || data.email,
    email: data.email,
    picture: data.picture
  };
}

export async function logoutGoogleDrive(): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      await new Promise<void>((r) => window.google!.accounts.oauth2.revoke(token, () => r()));
    } catch (err) {
      console.warn('[GoogleDrive] 撤銷 Token 警告:', err);
    }
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(USERINFO_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(SNAPSHOT_MTIME_KEY);
  updateSyncState({
    connectedAccount: null,
    status: 'idle',
    lastSyncedAt: null,
    errorMessage: undefined
  });
}

async function getOrRequireValidToken(): Promise<string> {
  const token = getStoredGoogleToken();
  if (token) return token;
  const res = await loginToGoogleDrive();
  return res.token;
}

// ----------------------------------------------------
// Google Drive AppData Folder 基礎 API 操作
// ----------------------------------------------------
export async function listGoogleDriveAppDataFiles(): Promise<DriveFileItem[]> {
  const token = await getOrRequireValidToken();
  const url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=100';

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Drive 列出檔案失敗 (${resp.status}): ${errText}`);
  }

  const json = await resp.json();
  return json.files || [];
}

export async function findGoogleDriveFileByName(fileName: string): Promise<DriveFileItem | null> {
  const token = await getOrRequireValidToken();
  const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,mimeType,modifiedTime,size)`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Drive 查詢檔案失敗 (${resp.status}): ${errText}`);
  }

  const json = await resp.json();
  const files: DriveFileItem[] = json.files || [];
  return files.length > 0 ? files[0] : null;
}

export async function uploadFileToGoogleDrive(
  fileName: string,
  content: string | Uint8Array | Blob,
  mimeType = 'application/json'
): Promise<{ fileId: string; name: string }> {
  const token = await getOrRequireValidToken();
  const existing = await findGoogleDriveFileByName(fileName);
  const fileBlob = content instanceof Blob ? content : new Blob([content as any], { type: mimeType });

  if (existing) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType
      },
      body: fileBlob
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google Drive 覆寫檔案失敗 (${resp.status}): ${errText}`);
    }

    return { fileId: existing.id, name: fileName };
  } else {
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: ['appDataFolder']
    };

    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' });

    const multipartBody = new Blob(
      [
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        metadataBlob,
        delimiter,
        `Content-Type: ${mimeType}\r\n\r\n`,
        fileBlob,
        closeDelimiter
      ],
      { type: `multipart/related; boundary=${boundary}` }
    );

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google Drive 上傳檔案失敗 (${resp.status}): ${errText}`);
    }

    const json = await resp.json();
    return { fileId: json.id, name: fileName };
  }
}

export async function downloadFileFromGoogleDrive(fileName: string): Promise<string | null> {
  const token = await getOrRequireValidToken();
  const file = await findGoogleDriveFileByName(fileName);
  if (!file) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Drive 下載檔案失敗 (${resp.status}): ${errText}`);
  }

  return await resp.text();
}

export async function downloadBlobFromGoogleDrive(fileName: string): Promise<Blob | null> {
  const token = await getOrRequireValidToken();
  const file = await findGoogleDriveFileByName(fileName);
  if (!file) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google Drive 下載 Blob 失敗 (${resp.status}): ${errText}`);
  }

  return await resp.blob();
}

export async function deleteFileFromGoogleDrive(fileId: string): Promise<void> {
  const token = await getOrRequireValidToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok && resp.status !== 404) {
    const errText = await resp.text();
    throw new Error(`Google Drive 刪除檔案失敗 (${resp.status}): ${errText}`);
  }
}

// ----------------------------------------------------
// Google Drive 完整備份、增量與雙向還原
// ----------------------------------------------------
export interface BackupDataStructure {
  schema: 'pickup-artist-vault';
  version: 1 | 2;
  timestamp: number;
  exportedAt: string;
  artistsCount: number;
  artists: ArtistEntry[];
  tombstones: Tombstone[];
}

export async function getGoogleDriveBackupMetadata(): Promise<GoogleDriveMetadata | null> {
  const token = getStoredGoogleToken();
  if (!token) return null;

  try {
    const gz = await findGoogleDriveFileByName(SNAPSHOT_GZ_NAME);
    if (gz) {
      return {
        id: gz.id,
        name: gz.name,
        size: gz.size ? Number(gz.size) : undefined,
        modifiedTime: gz.modifiedTime
      };
    }
    const json = await findGoogleDriveFileByName(BACKUP_FILE_NAME);
    if (json) {
      return {
        id: json.id,
        name: json.name,
        size: json.size ? Number(json.size) : undefined,
        modifiedTime: json.modifiedTime
      };
    }
    return null;
  } catch (err) {
    console.warn('[GoogleDrive] 取得備份中繼資料失敗:', err);
    return null;
  }
}

/**
 * 產生並上傳全量壓縮快照至 Google Drive
 */
export async function uploadBackupToGoogleDrive(): Promise<{ timestamp: number; size: number }> {
  const artists = await db.artists.toArray();
  const tombstones = await db.tombstones.toArray();

  const backupData: BackupDataStructure = {
    schema: 'pickup-artist-vault',
    version: 2,
    timestamp: Date.now(),
    exportedAt: new Date().toISOString(),
    artistsCount: artists.length,
    artists,
    tombstones
  };

  const jsonContent = JSON.stringify(backupData);
  const compressedGzipBlob = await gzipCompress(jsonContent);

  // 1. 上傳壓縮快照
  const gzRes = await uploadFileToGoogleDrive(SNAPSHOT_GZ_NAME, compressedGzipBlob, 'application/gzip');

  // 2. 備用純文字 JSON 相容檔
  try {
    await uploadFileToGoogleDrive(BACKUP_FILE_NAME, jsonContent, 'application/json');
  } catch (e) {
    console.warn('[GoogleDrive] 相容純文字 JSON 上傳略過:', e);
  }

  const now = Date.now();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_SYNC_KEY, now.toString());
  }

  // 背景清理 changes_ 檔案
  clearGoogleDriveChangesInBackground();

  return {
    timestamp: now,
    size: compressedGzipBlob.size
  };
}

/**
 * 背景非同步清理零散的 changes_ 檔案
 */
export async function clearGoogleDriveChangesInBackground(): Promise<void> {
  try {
    const files = await listGoogleDriveAppDataFiles();
    const changeFiles = files.filter((f) => f.name.startsWith(CHANGES_PREFIX));
    for (const f of changeFiles) {
      try {
        await deleteFileFromGoogleDrive(f.id);
      } catch {}
    }
  } catch (err) {
    console.warn('[GoogleDrive] 清理 changes_ 零散檔案失敗:', err);
  }
}

let isRestoring = false;

/**
 * 自 Google Drive 下載快照與增量並與本機 Dexie 執行雙向時間戳合併
 */
export async function restoreBackupFromGoogleDrive(): Promise<{ restoredCount: number; timestamp: number }> {
  if (isRestoring) {
    throw new Error('還原作業進行中，請勿重複觸發');
  }

  isRestoring = true;
  updateSyncState({ status: 'syncing', errorMessage: undefined });

  try {
    const allFiles = await listGoogleDriveAppDataFiles();
    const gzFile = allFiles.find((f) => f.name === SNAPSHOT_GZ_NAME);
    const jsonFile = allFiles.find((f) => f.name === BACKUP_FILE_NAME);
    const changeFiles = allFiles.filter((f) => f.name.startsWith(CHANGES_PREFIX));

    if (!gzFile && !jsonFile && changeFiles.length === 0) {
      throw new Error('未在 Google Drive 找到有效備份檔案或增量紀錄');
    }

    let backupData: BackupDataStructure | null = null;

    if (gzFile) {
      try {
        const blob = await downloadBlobFromGoogleDrive(SNAPSHOT_GZ_NAME);
        if (blob) {
          const text = await gzipDecompress(blob);
          backupData = JSON.parse(text);
        }
      } catch (e) {
        console.warn('[GoogleDrive] 快照解壓縮失敗，嘗試備份 JSON:', e);
      }
    }

    if (!backupData && jsonFile) {
      try {
        const text = await downloadFileFromGoogleDrive(BACKUP_FILE_NAME);
        if (text) backupData = JSON.parse(text);
      } catch (e) {
        console.warn('[GoogleDrive] 純 JSON 解析失敗:', e);
      }
    }

    // 整合快照與 changes_ 增量
    const cloudArtistsMap = new Map<string, ArtistEntry>();
    const cloudTombstonesMap = new Map<string, Tombstone>();

    if (backupData?.artists) {
      for (const a of backupData.artists) cloudArtistsMap.set(a.id, a);
    }
    if (backupData?.tombstones) {
      for (const t of backupData.tombstones) cloudTombstonesMap.set(t.id, t);
    }

    for (const f of changeFiles) {
      try {
        const content = await downloadFileFromGoogleDrive(f.name);
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.type === 'delete') {
            cloudArtistsMap.delete(parsed.id);
            cloudTombstonesMap.set(parsed.id, { id: parsed.id, deletedAt: parsed.deletedAt || Date.now() });
          } else if (parsed.id && parsed.name) {
            cloudArtistsMap.set(parsed.id, parsed as ArtistEntry);
            cloudTombstonesMap.delete(parsed.id);
          }
        }
      } catch (e) {
        console.warn(`[GoogleDrive] 解析增量檔案 [${f.name}] 失敗:`, e);
      }
    }

    // 與本機進行 Last-Write-Wins 雙向合併
    let localHasNewer = false;
    await db.transaction('rw', [db.artists, db.tombstones], async () => {
      const localArtists = await db.artists.toArray();
      const localTombstones = await db.tombstones.toArray();

      const localArtistMap = new Map(localArtists.map((a) => [a.id, a]));
      const localTombstoneMap = new Map(localTombstones.map((t) => [t.id, t]));

      // 合併雲端藝人至本機
      for (const cloudArtist of cloudArtistsMap.values()) {
        const localTomb = localTombstoneMap.get(cloudArtist.id);
        if (localTomb && localTomb.deletedAt > (cloudArtist.updatedAt || cloudArtist.addedAt || 0)) {
          localHasNewer = true;
          continue;
        }

        const localArtist = localArtistMap.get(cloudArtist.id);
        if (!localArtist) {
          await db.artists.put(cloudArtist);
          await db.tombstones.delete(cloudArtist.id);
        } else {
          const cloudTime = cloudArtist.updatedAt || cloudArtist.addedAt || 0;
          const localTime = localArtist.updatedAt || localArtist.addedAt || 0;
          if (cloudTime > localTime) {
            await db.artists.put(cloudArtist);
            await db.tombstones.delete(cloudArtist.id);
          } else if (localTime > cloudTime) {
            localHasNewer = true;
          }
        }
      }

      // 合併雲端墓碑至本機
      for (const cloudTomb of cloudTombstonesMap.values()) {
        const localArtist = localArtistMap.get(cloudTomb.id);
        if (localArtist) {
          const localTime = localArtist.updatedAt || localArtist.addedAt || 0;
          if (cloudTomb.deletedAt > localTime) {
            await db.artists.delete(cloudTomb.id);
            await db.tombstones.put(cloudTomb);
          } else {
            localHasNewer = true;
          }
        } else {
          const localTomb = localTombstoneMap.get(cloudTomb.id);
          if (!localTomb || cloudTomb.deletedAt > localTomb.deletedAt) {
            await db.tombstones.put(cloudTomb);
          }
        }
      }
    });

    const now = Date.now();
    localStorage.setItem(LAST_SYNC_KEY, now.toString());

    // 若本機有較新的資料，回寫上傳給雲端以達成雙向收斂
    if (localHasNewer) {
      setTimeout(() => {
        uploadBackupToGoogleDrive().catch(console.warn);
      }, 500);
    }

    const currentCount = await db.artists.count();
    updateSyncState({
      status: 'synced',
      lastSyncedAt: now,
      errorMessage: undefined
    });

    return {
      restoredCount: currentCount,
      timestamp: now
    };
  } catch (err: any) {
    console.error('[GoogleDrive] 還原失敗:', err);
    updateSyncState({ status: 'error', errorMessage: err?.message || '還原失敗' });
    throw err;
  } finally {
    isRestoring = false;
  }
}

// ----------------------------------------------------
// Google Drive 即時自動同步佇列與排程
// ----------------------------------------------------
type StatusListener = (state: GoogleDriveSyncState) => void;
const listeners = new Set<StatusListener>();

let currentSyncState: GoogleDriveSyncState = {
  status: 'idle',
  lastSyncedAt: typeof localStorage !== 'undefined' ? Number(localStorage.getItem(LAST_SYNC_KEY)) || null : null,
  connectedAccount: getStoredGoogleUserInfo()
};

export function getGoogleDriveSyncState(): GoogleDriveSyncState {
  return currentSyncState;
}

export function subscribeGoogleDriveSyncState(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(currentSyncState);
  return () => {
    listeners.delete(listener);
  };
}

function updateSyncState(patch: Partial<GoogleDriveSyncState>) {
  currentSyncState = { ...currentSyncState, ...patch };
  listeners.forEach((l) => {
    try {
      l(currentSyncState);
    } catch (e) {
      console.warn('[GoogleDrive AutoSync] Listener error:', e);
    }
  });
}

const pendingChanges = new Map<string, { type: 'upsert' | 'delete'; artist?: ArtistEntry; id: string }>();
let needsFullCompaction = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncInProgress = false;

export function triggerGoogleDriveAutoSync(delayMs = 1500): void {
  if (typeof window === 'undefined' || isRestoring) return;
  const token = getStoredGoogleToken();
  if (!token) return;

  if (debounceTimer) clearTimeout(debounceTimer);

  if (!navigator.onLine) {
    updateSyncState({ status: 'offline', errorMessage: '網路已斷線' });
    return;
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await executeGoogleDriveSync();
  }, delayMs);
}

async function executeGoogleDriveSync(): Promise<void> {
  const token = getStoredGoogleToken();
  if (!token) return;

  if (isSyncInProgress) return;
  isSyncInProgress = true;
  updateSyncState({ status: 'syncing', errorMessage: undefined });

  try {
    const queue = Array.from(pendingChanges.values());

    if (queue.length === 0 && !needsFullCompaction) {
      updateSyncState({ status: 'synced' });
      return;
    }

    if (needsFullCompaction || queue.length >= 10) {
      const res = await uploadBackupToGoogleDrive();
      pendingChanges.clear();
      needsFullCompaction = false;
      updateSyncState({ status: 'synced', lastSyncedAt: res.timestamp });
    } else {
      for (const item of queue) {
        if (item.type === 'upsert' && item.artist) {
          const itemJson = JSON.stringify(item.artist);
          await uploadFileToGoogleDrive(`${CHANGES_PREFIX}${item.artist.id}.json`, itemJson);
        } else if (item.type === 'delete') {
          const tombJson = JSON.stringify({ type: 'delete', id: item.id, deletedAt: Date.now() });
          await uploadFileToGoogleDrive(`${CHANGES_PREFIX}tombstone_${item.id}.json`, tombJson);
        }
      }

      pendingChanges.clear();
      const now = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, now.toString());
      updateSyncState({ status: 'synced', lastSyncedAt: now });
    }
  } catch (err: any) {
    console.error('[GoogleDrive AutoSync] 同步上傳失敗:', err);
    updateSyncState({ status: 'error', errorMessage: err?.message || '同步失敗' });
  } finally {
    isSyncInProgress = false;
  }
}

// 監聽本機資料庫變更以觸發自動同步
if (typeof window !== 'undefined') {
  onDatabaseChange((event) => {
    const token = getStoredGoogleToken();
    if (!token) return;

    if (!event || event.type === 'batch') {
      needsFullCompaction = true;
    } else if (event.type === 'upsert') {
      pendingChanges.set(event.artist.id, { type: 'upsert', artist: event.artist, id: event.artist.id });
    } else if (event.type === 'delete') {
      pendingChanges.set(event.id, { type: 'delete', id: event.id });
    }
    triggerGoogleDriveAutoSync(1500);
  });
}

// ----------------------------------------------------
// 診斷測試工具
// ----------------------------------------------------
export async function runGoogleDriveDiagnosticTest(
  logCallback?: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void
): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] ${msg}`;
    logs.push(formatted);
    logCallback?.(formatted, type);
  };

  try {
    log('開始進行 Google Drive API 連線診斷測試...');
    log('1. 正在驗證登入授權...');
    const { user, grantedScope } = await loginToGoogleDrive();
    log(`✓ 授權成功！已登入使用者: ${user.name} (${user.email || '無公開 Email'})`, 'success');
    log(`  已獲得權限範圍 (Scopes): ${grantedScope || '(未回傳)'}`, 'info');

    if (!grantedScope.includes('drive.appdata')) {
      throw new Error('獲得的 Scopes 中未包含 drive.appdata，請重新授權並務必打勾核取方塊！');
    }

    log('2. 正在查詢 Google Drive 隱藏 AppData 資料夾清單...');
    const filesBefore = await listGoogleDriveAppDataFiles();
    log(`✓ 查詢成功！目前 AppData 資料夾現存檔案數量: ${filesBefore.length} 筆`, 'success');

    const testFileName = `pua_diagnostic_ping_${Date.now()}.json`;
    const testPayload = JSON.stringify({
      generator: 'Pickup Artist Diagnostic Test',
      timestamp: Date.now(),
      status: 'OK',
      client: user.email
    });

    log(`3. 正在上傳測試檔案 [${testFileName}] 到 AppData 資料夾...`);
    const uploadRes = await uploadFileToGoogleDrive(testFileName, testPayload);
    log(`✓ 上傳成功！建立之檔案 ID: ${uploadRes.fileId}`, 'success');

    log(`4. 正在下載並驗證測試檔案 [${testFileName}] 內容...`);
    const downloaded = await downloadFileFromGoogleDrive(testFileName);
    if (downloaded === testPayload) {
      log('✓ 內容驗證一致！資料完整度 100%', 'success');
    } else {
      throw new Error('下載的檔案內容與寫入的不符！');
    }

    log(`5. 正在清理測試暫存檔 [${uploadRes.fileId}]...`);
    await deleteFileFromGoogleDrive(uploadRes.fileId);
    log('✓ 清理完成！測試檔案已成功移除。', 'success');

    log('🎉 全部 5 項測試皆成功通過！您的 Google Drive 整合功能一切正常。', 'success');
    return { success: true, logs };
  } catch (err: any) {
    log(`❌ 診斷測試中斷失敗: ${err.message}`, 'error');
    return { success: false, logs };
  }
}
