<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  interface Props {
    activeView: 'crate-digger' | 'honeycomb-cluster' | string;
    onselectView: (view: 'crate-digger' | 'honeycomb-cluster') => void;
    onopenPickupModal: () => void;
    searchQuery: string;
    onsearchChange: (q: string) => void;
  }

  let {
    activeView = 'crate-digger',
    onselectView,
    onopenPickupModal,
    searchQuery = $bindable(''),
    onsearchChange
  }: Props = $props();
</script>

<header class="fixed top-0 left-0 lg:left-64 right-0 z-30 bg-[#0D0E11]/95 backdrop-blur-md border-b border-[#1F2228] shadow-[0_1px_8px_rgba(0,0,0,0.5)] h-16">
  <div class="h-full px-4 md:px-6 flex items-center justify-between gap-4">
    <!-- 左側：標題銘牌與主視圖切換器 -->
    <div class="flex items-center gap-4 sm:gap-6">
      <div class="flex flex-col">
        <span class="font-serif text-lg font-bold text-[#EEF0F2] tracking-tight leading-tight">
          {t('app_title')}
        </span>
        <span class="font-mono text-[9px] text-[#FEC486] tracking-widest uppercase font-semibold">
          PICKUP ARTIST // STUDIO LAB
        </span>
      </div>

      <div class="hidden sm:block h-6 w-px bg-[#1F2228]"></div>

      <!-- 核心雙視圖切換切換器 (Crate Digger vs Honeycomb Cluster) -->
      <nav class="hidden md:flex items-center p-0.5 bg-[#040405] rounded-[3px] border border-[#1F2228]">
        <button
          type="button"
          onclick={() => onselectView('crate-digger')}
          class="px-3 py-1 rounded-[2px] transition-all font-mono text-xs cursor-pointer flex items-center gap-1.5 {activeView === 'crate-digger' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/30 shadow-sm' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          <span class="material-symbols-outlined text-[16px]">album</span>
          <span>唱片架庫存 (Crate Digger)</span>
        </button>

        <button
          type="button"
          onclick={() => onselectView('honeycomb-cluster')}
          class="px-3 py-1 rounded-[2px] transition-all font-mono text-xs cursor-pointer flex items-center gap-1.5 {activeView === 'honeycomb-cluster' ? 'bg-[#1C2027] text-[#FEC486] font-bold border border-[#E0A96D]/30 shadow-sm' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
        >
          <span class="material-symbols-outlined text-[16px]">hub</span>
          <span>蜂巢聲學星系 (Honeycomb Cluster)</span>
        </button>
      </nav>
    </div>

    <!-- 中間：全域搜尋槽 (Sunken Search Bar) -->
    <div class="flex-1 max-w-sm mx-2 hidden xl:block">
      <div class="flex items-center px-3 py-1.5 bg-[#040405] rounded-[3px] border border-[#1F2228] shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)] focus-within:border-[#E0A96D]">
        <span class="material-symbols-outlined text-[16px] text-[#52565E] mr-2">search</span>
        <input
          type="text"
          bind:value={searchQuery}
          oninput={(e) => onsearchChange((e.target as HTMLInputElement).value)}
          placeholder={t('search_placeholder')}
          class="bg-transparent font-sans text-xs flex-1 text-[#EEF0F2] placeholder-[#52565E] focus:outline-none"
        />
        <kbd class="px-1.5 py-0.5 bg-[#14161A] border border-[#252930] rounded text-[10px] text-[#8E9298] font-mono select-none">
          Cmd+K
        </kbd>
      </div>
    </div>

    <!-- 右側：AI 狀態、雲端狀態與快速拾音動作按鈕 -->
    <div class="flex items-center gap-2.5 sm:gap-3.5">
      <!-- AI 狀態標籤 -->
      <div class="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 bg-[#14161A] border border-[#1F2228] rounded-[3px] font-mono text-[10px] text-[#8E9298]">
        <span class="w-1.5 h-1.5 rounded-full bg-[#E0A96D] animate-ping"></span>
        <span>Groq Llama-3.3 // Gemini 2.0</span>
      </div>

      <!-- 雲端同步狀態標籤 -->
      <div class="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-[#14161A] border border-[#1F2228] rounded-[3px] font-mono text-[10px] text-[#8E9298]">
        <span class="material-symbols-outlined text-[14px] text-[#63C78B]">cloud_done</span>
        <span class="truncate max-w-[130px]">drive.appdata: pua_library.json</span>
      </div>

      <!-- 拾音收件按鈕 (Master Crimson) -->
      <button
        type="button"
        onclick={onopenPickupModal}
        class="flex items-center gap-1 px-3 sm:px-4 py-1.5 bg-[#FA383E] text-white rounded-[3px] font-mono text-xs font-bold uppercase tracking-wider shadow-[0_0_16px_rgba(250,56,62,0.25)] hover:bg-[#E0262C] transition-all cursor-pointer active:translate-y-[1px]"
      >
        <span class="material-symbols-outlined text-[16px]">add</span>
        <span>拾音收件</span>
      </button>

      <!-- 語言切換 -->
      <LanguageToggle />
    </div>
  </div>
</header>
