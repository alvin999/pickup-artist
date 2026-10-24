<script lang="ts">
  import { i18n, type SupportedLocale } from '$lib/i18n/index.svelte';
  import { ChevronDown } from 'lucide-svelte';

  const locales: { id: SupportedLocale; shortLabel: string; label: string }[] = [
    { id: 'zh-TW', shortLabel: '繁中', label: '繁體中文' },
    { id: 'en', shortLabel: 'EN', label: 'English' },
    { id: 'ja', shortLabel: '日語', label: '日本語' }
  ];

  let isOpen = $state(false);
  let containerEl: HTMLElement | null = $state(null);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const currentLocale = $derived(
    locales.find((l) => l.id === i18n.locale) || locales[0]
  );

  function handleSelect(id: SupportedLocale) {
    i18n.setLocale(id);
    isOpen = false;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function handleMouseEnter() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    isOpen = true;
  }

  function handleMouseLeave() {
    if (closeTimer) clearTimeout(closeTimer);
    // 預留 280ms 平滑過渡緩衝，避免滑鼠劃向選單時因微距空隙而意外關閉
    closeTimer = setTimeout(() => {
      isOpen = false;
      closeTimer = null;
    }, 280);
  }

  function handleWindowClick(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      isOpen = false;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div
  bind:this={containerEl}
  role="region"
  aria-label="語言切換選單"
  class="relative inline-block select-none"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <!-- 觸發按鈕 (無 icon，純文字標籤 + 向量微型箭頭，光學居中對齊) -->
  <button
    type="button"
    onclick={() => {
      if (closeTimer) clearTimeout(closeTimer);
      isOpen = !isOpen;
    }}
    title="切換介面語言 (Switch Language)"
    class="flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-chassis hover:bg-[#15161e] border border-wire hover:border-wire-bright text-ink-muted hover:text-ink font-mono text-[11px] rounded-[2px] transition-all cursor-pointer shadow-inner"
  >
    <span class="font-bold text-ink leading-none">{currentLocale.shortLabel}</span>
    <ChevronDown class="w-3 h-3 text-ink-dim transition-transform duration-200 {isOpen ? 'rotate-180 text-signal' : ''}" />
  </button>

  <!-- 下拉浮動面板 (附帶 before: 透明接觸橋樑，徹底防止滑鼠脫焦閃退) -->
  {#if isOpen}
    <div
      role="menu"
      aria-orientation="vertical"
      tabindex="-1"
      class="absolute right-0 top-full pt-1.5 w-32 z-50 animate-in fade-in zoom-in-95 duration-150 font-mono"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
    >
      <!-- 向上延伸 10px 透明感應遮罩，消除按鈕與下拉選單之間的死角 -->
      <div class="before:absolute before:-top-2.5 before:left-0 before:right-0 before:h-3 before:content-['']"></div>

      <div class="bg-[#0c0d12]/95 backdrop-blur-xl border border-[#2b2d36] shadow-[0_8px_24px_rgba(0,0,0,0.85)] rounded-[2px] py-1">
        <div class="px-2.5 py-1 border-b border-wire/60 text-[9px] text-ink-dim uppercase tracking-wider flex items-center justify-between">
          <span>LOCALE // 語系</span>
        </div>

        <div class="flex flex-col py-0.5">
          {#each locales as item}
            {@const isSelected = i18n.locale === item.id}
            <button
              type="button"
              onclick={() => handleSelect(item.id)}
              class="w-full text-left px-2.5 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer {isSelected ? 'bg-signal/15 text-signal font-bold' : 'text-ink-muted hover:text-ink hover:bg-panel'}"
            >
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full {isSelected ? 'bg-signal shadow-[0_0_6px_rgba(255,42,60,0.8)]' : 'bg-transparent'}"></span>
                <span>{item.label}</span>
              </div>
              <span class="text-[9px] font-mono {isSelected ? 'text-signal font-bold' : 'text-ink-dim'}">
                {item.shortLabel}
              </span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
