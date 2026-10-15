import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { db } from '$lib/db';
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
  version: 1;
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
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * 上傳備份資料到 OneDrive
 * 優先使用 special/approot 專屬資料夾，若不支援則寫入根目錄 PickupArtist/ 資料夾
 */
export async function uploadBackupToOneDrive(): Promise<{ timestamp: number; size: number }> {
  const token = await getAccessToken();

  // 1. 讀取本機 Dexie 資料庫
  const artists = await db.artists.toArray();
  const tombstones = await db.tombstones.toArray();

  const backupData: BackupDataStructure = {
    schema: 'pickup-artist-vault',
    version: 1,
    timestamp: Date.now(),
    exportedAt: new Date().toISOString(),
    artistsCount: artists.length,
    artists,
    tombstones,
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });

  // 2. 上傳至 Graph API
  // 嘗試使用 special/approot，若失敗則回退至根目錄 PickupArtist
  let uploadUrl = `${GRAPH_API_BASE}/me/drive/special/approot:/${BACKUP_FILE_NAME}:/content`;

  let response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: blob,
  });

  if (!response.ok) {
    // 降級回退到一般目錄
    uploadUrl = `${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${BACKUP_FILE_NAME}:/content`;
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: blob,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OneDrive 上傳失敗 (${response.status}): ${errText}`);
    }
  }

  const result = await response.json();
  const now = Date.now();
  localStorage.setItem('pua_onedrive_last_sync', now.toString());

  return {
    timestamp: now,
    size: result.size || blob.size,
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

    // 先查 approot
    let res = await fetch(`${GRAPH_API_BASE}/me/drive/special/approot:/${BACKUP_FILE_NAME}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // 查根目錄
      res = await fetch(`${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${BACKUP_FILE_NAME}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

/**
 * 從 OneDrive 下載並還原資料庫
 */
export async function restoreBackupFromOneDrive(): Promise<{ restoredCount: number; timestamp: number }> {
  const token = await getAccessToken();

  let downloadUrl = `${GRAPH_API_BASE}/me/drive/special/approot:/${BACKUP_FILE_NAME}:/content`;

  let response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    downloadUrl = `${GRAPH_API_BASE}/me/drive/root:/PickupArtist/${BACKUP_FILE_NAME}:/content`;
    response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('未在 OneDrive 找到任何備份檔案');
    }
  }

  const backupData: BackupDataStructure = await response.json();

  if (backupData.schema !== 'pickup-artist-vault' || !Array.isArray(backupData.artists)) {
    throw new Error('備份檔案格式不正確或已毀損');
  }

  // 寫入本機 Dexie 資料庫（使用交易保障安全性）
  await db.transaction('rw', db.artists, db.tombstones, async () => {
    // 清除現有資料後覆蓋，或進行合併
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
}
