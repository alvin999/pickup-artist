<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import SunkenInput from '$lib/components/SunkenInput.svelte';
  import { X, Radio } from 'lucide-svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    onpickup: (nameOrUrl: string) => void;
  }

  let {
    open = false,
    onclose,
    onpickup
  }: Props = $props();

  let pickupInput = $state('');

  function handleSubmit() {
    if (!pickupInput.trim()) return;
    onpickup(pickupInput.trim());
    pickupInput = '';
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
    <!-- 背景遮罩點擊關閉 -->
    <button
      type="button"
      aria-label="關閉彈窗"
      onclick={onclose}
      class="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm cursor-default border-0"
    ></button>

    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="bg-[#0E1013] border border-[#E0A96D]/50 rounded-[4px] p-6 max-w-lg w-full shadow-[0_0_32px_rgba(224,169,109,0.25)] flex flex-col gap-4 relative z-10"
    >
      <!-- 關閉按鈕 -->
      <button
        type="button"
        onclick={onclose}
        class="absolute top-4 right-4 text-[#8E9298] hover:text-[#EEF0F2] cursor-pointer"
      >
        <X class="w-5 h-5" />
      </button>

      <!-- 標題與聲學提示 -->
      <div class="flex items-center gap-2 font-mono text-xs text-[#FEC486]">
        <span class="w-2 h-2 rounded-full bg-[#FA383E] animate-ping"></span>
        <span class="font-bold tracking-wider uppercase">FAST PICKUP // 零延遲拾音</span>
      </div>

      <p class="font-sans text-xs text-[#8E9298]">
        隨手輸入音樂人、樂團名稱，或直接貼上 Apple Music 分享連結。系統將以 &lt;50ms 寫入本地 IndexedDB 並等候背景同步。
      </p>

      <!-- 凹槽輸入框 -->
      <SunkenInput
        bind:value={pickupInput}
        label="按 ENTER 或點擊確認完成拾音"
        placeholder={t('pickup_placeholder')}
        onenter={handleSubmit}
      />

      <!-- 動作列 -->
      <div class="flex items-center justify-end gap-2 pt-2">
        <TactileButton variant="ghost" size="md" onclick={onclose}>
          取消
        </TactileButton>
        <TactileButton variant="amber" size="md" onclick={handleSubmit}>
          <Radio class="w-4 h-4 mr-1.5 text-[#E0A96D]" />
          立即拾音入庫
        </TactileButton>
      </div>
    </div>
  </div>
{/if}
