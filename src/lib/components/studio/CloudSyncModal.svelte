<script lang="ts">
  import { onMount } from 'svelte';
  import type { AccountInfo } from '@azure/msal-browser';
  import {
    getActiveAccount as getOneDriveAccount,
    loginToOneDrive,
    logoutOneDrive,
    uploadBackupToOneDrive,
    restoreBackupFromOneDrive,
    getCloudBackupMetadata as getOneDriveMetadata,
    clearMsalInteractionLocks,
    ONEDRIVE_CLIENT_ID,
    type CloudMetadata
  } from '$lib/services/onedrive';
  import {
    GOOGLE_CLIENT_ID,
    getStoredGoogleToken,
    getStoredGoogleUserInfo,
    isGoogleDriveConnected,
    loginToGoogleDrive,
    logoutGoogleDrive,
    uploadBackupToGoogleDrive,
    restoreBackupFromGoogleDrive,
    getGoogleDriveBackupMetadata,
    type GoogleUserInfo,
    type GoogleDriveMetadata
  } from '$lib/services/googledrive';

  interface Props {
    isOpen: boolean;
    onclose: () => void;
    onRestored?: () => Promise<void>;
    localArtistsCount: number;
    onAccountChange?: (connected: boolean) => void;
  }

  let { isOpen, onclose, onRestored, localArtistsCount, onAccountChange }: Props = $props();

  // OneDrive 狀態
  let oneDriveAccount = $state<AccountInfo | null>(null);
  let oneDriveMeta = $state<CloudMetadata | null>(null);

  // Google Drive 狀態
  let googleUser = $state<GoogleUserInfo | null>(null);
  let googleMeta = $state<GoogleDriveMetadata | null>(null);

  let isLoading = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusType = $state<'info' | 'success' | 'error'>('info');

  const isAnyCloudConnected = $derived(!!oneDriveAccount || !!googleUser);

  onMount(async () => {
    await refreshAllAccountStates();
  });

  $effect(() => {
    if (isOpen) {
      statusMessage = null;
      refreshAllAccountStates();
    }
  });

  async function refreshAllAccountStates() {
    try {
      // 1. 刷新 OneDrive
      oneDriveAccount = await getOneDriveAccount();
      if (oneDriveAccount) {
        oneDriveMeta = await getOneDriveMetadata();
      } else {
        oneDriveMeta = null;
      }

      // 2. 刷新 Google Drive
      if (isGoogleDriveConnected()) {
        googleUser = getStoredGoogleUserInfo();
        googleMeta = await getGoogleDriveBackupMetadata();
      } else {
        googleUser = null;
        googleMeta = null;
      }

      onAccountChange?.(!!oneDriveAccount || !!googleUser);
    } catch (err) {
      console.warn('[CloudSyncModal] Error fetching accounts:', err);
    }
  }

  // ----------------------------------------------------
  // OneDrive 動作
  // ----------------------------------------------------
  async function handleOneDriveLogin() {
    isLoading = true;
    statusMessage = '正在喚起微軟登入視窗...';
    statusType = 'info';
    try {
      oneDriveAccount = await loginToOneDrive();
      onAccountChange?.(true);
      statusMessage = '微軟帳戶連結成功！正在同步雲端資料庫...';
      try {
        await restoreBackupFromOneDrive();
        if (onRestored) await onRestored();
      } catch (e) {
        console.warn('初次同步無舊資料，上傳新備份:', e);
        await uploadBackupToOneDrive();
      }
      statusMessage = '微軟帳戶連結成功！雲端資料庫已同步完成。';
      statusType = 'success';
      oneDriveMeta = await getOneDriveMetadata();
    } catch (err: any) {
      statusMessage = err?.message || 'OneDrive 登入失敗或已取消視窗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveLogout() {
    if (!confirm('確定要解除與此微軟帳戶的連結嗎？')) return;
    isLoading = true;
    try {
      await logoutOneDrive();
      oneDriveAccount = null;
      oneDriveMeta = null;
      onAccountChange?.(!!googleUser);
      statusMessage = '已中斷 OneDrive 連結';
      statusType = 'info';
    } catch (err: any) {
      statusMessage = err?.message || 'OneDrive 登出失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveBackup() {
    if (!oneDriveAccount) return;
    isLoading = true;
    statusMessage = '正在封裝資料並上傳至 OneDrive...';
    statusType = 'info';
    try {
      const res = await uploadBackupToOneDrive();
      const kb = (res.size / 1024).toFixed(1);
      statusMessage = `OneDrive 備份完成！已寫入快照 (${kb} KB)`;
      statusType = 'success';
      oneDriveMeta = await getOneDriveMetadata();
    } catch (err: any) {
      statusMessage = err?.message || 'OneDrive 上傳失敗，請檢查網路';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveRestore() {
    if (!oneDriveAccount) return;
    if (!confirm('確定要自 OneDrive 還原並與本機進行時間戳合併嗎？')) return;
    isLoading = true;
    statusMessage = '正在從 OneDrive 拉取最新備份封包...';
    statusType = 'info';
    try {
      const res = await restoreBackupFromOneDrive();
      statusMessage = `OneDrive 還原成功！已回復/合併 ${res.restoredCount} 位藝人檔案。`;
      statusType = 'success';
      if (onRestored) await onRestored();
    } catch (err: any) {
      statusMessage = err?.message || 'OneDrive 還原失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  // ----------------------------------------------------
  // Google Drive 動作
  // ----------------------------------------------------
  async function handleGoogleLogin() {
    isLoading = true;
    statusMessage = '正在喚起 Google 授權視窗，請務必勾選權限核取方塊...';
    statusType = 'info';
    try {
      const res = await loginToGoogleDrive();
      if (!res.grantedScope.includes('drive.appdata')) {
        statusMessage = '⚠️ 授權成功但未勾選雲端硬碟權限！請點擊登出後重新登入並勾選方塊。';
        statusType = 'error';
        return;
      }
      googleUser = res.user;
      onAccountChange?.(true);
      statusMessage = 'Google 帳戶連結成功！正在同步雲端資料庫...';
      try {
        await restoreBackupFromGoogleDrive();
        if (onRestored) await onRestored();
      } catch (e) {
        console.warn('初次同步無舊資料，上傳新備份:', e);
        await uploadBackupToGoogleDrive();
      }
      statusMessage = 'Google 帳戶連結成功！雲端資料庫已同步完成。';
      statusType = 'success';
      googleMeta = await getGoogleDriveBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || 'Google 登入失敗或已關閉視窗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleLogout() {
    if (!confirm('確定要解除與此 Google 帳戶的連結嗎？')) return;
    isLoading = true;
    try {
      await logoutGoogleDrive();
      googleUser = null;
      googleMeta = null;
      onAccountChange?.(!!oneDriveAccount);
      statusMessage = '已中斷 Google Drive 連結';
      statusType = 'info';
    } catch (err: any) {
      statusMessage = err?.message || 'Google 登出失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleBackup() {
    if (!googleUser) return;
    isLoading = true;
    statusMessage = '正在封裝資料並上傳至 Google Drive AppData 沙盒...';
    statusType = 'info';
    try {
      const res = await uploadBackupToGoogleDrive();
      const kb = (res.size / 1024).toFixed(1);
      statusMessage = `Google Drive 備份完成！已寫入快照 (${kb} KB)`;
      statusType = 'success';
      googleMeta = await getGoogleDriveBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || 'Google Drive 上傳失敗，請檢查網路';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleRestore() {
    if (!googleUser) return;
    if (!confirm('確定要自 Google Drive 還原並與本機進行時間戳合併嗎？')) return;
    isLoading = true;
    statusMessage = '正在從 Google Drive 拉取最新備份封包...';
    statusType = 'info';
    try {
      const res = await restoreBackupFromGoogleDrive();
      statusMessage = `Google Drive 還原成功！已回復/合併 ${res.restoredCount} 位藝人檔案。`;
      statusType = 'success';
      if (onRestored) await onRestored();
    } catch (err: any) {
      statusMessage = err?.message || 'Google Drive 還原失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  // ----------------------------------------------------
  // 一鍵雙雲全部同步
  // ----------------------------------------------------
  async function handleSyncAll() {
    if (!oneDriveAccount && !googleUser) return;
    isLoading = true;
    statusMessage = '正在執行全域多雲同步備份...';
    statusType = 'info';
    const results: string[] = [];

    try {
      if (oneDriveAccount) {
        try {
          await uploadBackupToOneDrive();
          results.push('OneDrive ✓');
        } catch (e: any) {
          results.push(`OneDrive ✗ (${e?.message || '失敗'})`);
        }
      }

      if (googleUser) {
        try {
          await uploadBackupToGoogleDrive();
          results.push('Google Drive ✓');
        } catch (e: any) {
          results.push(`Google Drive ✗ (${e?.message || '失敗'})`);
        }
      }

      statusMessage = `多雲同步作業完畢：${results.join(' | ')}`;
      statusType = results.some((r) => r.includes('✗')) ? 'error' : 'success';
      await refreshAllAccountStates();
    } finally {
      isLoading = false;
    }
  }

  function handleResetLock() {
    clearMsalInteractionLocks();
    statusMessage = '已清除登入鎖定快取，請重試。';
    statusType = 'info';
  }

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatDateTime(isoOrTimestamp?: string | number): string {
    if (!isoOrTimestamp) return '無紀錄';
    const d = new Date(isoOrTimestamp);
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/85 backdrop-blur-md overflow-y-auto">
    <!-- 模態視窗主體 -->
    <div
      class="w-full max-w-2xl bg-chassis border border-wire p-5 sm:p-7 relative font-mono shadow-[0_0_40px_rgba(0,0,0,0.9)] flex flex-col gap-5 my-8"
    >
      <!-- 頂部視窗控制欄 -->
      <div class="flex items-center justify-between border-b border-wire pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-2.5 h-2.5 rounded-full {isAnyCloudConnected ? 'bg-signal animate-pulse' : 'bg-wire'}"></span>
          <span class="font-dot text-sm text-ink tracking-[0.2em] uppercase">CLOUD_VAULT // MULTI-CLOUD MATRIX</span>
        </div>
        <button
          type="button"
          onclick={onclose}
          class="text-ink-muted hover:text-signal text-xs p-1 transition-colors cursor-pointer"
        >
          [ESC / 關閉]
        </button>
      </div>

      <!-- 本地狀態與一鍵全部同步列 -->
      <div class="flex flex-wrap items-center justify-between gap-3 bg-void/60 p-3.5 border border-wire">
        <div>
          <div class="text-[10px] text-ink-dim uppercase tracking-wider">// LOCAL_STORAGE</div>
          <div class="text-sm font-bold text-ink mt-0.5">{localArtistsCount} ARTISTS IN INDEXED_DB</div>
        </div>

        {#if isAnyCloudConnected}
          <button
            type="button"
            onclick={handleSyncAll}
            disabled={isLoading}
            class="px-4 py-2 bg-signal hover:bg-white hover:text-void text-white font-bold text-xs tracking-wider uppercase transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-[0_0_12px_rgba(255,42,60,0.25)]"
          >
            <span class="material-symbols-outlined text-sm {isLoading ? 'animate-spin' : ''}">sync</span>
            <span>立即同步所有已連結雲端</span>
          </button>
        {/if}
      </div>

      <!-- 狀態通知訊息區 -->
      {#if statusMessage}
        <div
          class="p-2.5 text-xs border flex items-center justify-between gap-2 {statusType === 'success' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : statusType === 'error' ? 'bg-signal-dim/30 border-signal text-signal' : 'bg-void border-wire text-ink'}"
        >
          <span class="break-words leading-relaxed">{statusMessage}</span>
          {#if statusType === 'error' && statusMessage.includes('鎖定')}
            <button
              type="button"
              onclick={handleResetLock}
              class="shrink-0 px-2 py-0.5 border border-signal hover:bg-signal hover:text-white text-[10px] uppercase font-bold transition-colors cursor-pointer"
            >
              重置狀態鎖
            </button>
          {/if}
        </div>
      {/if}

      <!-- 雙雲端機匣卡片 (Dual Racks) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

        <!-- 机匣 1: Microsoft OneDrive -->
        <div class="bg-panel/40 border {oneDriveAccount ? 'border-emerald-500/40' : 'border-wire'} p-4 flex flex-col justify-between gap-4 relative">
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-wire/60 pb-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full {oneDriveAccount ? 'bg-emerald-400 animate-pulse' : 'bg-wire'}"></span>
                <span class="font-bold text-xs text-ink tracking-wider">MICROSOFT ONEDRIVE</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 border {oneDriveAccount ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' : 'border-wire text-ink-dim'}">
                {oneDriveAccount ? 'ONLINE' : 'DISCONNECTED'}
              </span>
            </div>

            {#if oneDriveAccount}
              <div class="space-y-1.5 text-xs mb-4">
                <div class="text-ink font-bold truncate text-[11px]" title={oneDriveAccount.username}>
                  帳戶：{oneDriveAccount.username}
                </div>
                <div class="text-[10px] text-ink-muted flex justify-between">
                  <span>快照時間：</span>
                  <span class="text-signal">{formatDateTime(oneDriveMeta?.lastModifiedDateTime)}</span>
                </div>
                {#if oneDriveMeta?.size}
                  <div class="text-[10px] text-ink-muted flex justify-between">
                    <span>封包大小：</span>
                    <span class="text-ink">{formatBytes(oneDriveMeta.size)}</span>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-xs text-ink-muted py-3 text-center space-y-1">
                <div>尚未連結微軟帳戶</div>
                {#if !ONEDRIVE_CLIENT_ID}
                  <div class="text-[10px] text-signal font-mono">
                    ⚠ 未在 .env 配置 PUBLIC_ONEDRIVE_CLIENT_ID
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- 操作按鈕 -->
          <div class="pt-2 border-t border-wire/60 flex flex-col gap-2">
            {#if !oneDriveAccount}
              <button
                type="button"
                onclick={handleOneDriveLogin}
                disabled={isLoading || !ONEDRIVE_CLIENT_ID}
                class="w-full py-2 bg-panel hover:bg-ink hover:text-void border border-wire text-ink font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                title={!ONEDRIVE_CLIENT_ID ? '請先於 .env 設定 PUBLIC_ONEDRIVE_CLIENT_ID' : '點擊登入微軟帳戶'}
              >
                <span class="material-symbols-outlined text-sm">cloud</span>
                <span>{ONEDRIVE_CLIENT_ID ? '連結微軟帳戶' : '未配置 ONEDRIVE KEY'}</span>
              </button>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onclick={handleOneDriveBackup}
                  disabled={isLoading}
                  class="py-1.5 bg-signal hover:bg-white hover:text-void text-white font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  備份 (PUSH)
                </button>
                <button
                  type="button"
                  onclick={handleOneDriveRestore}
                  disabled={isLoading || !oneDriveMeta}
                  class="py-1.5 bg-chassis hover:bg-ink hover:text-void border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                >
                  還原 (PULL)
                </button>
              </div>
              <button
                type="button"
                onclick={handleOneDriveLogout}
                disabled={isLoading}
                class="w-full text-center py-1 text-[10px] text-ink-dim hover:text-signal transition-colors cursor-pointer"
              >
                中斷 OneDrive 連結
              </button>
            {/if}
          </div>
        </div>

        <!-- 机匣 2: Google Drive -->
        <div class="bg-panel/40 border {googleUser ? 'border-cyan-500/40' : 'border-wire'} p-4 flex flex-col justify-between gap-4 relative">
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-wire/60 pb-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full {googleUser ? 'bg-[#00f0ff] animate-pulse' : 'bg-wire'}"></span>
                <span class="font-bold text-xs text-ink tracking-wider">GOOGLE DRIVE</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 border {googleUser ? 'border-cyan-500/60 text-[#00f0ff] bg-cyan-500/10' : 'border-wire text-ink-dim'}">
                {googleUser ? 'ONLINE' : 'DISCONNECTED'}
              </span>
            </div>

            {#if googleUser}
              <div class="space-y-1.5 text-xs mb-4">
                <div class="text-ink font-bold truncate text-[11px]" title={googleUser.email}>
                  帳戶：{googleUser.name} ({googleUser.email})
                </div>
                <div class="text-[10px] text-ink-muted flex justify-between">
                  <span>快照時間：</span>
                  <span class="text-[#00f0ff]">{formatDateTime(googleMeta?.modifiedTime)}</span>
                </div>
                {#if googleMeta?.size}
                  <div class="text-[10px] text-ink-muted flex justify-between">
                    <span>封包大小：</span>
                    <span class="text-ink">{formatBytes(googleMeta.size)}</span>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-xs text-ink-muted py-2 space-y-1 text-center">
                <div>尚未連結 Google 帳戶</div>
                <div class="text-[10px] text-primary-container">
                  💡 授權視窗中請務必勾選權限方塊
                </div>
              </div>
            {/if}
          </div>

          <!-- 操作按鈕 -->
          <div class="pt-2 border-t border-wire/60 flex flex-col gap-2">
            {#if !googleUser}
              <button
                type="button"
                onclick={handleGoogleLogin}
                disabled={isLoading || !GOOGLE_CLIENT_ID}
                class="w-full py-2 bg-panel hover:bg-ink hover:text-void border border-wire text-ink font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                title={!GOOGLE_CLIENT_ID ? '請先於 .env 設定 PUBLIC_GOOGLE_CLIENT_ID' : '點擊登入 Google 帳戶'}
              >
                <span class="material-symbols-outlined text-sm">cloud</span>
                <span>{GOOGLE_CLIENT_ID ? '連結 GOOGLE 帳戶' : '未配置 GOOGLE KEY'}</span>
              </button>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onclick={handleGoogleBackup}
                  disabled={isLoading}
                  class="py-1.5 bg-[#00f0ff] hover:bg-white text-[#050505] font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  備份 (PUSH)
                </button>
                <button
                  type="button"
                  onclick={handleGoogleRestore}
                  disabled={isLoading || !googleMeta}
                  class="py-1.5 bg-chassis hover:bg-ink hover:text-void border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                >
                  還原 (PULL)
                </button>
              </div>
              <button
                type="button"
                onclick={handleGoogleLogout}
                disabled={isLoading}
                class="w-full text-center py-1 text-[10px] text-ink-dim hover:text-[#00f0ff] transition-colors cursor-pointer"
              >
                中斷 Google Drive 連結
              </button>
            {/if}
          </div>
        </div>

      </div>

      <!-- 底部安全與雙向同步說明 -->
      <div class="text-[10px] text-ink-dim border-t border-wire pt-3 flex items-center justify-between">
        <span>雙向時間戳比對 (Last-Write-Wins) 啟用中 · 支援雙雲端同時或獨立同步</span>
        <span class="text-ink-muted">CLOUD_VAULT // v2.0</span>
      </div>

    </div>
  </div>
{/if}
