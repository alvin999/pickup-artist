<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { X, Radio, ArrowLeft, Disc3, Check, Loader2 } from 'lucide-svelte';
  import { searchAppleMusicCandidates, type ArtistCandidate } from '$lib/utils/appleMusic';

  interface Props {
    open: boolean;
    onclose: () => void;
    onpickup: (nameOrUrl: string, candidate?: ArtistCandidate) => void;
  }

  let {
    open = false,
    onclose,
    onpickup
  }: Props = $props();

  let pickupInput = $state('');
  let isSearching = $state(false);
  let candidates = $state<ArtistCandidate[]>([]);
  let step = $state<'input' | 'disambiguation'>('input');

  function resetState() {
    pickupInput = '';
    isSearching = false;
    candidates = [];
    step = 'input';
  }

  function handleClose() {
    resetState();
    onclose();
  }

  async function handleSubmit() {
    const trimmed = pickupInput.trim();
    if (!trimmed) return;

    // 若為 URL 直接存入
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      commitPickup(trimmed);
      return;
    }

    // 搜尋候選名單以解決同名重複問題
    isSearching = true;
    try {
      const results = await searchAppleMusicCandidates(trimmed);
      if (results.length > 1) {
        candidates = results;
        step = 'disambiguation';
      } else if (results.length === 1) {
        commitPickup(results[0].name, results[0]);
      } else {
        commitPickup(trimmed);
      }
    } catch {
      commitPickup(trimmed);
    } finally {
      isSearching = false;
    }
  }

  function commitPickup(name: string, candidate?: ArtistCandidate) {
    onpickup(name, candidate);
    handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in font-mono">
    <!-- 背景遮罩點擊關閉 -->
    <button
      type="button"
      aria-label="關閉彈窗"
      onclick={handleClose}
      class="absolute inset-0 w-full h-full bg-void/85 backdrop-blur-md cursor-default border-0"
    ></button>

    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="crosshair-box bg-[#0c0d11] border border-[#262832] p-5 sm:p-6 max-w-lg w-full shadow-[0_0_36px_rgba(255,42,60,0.25)] flex flex-col gap-4 relative z-10 rounded-[3px]"
    >
      <!-- 關閉按鈕 -->
      <button
        type="button"
        onclick={handleClose}
        class="absolute top-4 right-4 text-ink-muted hover:text-signal cursor-pointer transition-colors"
      >
        <X class="w-4 h-4" />
      </button>

      {#if step === 'input'}
        <!-- 第一階段：輸入藝人或連結 -->
        <div class="flex items-center gap-2 text-xs text-signal">
          <span class="w-2 h-2 rounded-full bg-signal animate-pulse"></span>
          <span class="font-dot text-sm font-bold tracking-widest uppercase">FAST ACK // 藝人知悉終端</span>
        </div>

        <p class="font-sans text-xs text-[#8e929d] leading-relaxed">
          輸入音樂人、樂團名稱，或直接貼上 Apple Music 分享連結。系統將自動比對藝人脈絡並等候聲學深度解剖。
        </p>

        <!-- 終端輸入框 -->
        <div class="flex items-center px-3.5 py-2.5 bg-[#121318] border border-[#2b2d36] hover:border-[#434755] focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30 transition-all font-mono rounded-[2px]">
          <span class="text-signal text-xs mr-2 font-bold select-none">&gt;_</span>
          <input
            type="text"
            bind:value={pickupInput}
            onkeydown={(e) => e.key === 'Enter' && !isSearching && handleSubmit()}
            disabled={isSearching}
            placeholder="輸入音樂人名稱（如 Oasis、落日飛車...）"
            class="bg-transparent text-xs text-[#f4f4f6] placeholder-[#8e929d] focus:outline-none w-full font-mono tracking-wide disabled:opacity-50"
          />
        </div>

        <!-- 動作列 -->
        <div class="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onclick={handleClose}
            class="px-3 py-1.5 text-xs text-ink-muted hover:text-ink font-mono cursor-pointer transition-colors"
          >
            [ESC] 取消
          </button>
          <button
            type="button"
            onclick={handleSubmit}
            disabled={isSearching || !pickupInput.trim()}
            class="corner-cut-sm flex items-center gap-1.5 px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {#if isSearching}
              <Loader2 class="w-3.5 h-3.5 animate-spin" />
              <span>比對脈絡中...</span>
            {:else}
              <Radio class="w-3.5 h-3.5" />
              <span>立即知悉入庫</span>
            {/if}
          </button>
        </div>

      {:else}
        <!-- 第二階段：同名候選人選取矩陣 (Disambiguation Matrix) -->
        <div class="flex items-center justify-between border-b border-[#21232d] pb-2.5">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-signal animate-ping"></span>
            <span class="font-dot text-xs text-signal tracking-widest uppercase">DISAMBIGUATION // 重名排歧</span>
          </div>
          <span class="font-mono text-[10px] text-[#8e929d]">發現 {candidates.length} 筆同名/相似結果</span>
        </div>

        <p class="font-sans text-xs text-[#b4b7c2]">
          資料庫偵測到多位同名藝人，請點選您想收錄的目標：
        </p>

        <!-- 候選卡片格架 -->
        <div class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          {#each candidates as c}
            <button
              type="button"
              onclick={() => commitPickup(c.name, c)}
              class="group flex items-center justify-between p-2.5 bg-[#14151b] hover:bg-[#1c1d25] border border-[#262833] hover:border-signal/70 transition-all text-left cursor-pointer rounded-[2px]"
            >
              <div class="flex items-center gap-3 min-w-0">
                {#if c.coverImage}
                  <img
                    src={c.coverImage}
                    alt={c.name}
                    class="w-11 h-11 object-cover rounded-[2px] border border-[#303340] shrink-0"
                  />
                {:else}
                  <div class="w-11 h-11 bg-[#1a1b22] border border-[#303340] flex items-center justify-center shrink-0">
                    <Disc3 class="w-5 h-5 text-ink-muted group-hover:text-signal transition-colors" />
                  </div>
                {/if}
                <div class="min-w-0 flex flex-col">
                  <span class="font-bold text-xs text-[#f4f4f6] group-hover:text-signal transition-colors truncate">
                    {c.name}
                  </span>
                  <span class="font-sans text-[11px] text-[#8e929d] truncate">
                    {#if c.albumTitle}
                      代表作：《{c.albumTitle}》
                    {/if}
                    {#if c.releaseYear}
                      ({c.releaseYear})
                    {/if}
                  </span>
                  {#if c.primaryGenre}
                    <span class="font-mono text-[9px] text-[#a4a8b5] tracking-wider mt-0.5">
                      GENRE // {c.primaryGenre.toUpperCase()}
                    </span>
                  {/if}
                </div>
              </div>

              <div class="shrink-0 ml-3 flex items-center gap-1 text-[11px] font-mono text-ink-dim group-hover:text-signal transition-colors">
                <span class="hidden sm:inline">鎖定</span>
                <Check class="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          {/each}
        </div>

        <!-- 底部退回或自訂 -->
        <div class="pt-2 border-t border-[#21232d] flex items-center justify-between font-mono text-xs">
          <button
            type="button"
            onclick={() => (step = 'input')}
            class="flex items-center gap-1 text-[#8e929d] hover:text-[#f4f4f6] cursor-pointer transition-colors"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>重新輸入</span>
          </button>

          <button
            type="button"
            onclick={() => commitPickup(pickupInput.trim())}
            class="text-[11px] text-[#8e929d] hover:text-signal underline underline-offset-4 cursor-pointer transition-colors"
          >
            皆不符合？直接以此自訂名稱知悉
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
