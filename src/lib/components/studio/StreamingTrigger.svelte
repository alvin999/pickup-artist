<script lang="ts">
  import { onMount } from 'svelte';
  import {
    STREAMING_PLATFORMS,
    type StreamingPlatform,
    getPreferredStreamingPlatform,
    getStreamingSearchUrl
  } from '$lib/utils/streaming';
  import { ChevronDown, ExternalLink, Play } from 'lucide-svelte';

  interface Props {
    artistName: string;
    albumTitle?: string;
    appleMusicUrl?: string;
    variant?: 'compact' | 'full' | 'subtle';
    className?: string;
  }

  let {
    artistName,
    albumTitle,
    appleMusicUrl,
    variant = 'compact',
    className = ''
  }: Props = $props();

  let preferredPlatform = $state<StreamingPlatform>('apple_music');
  let isMenuOpen = $state(false);

  function syncPlatform() {
    preferredPlatform = getPreferredStreamingPlatform();
  }

  onMount(() => {
    syncPlatform();
    const handlePlatformChange = () => syncPlatform();
    window.addEventListener('pua:streaming-platform-changed', handlePlatformChange);
    return () => {
      window.removeEventListener('pua:streaming-platform-changed', handlePlatformChange);
    };
  });

  const currentInfo = $derived(STREAMING_PLATFORMS[preferredPlatform] || STREAMING_PLATFORMS.apple_music);

  function openStream(platform: StreamingPlatform, e?: MouseEvent) {
    if (e) {
      e.stopPropagation();
    }
    const url = getStreamingSearchUrl(platform, {
      artistName,
      albumTitle,
      appleMusicUrl
    });
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    isMenuOpen = false;
  }
</script>

<div class="relative inline-flex items-center font-mono {className}">
  {#if variant === 'full'}
    <!-- 全幅發燒友機架風格 (Crate Digger / Detail Drawer) -->
    <div class="w-full flex items-stretch border border-wire bg-chassis hover:border-wire-bright transition-all">
      <button
        type="button"
        onclick={(e) => openStream(preferredPlatform, e)}
        class="flex-1 flex items-center justify-between px-3.5 py-2 text-ink hover:text-white transition-colors cursor-pointer group"
        title={`在 ${currentInfo.label} 聆賞`}
      >
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full shrink-0"
            style="background-color: {currentInfo.brandColor}; box-shadow: 0 0 8px {currentInfo.brandColor};"
          ></span>
          <span class="text-[11px] font-bold uppercase tracking-wider group-hover:text-primary">
            LAUNCH_{currentInfo.shortLabel.toUpperCase()}_STREAM
          </span>
        </div>
        <span class="text-[10px] text-ink-dim group-hover:text-ink">[EXT ↗]</span>
      </button>

      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          isMenuOpen = !isMenuOpen;
        }}
        class="px-2 border-l border-wire hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
        title="切換其他串流服務"
      >
        <ChevronDown class="w-3.5 h-3.5" />
      </button>
    </div>

  {:else if variant === 'subtle'}
    <!-- 極簡次要按鈕 (Acoustic Matrix 卡片) -->
    <div class="inline-flex items-center rounded border border-wire hover:border-wire-bright bg-void hover:bg-panel transition-all">
      <button
        type="button"
        onclick={(e) => openStream(preferredPlatform, e)}
        class="px-2 py-1 text-[10px] text-ink-muted hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
        title={`在 ${currentInfo.label} 聆賞`}
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          style="background-color: {currentInfo.brandColor};"
        ></span>
        <span>{currentInfo.shortLabel}</span>
      </button>
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          isMenuOpen = !isMenuOpen;
        }}
        class="px-1 py-1 text-ink-dim hover:text-ink border-l border-wire cursor-pointer"
        title="更多串流"
      >
        <ChevronDown class="w-2.5 h-2.5" />
      </button>
    </div>

  {:else}
    <!-- 標準精簡模式 (Honeycomb 彈窗 / 聆聽隊列) -->
    <div class="inline-flex items-stretch rounded-[3px] border border-wire bg-[#16171f] hover:border-wire-bright transition-all shadow-sm">
      <button
        type="button"
        onclick={(e) => openStream(preferredPlatform, e)}
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-ink hover:text-white transition-colors cursor-pointer"
        title={`在 ${currentInfo.label} 聆賞`}
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          style="background-color: {currentInfo.brandColor};"
        ></span>
        <span>{currentInfo.label}</span>
      </button>
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          isMenuOpen = !isMenuOpen;
        }}
        class="px-1.5 border-l border-wire text-ink-muted hover:text-ink hover:bg-surface cursor-pointer transition-colors"
        title="選擇其他串流平台"
      >
        <ChevronDown class="w-3 h-3" />
      </button>
    </div>
  {/if}

  <!-- 展開的多串流快速跳轉選單 -->
  {#if isMenuOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-transparent cursor-default border-none outline-none"
      onclick={(e) => {
        e.stopPropagation();
        isMenuOpen = false;
      }}
      aria-label="關閉串流選單"
    ></button>
    <div
      role="menu"
      tabindex="-1"
      class="absolute right-0 top-full mt-1 w-44 z-50 bg-[#121319] border border-wire-bright shadow-[0_8px_24px_rgba(0,0,0,0.7)] p-1 flex flex-col gap-0.5 rounded-[2px] animate-in fade-in"
    >
      <div class="px-2 py-1 text-[9px] text-ink-dim uppercase tracking-wider font-mono border-b border-wire/60 mb-0.5">
        切換串流出口 (Stream To)
      </div>
      {#each Object.values(STREAMING_PLATFORMS) as platform}
        <button
          type="button"
          onclick={(e) => openStream(platform.id, e)}
          class="flex items-center justify-between w-full px-2 py-1.5 text-left text-[11px] text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer group"
        >
          <div class="flex items-center gap-2">
            <span
              class="w-1.5 h-1.5 rounded-full"
              style="background-color: {platform.brandColor};"
            ></span>
            <span class="group-hover:text-primary font-mono">{platform.label}</span>
          </div>
          <ExternalLink class="w-3 h-3 text-ink-dim group-hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      {/each}
    </div>
  {/if}
</div>
