<script lang="ts">
  import { Lock, X, KeyRound, Loader2, AlertCircle } from 'lucide-svelte';
  import { unlockWithMasterPassword } from '$lib/ai/vault';

  interface Props {
    open: boolean;
    onclose: () => void;
    onunlocked: () => void;
  }

  let { open = false, onclose, onunlocked }: Props = $props();

  let password = $state('');
  let isUnlocking = $state(false);
  let errorMessage = $state('');

  function reset() {
    password = '';
    isUnlocking = false;
    errorMessage = '';
  }

  function handleClose() {
    reset();
    onclose();
  }

  async function handleUnlock() {
    if (!password) {
      errorMessage = '請輸入主密碼';
      return;
    }

    isUnlocking = true;
    errorMessage = '';
    try {
      const res = await unlockWithMasterPassword(password);
      if (res.success) {
        onunlocked();
        handleClose();
      } else {
        errorMessage = res.error || '主密碼不正確';
      }
    } catch (e: any) {
      errorMessage = e?.message || '解密過程異常';
    } finally {
      isUnlocking = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
    <button
      type="button"
      aria-label="關閉"
      onclick={handleClose}
      class="absolute inset-0 w-full h-full bg-void/85 backdrop-blur-md cursor-default border-0"
    ></button>

    <div
      role="dialog"
      aria-modal="true"
      class="crosshair-box bg-[#0c0d11] border border-[#262832] p-5 sm:p-6 max-w-sm w-full shadow-[0_0_36px_rgba(255,42,60,0.25)] flex flex-col gap-4 relative z-10 rounded-[3px]"
    >
      <button
        type="button"
        onclick={handleClose}
        class="absolute top-4 right-4 text-ink-muted hover:text-signal cursor-pointer transition-colors"
      >
        <X class="w-4 h-4" />
      </button>

      <div class="flex items-center gap-2 text-xs text-signal">
        <Lock class="w-4 h-4" />
        <span class="font-dot text-sm font-bold tracking-widest uppercase">
          VAULT UNLOCK // 解鎖發燒友金鑰
        </span>
      </div>

      <p class="font-sans text-xs text-[#8e929d] leading-relaxed">
        AI 聲學解剖需存取受主密碼保護之 API 金鑰。請輸入主密碼以解鎖當前工作階段。
      </p>

      <div class="flex items-center px-3 py-2 bg-void border border-wire focus-within:border-signal">
        <KeyRound class="w-3.5 h-3.5 text-signal mr-2 shrink-0" />
        <input
          type="password"
          bind:value={password}
          onkeydown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder="輸入主密碼..."
          class="bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none w-full font-mono"
        />
      </div>

      {#if errorMessage}
        <div class="flex items-center gap-1.5 text-[11px] text-red-400">
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      {/if}

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onclick={handleClose}
          class="px-3 py-1.5 text-xs text-ink-muted hover:text-ink font-mono cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onclick={handleUnlock}
          disabled={isUnlocking}
          class="corner-cut-sm flex items-center gap-1.5 px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50"
        >
          {#if isUnlocking}
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span>解密中...</span>
          {:else}
            <span>確認解鎖</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
