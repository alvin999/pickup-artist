/**
 * 聲學發燒友金鑰安全保管庫 (Acoustic Dossier AI Security Vault)
 * 支援三種安全規格：
 * 1. none: 無加密 (Plain / 快速直讀)
 * 2. device: 裝置透明加密 (Device-Transparent / Web Crypto AES-GCM-256 + IndexedDB 非導出密鑰)
 * 3. master_password: 主密碼加密 (Master Password / PBKDF2 100,000 次 + AES-GCM-256，高規格防護)
 */

import type { AISettings } from './client';
import { DEFAULT_GROQ_MODEL, DEFAULT_GEMINI_MODEL } from './client';

export type EncryptionMode = 'none' | 'device' | 'master_password';

const STORAGE_KEYS = {
  MODE: 'pua_vault_mode',
  // Plaintext keys
  PLAIN_PROVIDER: 'pua_ai_provider',
  PLAIN_GROQ_KEY: 'pua_groq_api_key',
  PLAIN_GEMINI_KEY: 'pua_gemini_api_key',
  PLAIN_GROQ_MODEL: 'pua_groq_selected_model',
  PLAIN_GEMINI_MODEL: 'pua_gemini_selected_model',
  // Encrypted payloads
  DEVICE_PAYLOAD: 'pua_vault_device_payload',
  PASSWORD_PAYLOAD: 'pua_vault_password_payload',
  PASSWORD_SALT: 'pua_vault_password_salt',
  PASSWORD_VERIFIER: 'pua_vault_password_verifier' // 用於快速校驗主密碼正確性
};

const DB_NAME = 'PUA_DeviceKeyStore';
const STORE_NAME = 'keys';
const DEVICE_KEY_ID = 'device_master_key';

// 會話記憶體解鎖快取（關閉分頁或鎖定時自動清除）
let sessionMemorySettings: AISettings | null = null;
let sessionPasswordKey: CryptoKey | null = null;

// ================= IndexedDB 裝置金鑰儲存 =================

function openDeviceKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Browser environment required'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const db = await openDeviceKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(DEVICE_KEY_ID);

    getReq.onsuccess = async () => {
      if (getReq.result instanceof CryptoKey) {
        resolve(getReq.result);
        return;
      }
      try {
        // 生成非導出 (extractable: false) 的 AES-GCM-256 金鑰
        const newKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        const putTx = db.transaction(STORE_NAME, 'readwrite');
        putTx.objectStore(STORE_NAME).put(newKey, DEVICE_KEY_ID);
        putTx.oncomplete = () => resolve(newKey);
        putTx.onerror = () => reject(putTx.error);
      } catch (err) {
        reject(err);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ================= Web Crypto 輔助工具 =================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 根據密碼與鹽值衍生 AES-GCM 金鑰
async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// AES-GCM 加密字串
async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plaintext)
  );

  const payload = {
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(ciphertextBuffer)
  };
  return JSON.stringify(payload);
}

// AES-GCM 解密字串
async function decryptWithKey(key: CryptoKey, jsonPayload: string): Promise<string> {
  const payload = JSON.parse(jsonPayload);
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const data = base64ToArrayBuffer(payload.data);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource
  );
  return new TextDecoder().decode(decryptedBuffer);
}

// ================= 對外公開 API =================

/**
 * 取得當前加密模式
 */
export function getStoredEncryptionMode(): EncryptionMode {
  if (typeof window === 'undefined') return 'none';
  const mode = localStorage.getItem(STORAGE_KEYS.MODE) as EncryptionMode;
  if (mode === 'device' || mode === 'master_password' || mode === 'none') {
    return mode;
  }
  // 舊用戶相容：若已存在 plain keys 則為 none
  return 'none';
}

/**
 * 檢查是否需要解鎖主密碼
 */
export function isMasterPasswordLocked(): boolean {
  if (getStoredEncryptionMode() !== 'master_password') return false;
  return sessionMemorySettings === null;
}

