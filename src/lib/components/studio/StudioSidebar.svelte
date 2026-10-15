<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';

  interface Props {
    activeView: 'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log';
    onselectView: (view: 'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log') => void;
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

<aside class="fixed left-0 top-0 h-full w-60 bg-chassis/95 backdrop-blur-xl border-r border-wire z-40 flex flex-col justify-between select-none">
  <div>
    <!-- 頂部系統狀態模組 -->
    <div class="h-16 px-4 border-b border-wire flex flex-col justify-center bg-void/60">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-signal animate-ping"></span>
          <span class="w-2 h-2 rounded-full bg-signal -ml-4"></span>
          <span class="font-dot text-xs tracking-[0.2em] text-ink uppercase">SYS.TELEMETRY</span>
        </div>
        <span class="font-mono text-[10px] px-1.5 py-0.5 border border-signal/50 text-signal bg-signal-dim">ONLINE</span>
      </div>
      <div class="font-mono text-[9px] text-ink-dim mt-1 flex justify-between">
        <span>NODE // TW-TPE-04</span>
        <span>LATENCY: 4.2ms</span>
      </div>
    </div>

    <!-- 儲存陣列監控 (Storage Matrix) -->
    <div class="p-4 border-b border-wire border-dashed bg-panel/40">
      <div class="flex items-center justify-between font-mono text-[10px] text-ink-muted mb-1.5">
        <span>[STORAGE_ARRAY]</span>
        <span class="text-ink font-bold">{totalArtistsCount} ARTISTS</span>
      </div>
      <div class="font-dot text-xs text-signal tracking-wider mb-2">FLAC // 24BIT-192KHZ</div>
      <!-- 點陣式進度條 -->
      <div class="grid grid-cols-12 gap-0.5 h-2 bg-void p-0.5 border border-wire">
        <div class="bg-ink"></div><div class="bg-ink"></div><div class="bg-ink"></div><div class="bg-ink"></div>
        <div class="bg-ink"></div><div class="bg-ink"></div><div class="bg-ink"></div><div class="bg-signal"></div>
        <div class="bg-signal/40"></div><div class="bg-wire"></div><div class="bg-wire"></div><div class="bg-wire"></div>
      </div>
      <div class="flex justify-between font-mono text-[9px] text-ink-dim mt-1.5">
        <span>0%</span>
        <span>SECTORS: 8,492</span>
        <span>100%</span>
      </div>
    </div>

    <!-- 導覽矩陣 -->
    <div class="p-3">
      <div class="font-mono text-[9px] text-ink-dim uppercase tracking-[0.2em] px-2 mb-2">// MODULE_SELECT</div>
      <nav class="flex flex-col gap-1 font-mono text-xs">
        <button
          type="button"
          onclick={() => onselectView('crate-digger')}
          class="w-full group flex items-center justify-between px-3 py-2.5 transition-all text-left {activeView === 'crate-digger' ? 'bg-ink text-void font-bold tracking-wider' : 'text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[16px]">album</span>
            <span>01_藝人展間</span>
          </div>
          {#if activeView === 'crate-digger'}
            <span class="font-dot text-[10px] bg-signal text-white px-1">[ACT]</span>
          {:else if inboxCount > 0}
            <span class="font-mono text-[9px] text-signal font-bold">[{inboxCount}]</span>
          {/if}
        </button>

        <button
          type="button"
          onclick={() => onselectView('honeycomb-cluster')}
          class="w-full group flex items-center justify-between px-3 py-2.5 transition-all text-left {activeView === 'honeycomb-cluster' ? 'bg-ink text-void font-bold tracking-wider' : 'text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[16px] {activeView === 'honeycomb-cluster' ? 'text-void' : 'text-ink-dim group-hover:text-signal'}">hub</span>
            <span>02_藝人星系</span>
          </div>
          <span class="text-[9px] {activeView === 'honeycomb-cluster' ? 'text-void font-bold' : 'text-ink-dim'}">HEX</span>
        </button>

        <button
          type="button"
          onclick={() => onselectView('acoustic-matrix')}
          class="w-full group flex items-center justify-between px-3 py-2.5 transition-all text-left {activeView === 'acoustic-matrix' ? 'bg-ink text-void font-bold tracking-wider' : 'text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[16px] {activeView === 'acoustic-matrix' ? 'text-void' : 'text-ink-dim group-hover:text-signal'}">category</span>
            <span>03_風格矩陣</span>
          </div>
          <span class="text-[9px] {activeView === 'acoustic-matrix' ? 'text-void font-bold' : 'text-ink-dim'}">MTX</span>
        </button>

        <button
          type="button"
          onclick={() => onselectView('listening-queue')}
          class="w-full group flex items-center justify-between px-3 py-2.5 transition-all text-left {activeView === 'listening-queue' ? 'bg-ink text-void font-bold tracking-wider' : 'text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[16px] {activeView === 'listening-queue' ? 'text-void' : 'text-ink-dim group-hover:text-signal'}">queue_music</span>
            <span>04_聆賞隊列</span>
          </div>
          <span class="text-[9px] {activeView === 'listening-queue' ? 'text-void font-bold' : 'text-ink-dim'}">QUE</span>
        </button>

        <button
          type="button"
          onclick={() => onselectView('listening-log')}
          class="w-full group flex items-center justify-between px-3 py-2.5 transition-all text-left {activeView === 'listening-log' ? 'bg-ink text-void font-bold tracking-wider' : 'text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire'}"
        >
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[16px] {activeView === 'listening-log' ? 'text-void' : 'text-ink-dim group-hover:text-signal'}">edit_note</span>
            <span>05_聆賞日誌</span>
          </div>
          <span class="text-[9px] {activeView === 'listening-log' ? 'text-void font-bold' : 'text-ink-dim'}">LOG</span>
        </button>
      </nav>
    </div>
  </div>

  <!-- 底部資料庫狀態與硬體銘牌 -->
  <div class="p-4 border-t border-wire bg-void/80 font-mono">
    <div class="border border-wire p-2.5 bg-chassis relative">
      <div class="flex items-center justify-between text-[10px] text-ink-muted">
        <span>DB_MOUNT</span>
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
      </div>
      <div class="text-xs text-ink font-bold tracking-tight mt-0.5">PUA_LIBRARY.JSON</div>
      <div class="text-[9px] text-ink-dim mt-2 pt-1.5 border-t border-wire border-dashed flex justify-between">
        <span>REV: 2026.10</span>
        <span class="text-signal">SHA-256</span>
      </div>
    </div>
  </div>
</aside>

