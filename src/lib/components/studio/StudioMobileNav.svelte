<script lang="ts">
  import { listeningQueue } from '$lib/services/listeningQueue';
  import type { ArtistEntry } from '$lib/types/artist';

  interface Props {
    activeView: 'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log';
    onselectView: (view: 'crate-digger' | 'honeycomb-cluster' | 'acoustic-matrix' | 'listening-queue' | 'listening-log') => void;
    artists?: ArtistEntry[];
  }

  let {
    activeView = 'crate-digger',
    onselectView,
    artists = []
  }: Props = $props();

  // 聆賞隊列動態訂閱
  let isAnyListening = $state(false);
  let pendingQueueCount = $state(0);

  $effect(() => {
    return listeningQueue.subscribe((items) => {
      isAnyListening = items.some((i) => i.status === 'listening');
      pendingQueueCount = items.filter((i) => i.status !== 'completed').length;
    });
  });

  // 導航清單項目定義
  const NAV_ITEMS = [
    {
      id: 'crate-digger',
      num: '01',
      label: '展間',
      icon: 'album'
    },
    {
      id: 'honeycomb-cluster',
      num: '02',
      label: '星系',
      icon: 'hub'
    },
    {
      id: 'acoustic-matrix',
      num: '03',
      label: '矩陣',
      icon: 'category'
    },
    {
      id: 'listening-queue',
      num: '04',
      label: '隊列',
      icon: 'queue_music',
      badge: true
    },
    {
      id: 'listening-log',
      num: '05',
      label: '日誌',
      icon: 'edit_note'
    }
  ] as const;
</script>

<!-- 行動端底部發燒友機架導航欄 (僅在螢幕寬度小於 lg 時顯示) -->
<nav
  aria-label="行動端模組導航"
  class="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-void/95 backdrop-blur-xl border-t border-wire shadow-[0_-4px_24px_rgba(0,0,0,0.85)] font-mono select-none"
  style="padding-bottom: env(safe-area-inset-bottom, 0px);"
>
  <div class="grid grid-cols-5 h-14 items-stretch">
    {#each NAV_ITEMS as item}
      {@const isActive = activeView === item.id}
      <button
        type="button"
        onclick={() => onselectView(item.id)}
        class="group relative flex flex-col items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer active:scale-95 {isActive ? 'bg-panel/80 text-ink' : 'text-ink-dim hover:text-ink hover:bg-panel/30'}"
      >
        <!-- 頂部活動狀態訊號燈指示條 (Signal LED Bar) -->
        {#if isActive}
          <div class="absolute top-0 left-2 right-2 h-0.5 bg-signal shadow-[0_0_8px_rgba(255,42,60,0.9)] animate-in fade-in"></div>
        {/if}

        <div class="relative flex items-center justify-center">
          <!-- Material Symbol 圖示 -->
          <span class="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 {isActive ? 'text-signal scale-105' : 'text-ink-muted'}">
            {item.icon}
          </span>

          <!-- 隊列品鑑中動態呼吸燈或待聽計數 Badge -->
          {#if item.id === 'listening-queue'}
            {#if isAnyListening}
              <span class="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"></span>
            {:else if pendingQueueCount > 0}
              <span class="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-signal text-white font-mono text-[9px] font-bold flex items-center justify-center leading-none shadow-[0_0_6px_rgba(255,42,60,0.6)]">
                {pendingQueueCount > 9 ? '9+' : pendingQueueCount}
              </span>
            {/if}
          {/if}
        </div>

        <!-- 標籤與編號 -->
        <span class="text-[10px] tracking-tight transition-colors font-medium {isActive ? 'text-ink font-bold' : 'text-ink-dim'}">
          {item.label}
        </span>
      </button>
    {/each}
  </div>
</nav>