/**
 * 是否曾設定過主密碼保管庫
 */
export function hasConfiguredMasterPassword(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEYS.PASSWORD_PAYLOAD);
}

/**
 * 是否有設定任何金鑰
 */
export function hasAnyConfiguredKeys(): boolean {
  if (typeof window === 'undefined') return false;
  const mode = getStoredEncryptionMode();
  if (mode === 'none') {
    return !!(localStorage.getItem(STORAGE_KEYS.PLAIN_GROQ_KEY) || localStorage.getItem(STORAGE_KEYS.PLAIN_GEMINI_KEY));
  }
  if (mode === 'device') {
    return !!localStorage.getItem(STORAGE_KEYS.DEVICE_PAYLOAD);
  }
  if (mode === 'master_password') {
    return !!localStorage.getItem(STORAGE_KEYS.PASSWORD_PAYLOAD);
  }
  return false;
}

/**
 * 主動鎖定主密碼保管庫
 */
export function lockMasterPassword(): void {
  sessionMemorySettings = null;
  sessionPasswordKey = null;
}

/**
 * 驗證並解鎖主密碼保管庫
 */
export async function unlockWithMasterPassword(password: string): Promise<{ success: boolean; settings?: AISettings; error?: string }> {
  if (typeof window === 'undefined') return { success: false, error: '非瀏覽器環境' };
  
  const payloadStr = localStorage.getItem(STORAGE_KEYS.PASSWORD_PAYLOAD);
  const saltStr = localStorage.getItem(STORAGE_KEYS.PASSWORD_SALT);
  if (!payloadStr || !saltStr) {
    return { success: false, error: '尚未設定主密碼保管庫' };
  }

  try {
    const salt = new Uint8Array(base64ToArrayBuffer(saltStr));
    const key = await deriveKeyFromPassword(password, salt);
    const decryptedJson = await decryptWithKey(key, payloadStr);
    const settings = JSON.parse(decryptedJson) as AISettings;

    // 快取至當前會話
    sessionPasswordKey = key;
    sessionMemorySettings = settings;

    return { success: true, settings };
  } catch {
    return { success: false, error: '主密碼不正確，解密失敗' };
  }
}

/**
 * 載入 AI 設定（依當前加密模式自動加載）
 */
export async function loadSecureAISettings(masterPassword?: string): Promise<{
  settings: AISettings;
  mode: EncryptionMode;
  isLocked: boolean;
}> {
  const defaultSettings: AISettings = {
    provider: 'groq',
    groqKey: '',
    geminiKey: '',
    groqModel: DEFAULT_GROQ_MODEL,
    geminiModel: DEFAULT_GEMINI_MODEL
  };

  if (typeof window === 'undefined') {
    return { settings: defaultSettings, mode: 'none', isLocked: false };
  }

  const mode = getStoredEncryptionMode();

  // 1. 若為無加密模式 (none)
  if (mode === 'none') {
    const settings: AISettings = {
      provider: (localStorage.getItem(STORAGE_KEYS.PLAIN_PROVIDER) as 'groq' | 'gemini') || 'groq',
      groqKey: localStorage.getItem(STORAGE_KEYS.PLAIN_GROQ_KEY) || '',
      geminiKey: localStorage.getItem(STORAGE_KEYS.PLAIN_GEMINI_KEY) || '',
      groqModel: localStorage.getItem(STORAGE_KEYS.PLAIN_GROQ_MODEL) || DEFAULT_GROQ_MODEL,
      geminiModel: localStorage.getItem(STORAGE_KEYS.PLAIN_GEMINI_MODEL) || DEFAULT_GEMINI_MODEL
    };
    return { settings, mode: 'none', isLocked: false };
  }

  // 2. 若為裝置透明加密模式 (device)
  if (mode === 'device') {
    const payloadStr = localStorage.getItem(STORAGE_KEYS.DEVICE_PAYLOAD);
    if (!payloadStr) {
      return { settings: defaultSettings, mode: 'device', isLocked: false };
    }
    try {
      const deviceKey = await getOrCreateDeviceKey();
      const decrypted = await decryptWithKey(deviceKey, payloadStr);
      const settings = { ...defaultSettings, ...JSON.parse(decrypted) };
      return { settings, mode: 'device', isLocked: false };
    } catch (e) {
      console.error('[SecurityVault] 裝置金鑰解密異常:', e);
      return { settings: defaultSettings, mode: 'device', isLocked: false };
    }
  }

  // 3. 若為主密碼加密模式 (master_password)
  if (mode === 'master_password') {
    if (sessionMemorySettings) {
      return { settings: sessionMemorySettings, mode: 'master_password', isLocked: false };
    }
    if (masterPassword) {
      const res = await unlockWithMasterPassword(masterPassword);
      if (res.success && res.settings) {
        return { settings: res.settings, mode: 'master_password', isLocked: false };
      }
    }
    // 未解鎖狀態
    return { settings: defaultSettings, mode: 'master_password', isLocked: true };
  }

  return { settings: defaultSettings, mode: 'none', isLocked: false };
}

