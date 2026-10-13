<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    activeView: 'crate-digger' | 'honeycomb-cluster' | 'lossless-matrix' | 'hardware-racks' | 'telemetry-audit';
    onselectView: (view: 'crate-digger' | 'honeycomb-cluster' | 'lossless-matrix' | 'hardware-racks' | 'telemetry-audit') => void;
    totalArtistsCount?: number;
    inboxCount?: number;
  }

  let {
    activeView = 'crate-digger',
    onselectView,
    totalArtistsCount = 6,
    inboxCount = 2
  }: Props = $props();
</script>

<aside class="fixed left-0 top-0 h-full w-64 bg-[#0D0E11] border-r border-[#1F2228] z-40 flex flex-col justify-between py-4 shadow-[0_1px_8px_rgba(0,0,0,0.4)] select-none">
  <!-- 上半部：系統狀態與容量指標 -->
  <div class="flex flex-col gap-4">
    <!-- 系統連線狀態 -->
    <div class="px-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-[#FEC486] animate-pulse shadow-[0_0_8px_rgba(254,196,134,0.8)]"></span>
        <span class="font-mono text-[10px] text-[#8E9298] tracking-widest uppercase font-medium">SYSTEM STATUS</span>
      </div>
      <span class="font-mono text-[10px] text-[#FEC486] font-bold tracking-wider">ONLINE</span>
    </div>

    <!-- 儲存空間配額指示器 (STORAGE ARCHIVE) -->
    <div class="px-4">
      <div class="p-3 bg-[#15171C] rounded-[4px] border border-[#1F2228] flex flex-col gap-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
        <div class="flex items-center justify-between font-mono text-[10px] text-[#8E9298] uppercase">
          <span>STORAGE ARCHIVE</span>
          <span class="text-[#63C78B]">IDB // OK</span>
        </div>
        <div class="flex items-center justify-between font-mono text-xs">
          <span class="text-[#E3E2E6] font-medium">FLAC / 24-192</span>
          <span class="text-[#FEC486] font-bold font-tabular">1.42 TB</span>
        </div>
        <div class="w-full h-1 bg-[#090A0D] rounded-full overflow-hidden mt-0.5 border border-[#1F2228]">
          <div class="h-full bg-[#E0A96D] w-2/3 shadow-[0_0_8px_rgba(224,169,109,0.7)]"></div>
        </div>
      </div>
    </div>

    <!-- 主導航選單 (Studio Navigation) -->
    <nav class="flex flex-col px-2.5 gap-1">
      <button
        type="button"
        onclick={() => onselectView('crate-digger')}
        class="w-full flex items-center justify-between px-3.5 py-2 rounded-[3px] transition-all font-mono text-xs cursor-pointer {activeView === 'crate-digger' ? 'bg-[#1E222A] text-[#FEC486] border border-[#E0A96D]/40 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.7)]' : 'text-[#8E9298] hover:bg-[#14161A] hover:text-[#EEF0F2] border border-transparent'}"
      >
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-[19px] {activeView === 'crate-digger' ? 'text-[#FEC486]' : 'text-[#8E9298]'}">album</span>
          <span>唱片架庫存 (Crates)</span>
        </div>
        {#if inboxCount > 0}
          <span class="px-1.5 py-0.2 rounded-full text-[9px] bg-[#FA383E]/20 text-[#FA383E] border border-[#FA383E]/40 font-bold">
            {inboxCount}
          </span>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => onselectView('honeycomb-cluster')}
        class="w-full flex items-center justify-between px-3.5 py-2 rounded-[3px] transition-all font-mono text-xs cursor-pointer {activeView === 'honeycomb-cluster' ? 'bg-[#1E222A] text-[#FEC486] border border-[#E0A96D]/40 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.7)]' : 'text-[#8E9298] hover:bg-[#14161A] hover:text-[#EEF0F2] border border-transparent'}"
      >
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-[19px] {activeView === 'honeycomb-cluster' ? 'text-[#FEC486]' : 'text-[#8E9298]'}">hub</span>
          <span>聲學蜂巢星系 (Cluster)</span>
        </div>
        <span class="w-1.5 h-1.5 rounded-full bg-[#E0A96D]"></span>
      </button>

      <button
        type="button"
        onclick={() => onselectView('lossless-matrix')}
        class="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-[3px] transition-all font-mono text-xs cursor-pointer {activeView === 'lossless-matrix' ? 'bg-[#1E222A] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'text-[#8E9298] hover:bg-[#14161A] hover:text-[#EEF0F2] border border-transparent'}"
      >
        <span class="material-symbols-outlined text-[19px]">graphic_eq</span>
        <span>母帶矩陣 (Matrix)</span>
      </button>

      <button
        type="button"
        onclick={() => onselectView('hardware-racks')}
        class="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-[3px] transition-all font-mono text-xs cursor-pointer {activeView === 'hardware-racks' ? 'bg-[#1E222A] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'text-[#8E9298] hover:bg-[#14161A] hover:text-[#EEF0F2] border border-transparent'}"
      >
        <span class="material-symbols-outlined text-[19px]">settings_input_component</span>
        <span>硬體機架 (Racks)</span>
      </button>

      <button
        type="button"
        onclick={() => onselectView('telemetry-audit')}
        class="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-[3px] transition-all font-mono text-xs cursor-pointer {activeView === 'telemetry-audit' ? 'bg-[#1E222A] text-[#FEC486] border border-[#E0A96D]/40 font-bold' : 'text-[#8E9298] hover:bg-[#14161A] hover:text-[#EEF0F2] border border-transparent'}"
      >
        <span class="material-symbols-outlined text-[19px]">monitoring</span>
        <span>頻譜分析 (Telemetry)</span>
      </button>
    </nav>
  </div>

  <!-- 下半部：雲端封裝與庫存狀態 -->
  <div class="px-4 flex flex-col gap-2">
    <div class="p-3 bg-[#131519] border border-[#1F2228] rounded-[4px]">
      <div class="font-mono text-[10px] text-[#8E9298] uppercase tracking-wider">PUA_LIBRARY.JSON</div>
      <div class="font-mono text-[10px] text-[#CCCFD6] flex items-center gap-1.5 mt-1 font-medium">
        <span class="w-1.5 h-1.5 rounded-full bg-[#E0A96D]"></span>
        <span>REV: 2026.04 // SYNC READY</span>
      </div>
    </div>
  </div>
</aside>
