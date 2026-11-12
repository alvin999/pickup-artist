<script lang="ts">
  import { onMount } from 'svelte';
  import type { AccountInfo } from '@azure/msal-browser';
  import { i18n, t } from '$lib/i18n';
  import { createVaultBackupPayload, importVaultBackupJson } from '$lib/db';
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
  let hasInteractionLockError = $state(false);
  let isDragOver = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const isAnyCloudConnected = $derived(!!oneDriveAccount || !!googleUser);

  function isLockErr(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err || '');
    return msg === t('onedrive_err_interaction_reset') || /interaction|lock|鎖定|ロック/i.test(msg);
  }

  onMount(async () => {
    await refreshAllAccountStates();
  });

  $effect(() => {
    if (isOpen) {
      statusMessage = null;
      hasInteractionLockError = false;
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
    hasInteractionLockError = false;
    statusMessage = t('cloud_od_opening');
    statusType = 'info';
    try {
      oneDriveAccount = await loginToOneDrive();
      onAccountChange?.(true);
      statusMessage = t('cloud_od_connected_syncing');
      try {
        await restoreBackupFromOneDrive();
        if (onRestored) await onRestored();
      } catch (e) {
        console.warn('初次同步無舊資料，上傳新備份:', e);
        await uploadBackupToOneDrive();
      }
      statusMessage = t('cloud_od_connected_done');
      statusType = 'success';
      oneDriveMeta = await getOneDriveMetadata();
    } catch (err: any) {
      hasInteractionLockError = isLockErr(err);
      statusMessage = err?.message || t('cloud_od_login_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveLogout() {
    if (!confirm(t('cloud_od_disconnect_confirm'))) return;
    isLoading = true;
    hasInteractionLockError = false;
    try {
      await logoutOneDrive();
      oneDriveAccount = null;
      oneDriveMeta = null;
      onAccountChange?.(!!googleUser);
      statusMessage = t('cloud_od_disconnected');
      statusType = 'info';
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_od_logout_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveBackup() {
    if (!oneDriveAccount) return;
    isLoading = true;
    hasInteractionLockError = false;
    statusMessage = t('cloud_od_uploading');
    statusType = 'info';
    try {
      const res = await uploadBackupToOneDrive();
      const kb = (res.size / 1024).toFixed(1);
      statusMessage = t('cloud_od_upload_done', { kb });
      statusType = 'success';
      oneDriveMeta = await getOneDriveMetadata();
    } catch (err: any) {
      hasInteractionLockError = isLockErr(err);
      statusMessage = err?.message || t('cloud_od_upload_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleOneDriveRestore() {
    if (!oneDriveAccount) return;
    if (!confirm(t('cloud_od_restore_confirm'))) return;
    isLoading = true;
    hasInteractionLockError = false;
    statusMessage = t('cloud_od_restoring');
    statusType = 'info';
    try {
      const res = await restoreBackupFromOneDrive();
      statusMessage = t('cloud_od_restore_done', { count: res.restoredCount });
      statusType = 'success';
      if (onRestored) await onRestored();
    } catch (err: any) {
      hasInteractionLockError = isLockErr(err);
      statusMessage = err?.message || t('cloud_od_restore_failed');
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
    hasInteractionLockError = false;
    statusMessage = t('cloud_gd_opening');
    statusType = 'info';
    try {
      const res = await loginToGoogleDrive();
      if (!res.grantedScope.includes('drive.appdata')) {
        statusMessage = t('cloud_gd_missing_scope');
        statusType = 'error';
        return;
      }
      googleUser = res.user;
      onAccountChange?.(true);
      statusMessage = t('cloud_gd_connected_syncing');
      try {
        await restoreBackupFromGoogleDrive();
        if (onRestored) await onRestored();
      } catch (e) {
        console.warn('初次同步無舊資料，上傳新備份:', e);
        await uploadBackupToGoogleDrive();
      }
      statusMessage = t('cloud_gd_connected_done');
      statusType = 'success';
      googleMeta = await getGoogleDriveBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_gd_login_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleLogout() {
    if (!confirm(t('cloud_gd_disconnect_confirm'))) return;
    isLoading = true;
    hasInteractionLockError = false;
    try {
      await logoutGoogleDrive();
      googleUser = null;
      googleMeta = null;
      onAccountChange?.(!!oneDriveAccount);
      statusMessage = t('cloud_gd_disconnected');
      statusType = 'info';
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_gd_logout_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleBackup() {
    if (!googleUser) return;
    isLoading = true;
    hasInteractionLockError = false;
    statusMessage = t('cloud_gd_uploading');
    statusType = 'info';
    try {
      const res = await uploadBackupToGoogleDrive();
      const kb = (res.size / 1024).toFixed(1);
      statusMessage = t('cloud_gd_upload_done', { kb });
      statusType = 'success';
      googleMeta = await getGoogleDriveBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_gd_upload_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleRestore() {
    if (!googleUser) return;
    if (!confirm(t('cloud_gd_restore_confirm'))) return;
    isLoading = true;
    hasInteractionLockError = false;
    statusMessage = t('cloud_gd_restoring');
    statusType = 'info';
    try {
      const res = await restoreBackupFromGoogleDrive();
      statusMessage = t('cloud_gd_restore_done', { count: res.restoredCount });
      statusType = 'success';
      if (onRestored) await onRestored();
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_gd_restore_failed');
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
    hasInteractionLockError = false;
    statusMessage = t('cloud_multi_syncing');
    statusType = 'info';
    const results: string[] = [];

    try {
      if (oneDriveAccount) {
        try {
          await uploadBackupToOneDrive();
          results.push('OneDrive ✓');
        } catch (e: any) {
          if (isLockErr(e)) hasInteractionLockError = true;
          results.push(`OneDrive ✗ (${e?.message || t('cloud_multi_fail_label')})`);
        }
      }

      if (googleUser) {
        try {
          await uploadBackupToGoogleDrive();
          results.push('Google Drive ✓');
        } catch (e: any) {
          results.push(`Google Drive ✗ (${e?.message || t('cloud_multi_fail_label')})`);
        }
      }

      statusMessage = t('cloud_multi_done', { results: results.join(' | ') });
      statusType = results.some((r) => r.includes('✗')) ? 'error' : 'success';
      await refreshAllAccountStates();
    } finally {
      isLoading = false;
    }
  }

  function handleResetLock() {
    clearMsalInteractionLocks();
    hasInteractionLockError = false;
    statusMessage = t('cloud_lock_cleared');
    statusType = 'info';
  }

  // ----------------------------------------------------
  // 本機 JSON 檔案匯出與雙向合併匯入（免雲端帳號保底方案）
  // ----------------------------------------------------
  async function handleLocalExport() {
    isLoading = true;
    try {
      const payload = await createVaultBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PUA_VAULT_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      statusMessage = t('cloud_export_done', {
        artists: payload.artistsCount,
        queuePart: payload.listeningQueue?.length ? t('cloud_export_queue_part', { count: payload.listeningQueue.length }) : ''
      });
      statusType = 'success';
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_export_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function processImportedFile(file: File) {
    isLoading = true;
    hasInteractionLockError = false;
    statusMessage = t('cloud_importing', { file: file.name });
    statusType = 'info';
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importVaultBackupJson(parsed);
      if (onRestored) await onRestored();
      statusMessage = t('cloud_import_done', {
        imported: res.importedOrUpdatedCount,
        queuePart: res.queueMergedCount > 0 ? t('cloud_import_queue_part', { count: res.queueMergedCount }) : '',
        total: res.totalCount
      });
      statusType = 'success';
    } catch (err: any) {
      statusMessage = err?.message || t('cloud_import_failed');
      statusType = 'error';
    } finally {
      isLoading = false;
      if (fileInputEl) fileInputEl.value = '';
    }
  }

  function handleFileInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) processImportedFile(file);
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) processImportedFile(file);
  }

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatDateTime(isoOrTimestamp?: string | number): string {
    if (!isoOrTimestamp) return t('cloud_no_record');
    const d = new Date(isoOrTimestamp);
    return d.toLocaleString(i18n.dateLocale, {
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
          {t('cloud_close_esc')}
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
            <span>{t('cloud_sync_all_btn')}</span>
          </button>
        {/if}
      </div>

      <!-- 狀態通知訊息區 -->
      {#if statusMessage}
        <div
          class="p-2.5 text-xs border flex items-center justify-between gap-2 {statusType === 'success' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : statusType === 'error' ? 'bg-signal-dim/30 border-signal text-signal' : 'bg-void border-wire text-ink'}"
        >
          <span class="break-words leading-relaxed">{statusMessage}</span>
          {#if statusType === 'error' && hasInteractionLockError}
            <button
              type="button"
              onclick={handleResetLock}
              class="shrink-0 px-2 py-0.5 border border-signal hover:bg-signal hover:text-white text-[10px] uppercase font-bold transition-colors cursor-pointer"
            >
              {t('cloud_reset_lock_btn')}
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
                  {t('cloud_account_label', { account: oneDriveAccount.username })}
                </div>
                <div class="text-[10px] text-ink-muted flex justify-between">
                  <span>{t('cloud_snapshot_time')}</span>
                  <span class="text-signal">{formatDateTime(oneDriveMeta?.lastModifiedDateTime)}</span>
                </div>
                {#if oneDriveMeta?.size}
                  <div class="text-[10px] text-ink-muted flex justify-between">
                    <span>{t('cloud_payload_size')}</span>
                    <span class="text-ink">{formatBytes(oneDriveMeta.size)}</span>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-xs text-ink-muted py-3 text-center space-y-1">
                <div>{t('cloud_od_not_connected')}</div>
                {#if !ONEDRIVE_CLIENT_ID}
                  <div class="text-[10px] text-signal font-mono">
                    {t('cloud_od_missing_env')}
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
                title={!ONEDRIVE_CLIENT_ID ? t('cloud_od_connect_title_missing') : t('cloud_od_connect_title')}
              >
                <span class="material-symbols-outlined text-sm">cloud</span>
                <span>{ONEDRIVE_CLIENT_ID ? t('cloud_od_connect_btn') : t('cloud_od_unconfigured_btn')}</span>
              </button>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onclick={handleOneDriveBackup}
                  disabled={isLoading}
                  title={t('cloud_od_push_title')}
                  class="py-1.5 bg-signal hover:bg-white hover:text-void text-white font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  {t('cloud_push_btn')}
                </button>
                <button
                  type="button"
                  onclick={handleOneDriveRestore}
                  disabled={isLoading || !oneDriveMeta}
                  title={t('cloud_pull_title')}
                  class="py-1.5 bg-chassis hover:bg-ink hover:text-void border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                >
                  {t('cloud_pull_btn')}
                </button>
              </div>
              <button
                type="button"
                onclick={handleOneDriveLogout}
                disabled={isLoading}
                class="w-full text-center py-1 text-[10px] text-ink-dim hover:text-signal transition-colors cursor-pointer"
              >
                {t('cloud_od_disconnect_btn')}
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
                  {t('cloud_account_label', { account: `${googleUser.name} (${googleUser.email})` })}
                </div>
                <div class="text-[10px] text-ink-muted flex justify-between">
                  <span>{t('cloud_snapshot_time')}</span>
                  <span class="text-[#00f0ff]">{formatDateTime(googleMeta?.modifiedTime)}</span>
                </div>
                {#if googleMeta?.size}
                  <div class="text-[10px] text-ink-muted flex justify-between">
                    <span>{t('cloud_payload_size')}</span>
                    <span class="text-ink">{formatBytes(googleMeta.size)}</span>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-xs text-ink-muted py-2 space-y-1 text-center">
                <div>{t('cloud_gd_not_connected')}</div>
                <div class="text-[10px] text-primary-container">
                  {t('cloud_gd_scope_hint')}
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
                title={!GOOGLE_CLIENT_ID ? t('cloud_gd_connect_title_missing') : t('cloud_gd_connect_title')}
              >
                <span class="material-symbols-outlined text-sm">cloud</span>
                <span>{GOOGLE_CLIENT_ID ? t('cloud_gd_connect_btn') : t('cloud_gd_unconfigured_btn')}</span>
              </button>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onclick={handleGoogleBackup}
                  disabled={isLoading}
                  title={t('cloud_gd_push_title')}
                  class="py-1.5 bg-[#00f0ff] hover:bg-white text-[#050505] font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  {t('cloud_push_btn')}
                </button>
                <button
                  type="button"
                  onclick={handleGoogleRestore}
                  disabled={isLoading || !googleMeta}
                  title={t('cloud_pull_title')}
                  class="py-1.5 bg-chassis hover:bg-ink hover:text-void border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                >
                  {t('cloud_pull_btn')}
                </button>
              </div>
              <button
                type="button"
                onclick={handleGoogleLogout}
                disabled={isLoading}
                class="w-full text-center py-1 text-[10px] text-ink-dim hover:text-[#00f0ff] transition-colors cursor-pointer"
              >
                {t('cloud_gd_disconnect_btn')}
              </button>
            {/if}
          </div>
        </div>

      </div>

      <!-- 本機離線檔案備份與還原艙 (無須帳號之跨裝置/iCloud 備份方案) -->
      <div
        role="region"
        aria-label={t('cloud_local_aria')}
        ondragover={(e) => {
          e.preventDefault();
          isDragOver = true;
        }}
        ondragleave={() => (isDragOver = false)}
        ondrop={handleFileDrop}
        class="p-3.5 border border-dashed transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 {isDragOver ? 'border-signal bg-signal/10' : 'border-wire bg-void/50'}"
      >
        <input
          bind:this={fileInputEl}
          type="file"
          accept=".json,application/json"
          onchange={handleFileInputChange}
          class="hidden"
        />
        <div class="space-y-0.5 min-w-0">
          <div class="text-[10px] text-ink-dim uppercase tracking-wider flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[13px] text-signal">hard_drive</span>
            <span>{t('cloud_local_header')}</span>
          </div>
          <p class="text-[11px] font-sans text-ink-muted leading-snug">
            {t('cloud_local_desc')}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={handleLocalExport}
            disabled={isLoading || localArtistsCount === 0}
            class="px-3 py-1.5 bg-chassis hover:bg-ink hover:text-void border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            <span class="material-symbols-outlined text-[14px]">download</span>
            <span>{t('cloud_local_export')}</span>
          </button>
          <button
            type="button"
            onclick={() => fileInputEl?.click()}
            disabled={isLoading}
            class="px-3 py-1.5 bg-panel hover:bg-signal hover:text-white hover:border-signal border border-wire text-ink font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            <span class="material-symbols-outlined text-[14px]">upload_file</span>
            <span>{t('cloud_local_import')}</span>
          </button>
        </div>
      </div>

      <!-- 底部安全與雙向同步說明 -->
      <div class="text-[10px] text-ink-dim border-t border-wire pt-3 flex items-center justify-between">
        <span>{t('cloud_footer_lww')}</span>
        <div class="flex items-center gap-3">
          <a
            href="/privacy"
            class="text-ink-muted hover:text-signal transition-colors underline"
            title={t('cloud_privacy_title')}
          >
            {t('cloud_privacy_link')}
          </a>
          <span class="text-ink-muted">CLOUD_VAULT // v2.0</span>
        </div>
      </div>

    </div>
  </div>
{/if}