/**
 * 儲存 AI 設定至指定安全模式
 */
export async function saveSecureAISettings(
  settings: AISettings,
  targetMode: EncryptionMode,
  masterPassword?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  const jsonString = JSON.stringify(settings);
  localStorage.setItem(STORAGE_KEYS.MODE, targetMode);

  if (targetMode === 'none') {
    // 寫入純文字
    localStorage.setItem(STORAGE_KEYS.PLAIN_PROVIDER, settings.provider);
    localStorage.setItem(STORAGE_KEYS.PLAIN_GROQ_KEY, settings.groqKey);
    localStorage.setItem(STORAGE_KEYS.PLAIN_GEMINI_KEY, settings.geminiKey);
    localStorage.setItem(STORAGE_KEYS.PLAIN_GROQ_MODEL, settings.groqModel || DEFAULT_GROQ_MODEL);
    localStorage.setItem(STORAGE_KEYS.PLAIN_GEMINI_MODEL, settings.geminiModel || DEFAULT_GEMINI_MODEL);

    // 清除加密殘留
    localStorage.removeItem(STORAGE_KEYS.DEVICE_PAYLOAD);
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_PAYLOAD);
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_SALT);
    lockMasterPassword();
    return;
  }

  if (targetMode === 'device') {
    const deviceKey = await getOrCreateDeviceKey();
    const encryptedPayload = await encryptWithKey(deviceKey, jsonString);
    localStorage.setItem(STORAGE_KEYS.DEVICE_PAYLOAD, encryptedPayload);

    // 清除其他模式殘留
    clearPlainStorage();
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_PAYLOAD);
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_SALT);
    lockMasterPassword();
    return;
  }

  if (targetMode === 'master_password') {
    if (!masterPassword) {
      throw new Error('設定主密碼加密模式時必須提供主密碼');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKeyFromPassword(masterPassword, salt);
    const encryptedPayload = await encryptWithKey(key, jsonString);

    localStorage.setItem(STORAGE_KEYS.PASSWORD_SALT, arrayBufferToBase64(salt.buffer));
    localStorage.setItem(STORAGE_KEYS.PASSWORD_PAYLOAD, encryptedPayload);

    // 快取至當前會話
    sessionPasswordKey = key;
    sessionMemorySettings = settings;

    // 清除其他模式殘留
    clearPlainStorage();
    localStorage.removeItem(STORAGE_KEYS.DEVICE_PAYLOAD);
    return;
  }
}

function clearPlainStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.PLAIN_PROVIDER);
  localStorage.removeItem(STORAGE_KEYS.PLAIN_GROQ_KEY);
  localStorage.removeItem(STORAGE_KEYS.PLAIN_GEMINI_KEY);
  localStorage.removeItem(STORAGE_KEYS.PLAIN_GROQ_MODEL);
  localStorage.removeItem(STORAGE_KEYS.PLAIN_GEMINI_MODEL);
}
