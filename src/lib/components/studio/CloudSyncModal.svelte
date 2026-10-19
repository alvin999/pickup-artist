<script lang="ts">
  import { onMount } from 'svelte';
  import type { AccountInfo } from '@azure/msal-browser';
  import {
    getActiveAccount,
    loginToOneDrive,
    logoutOneDrive,
    uploadBackupToOneDrive,
    restoreBackupFromOneDrive,
    getCloudBackupMetadata,
    clearMsalInteractionLocks,
    syncFromCloudOnStartup,
    type CloudMetadata
  } from '$lib/services/onedrive';

  interface Props {
    isOpen: boolean;
    onclose: () => void;
    onRestored?: () => Promise<void>;
    localArtistsCount: number;
    onAccountChange?: (connected: boolean) => void;
  }

  let { isOpen, onclose, onRestored, localArtistsCount, onAccountChange }: Props = $props();

  let account = $state<AccountInfo | null>(null);
  let cloudMeta = $state<CloudMetadata | null>(null);
  let isLoading = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusType = $state<'info' | 'success' | 'error'>('info');

  onMount(async () => {
    await refreshAccountState();
  });

  $effect(() => {
    if (isOpen) {
      statusMessage = null;
      refreshAccountState();
    }
  });

  async function refreshAccountState() {
    try {
      account = await getActiveAccount();
      onAccountChange?.(!!account);
      if (account) {
        cloudMeta = await getCloudBackupMetadata();
      } else {
        cloudMeta = null;
      }
    } catch (err) {
      console.warn('[CloudSyncModal] Error fetching account:', err);
    }
  }

  async function handleLogin() {
    isLoading = true;
    statusMessage = '正在喚起微軟登入視窗...';
    statusType = 'info';
    try {
      account = await loginToOneDrive();
      onAccountChange?.(true);
      statusMessage = '微軟帳戶連結成功！正在同步雲端資料庫...';
      statusType = 'info';
      await syncFromCloudOnStartup();
      if (onRestored) {
        await onRestored();
      }
      statusMessage = '微軟帳戶連結成功！雲端資料庫已同步完成。';
      statusType = 'success';
      cloudMeta = await getCloudBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || '登入失敗或已取消視窗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  function handleResetLock() {
    clearMsalInteractionLocks();
    statusMessage = '已清除登入鎖定快取，請再次點擊登入。';
    statusType = 'info';
  }

  async function handleLogout() {
    if (!confirm('確定要解除與此微軟帳戶的連結嗎？')) return;
    isLoading = true;
    try {
      await logoutOneDrive();
      account = null;
      cloudMeta = null;
      onAccountChange?.(false);
      statusMessage = '已中斷 OneDrive 連結';
      statusType = 'info';
    } catch (err: any) {
      statusMessage = err?.message || '登出失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleBackup() {
    if (!account) return;
    isLoading = true;
    statusMessage = '正在封裝資料並上傳至 OneDrive...';
    statusType = 'info';
    try {
      const res = await uploadBackupToOneDrive();
      const kb = (res.size / 1024).toFixed(1);
      statusMessage = `備份完成！已寫入 OneDrive 專屬目錄 (${kb} KB)`;
      statusType = 'success';
      cloudMeta = await getCloudBackupMetadata();
    } catch (err: any) {
      statusMessage = err?.message || '上傳失敗，請檢查網路';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore() {
    if (!account) return;
    if (!confirm('警告：從雲端還原將會以雲端資料覆蓋本機目前的藝人資料庫，確定要繼續嗎？')) {
      return;
    }
    isLoading = true;
    statusMessage = '正在從 OneDrive 拉取最新備份封包...';
    statusType = 'info';
    try {
      const res = await restoreBackupFromOneDrive();
      statusMessage = `還原成功！已回復 ${res.restoredCount} 位藝人檔案。`;
      statusType = 'success';
      if (onRestored) {
        await onRestored();
      }
    } catch (err: any) {
      statusMessage = err?.message || '還原失敗';
      statusType = 'error';
    } finally {
      isLoading = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatDateTime(isoOrTimestamp: string | number): string {
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
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-md">
    <!-- 模態視窗主體 -->
    <div
      class="w-full max-w-xl bg-chassis border border-wire p-6 relative font-mono shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col gap-6"
    >
      <!-- 頂部視窗控制欄 -->
      <div class="flex items-center justify-between border-b border-wire pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full {account ? 'bg-signal animate-pulse' : 'bg-wire'}"></span>
          <span class="font-dot text-sm text-ink tracking-[0.2em] uppercase">CLOUD_VAULT // ONEDRIVE</span>
        </div>
        <button
          type="button"
          onclick={onclose}
          class="text-ink-muted hover:text-signal text-sm p-1 transition-colors cursor-pointer"
        >
          [ESC / 關閉]
        </button>
      </div>

      <!-- 系統狀態矩陣 -->
      <div class="grid grid-cols-2 gap-3 bg-void/60 p-4 border border-wire">
        <div>
          <div class="text-[10px] text-ink-dim uppercase tracking-wider">// LOCAL_STORAGE</div>
          <div class="text-sm font-bold text-ink mt-0.5">{localArtistsCount} ARTISTS</div>
          <div class="text-[10px] text-signal mt-1">INDEXED_DB: MOUNTED</div>
        </div>

        <div>
          <div class="text-[10px] text-ink-dim uppercase tracking-wider">// CLOUD_STATUS</div>
          {#if account}
            <div class="text-sm font-bold text-emerald-400 mt-0.5 truncate" title={account.username}>
              {account.username}
            </div>
            <div class="text-[10px] text-ink-muted mt-1 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>TOKEN: ACTIVE</span>
            </div>
          {:else}
            <div class="text-sm font-bold text-ink-muted mt-0.5">未連結帳號</div>
            <div class="text-[10px] text-ink-dim mt-1">OFFLINE</div>
          {/if}
        </div>
      </div>

      <!-- 雲端檔案遙測資訊 -->
      {#if account}
        <div class="border border-wire border-dashed p-3 bg-panel/30 text-xs flex flex-col gap-1.5">
          <div class="flex justify-between text-ink-muted">
            <span>同步模式：</span>
            <span class="text-emerald-400 font-bold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              即時自動同步 (Auto-Sync)
            </span>
          </div>
          <div class="flex justify-between text-ink-muted">
            <span>遠端目錄：</span>
            <span class="text-ink font-bold">OneDrive/Apps/Pickup Artist/</span>
          </div>
          <div class="flex justify-between text-ink-muted">
            <span>上次同步時間：</span>
            <span class="text-signal">
              {cloudMeta?.lastModifiedDateTime ? formatDateTime(cloudMeta.lastModifiedDateTime) : '尚未進行過備份'}
            </span>
          </div>
          {#if cloudMeta}
            <div class="flex justify-between text-ink-muted">
              <span>封包大小：</span>
              <span class="text-ink">{formatBytes(cloudMeta.size)}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- 狀態通知訊息區 -->
      {#if statusMessage}
        <div
          class="p-2.5 text-xs border flex items-center justify-between gap-2 {statusType === 'success' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : statusType === 'error' ? 'bg-signal-dim/30 border-signal text-signal' : 'bg-void border-wire text-ink'}"
        >
          <span class="break-words leading-relaxed">{statusMessage}</span>
          {#if statusType === 'error'}
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

      <!-- 操作按鈕列 -->
      <div class="flex flex-col sm:flex-row gap-3 pt-2 border-t border-wire">
        {#if !account}
          <button
            type="button"
            onclick={handleLogin}
            disabled={isLoading}
            class="w-full flex items-center justify-center gap-2 py-3 bg-signal hover:bg-white hover:text-void text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
          >
            <span class="material-symbols-outlined text-base">cloud</span>
            <span>{isLoading ? '連線中...' : '連結個人微軟帳戶 (ONEDRIVE)'}</span>
          </button>
        {:else}
          <button
            type="button"
            onclick={handleBackup}
            disabled={isLoading}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-signal hover:bg-white hover:text-void text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
          >
            <span class="material-symbols-outlined text-sm">cloud_upload</span>
            <span>上傳備份 (PUSH)</span>
          </button>

          <button
            type="button"
            onclick={handleRestore}
            disabled={isLoading || !cloudMeta}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-panel hover:bg-ink hover:text-void border border-wire text-ink font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="material-symbols-outlined text-sm">cloud_download</span>
            <span>從雲端還原 (PULL)</span>
          </button>

          <button
            type="button"
            onclick={handleLogout}
            disabled={isLoading}
            class="px-3 py-2.5 border border-wire hover:border-signal text-ink-muted hover:text-signal text-xs uppercase transition-colors cursor-pointer"
            title="解除微軟帳戶綁定"
          >
            登出
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
