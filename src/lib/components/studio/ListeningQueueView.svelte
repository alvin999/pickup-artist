<script lang="ts">
  import type { ArtistEntry, NotableAlbum } from '$lib/types/artist';
  import {
    listeningQueue,
    type ListeningQueueItem,
    type QueueItemStatus
  } from '$lib/services/listeningQueue';
  import { ArrowUpRight, Trash2, CheckCircle2, Play, Music, Sparkles } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    onselectArtist?: (id: string) => void;
    onopenInCrate?: (id: string) => void;
    showToast?: (msg: string) => void;
  }

  let {
    artists = [],
    onselectArtist,
    onopenInCrate,
    showToast
  }: Props = $props();

  // 響應式隊列狀態
  let queueItems = $state<ListeningQueueItem[]>([]);

  $effect(() => {
    const unsubscribe = listeningQueue.subscribe((items) => {
      queueItems = items;
    });
    return unsubscribe;
  });

  // 計算聲學統計遙測指標
  const pendingItems = $derived(queueItems.filter((i) => i.status !== 'completed'));
  const completedItems = $derived(queueItems.filter((i) => i.status === 'completed'));
  const activeListeningItem = $derived(queueItems.find((i) => i.status === 'listening'));

  // 計算平均 DR (Dynamic Range Score)
  const averageDR = $derived.by(() => {
    const drList = queueItems
      .map((i) => i.dynamicRangeScore)
      .filter((dr): dr is number => typeof dr === 'number' && dr > 0);
    if (drList.length === 0) return 14;
    const sum = drList.reduce((acc, curr) => acc + curr, 0);
    return Math.round((sum / drList.length) * 10) / 10;
  });

  // 計算 Hi-Res 比例
  const hiResRatio = $derived.by(() => {
    if (queueItems.length === 0) return 0;
    const hiResCount = queueItems.filter(
      (i) =>
        i.losslessSpec?.toLowerCase().includes('hi-res') ||
        i.losslessSpec?.toLowerCase().includes('96khz') ||
        i.losslessSpec?.toLowerCase().includes('192khz') ||
        i.losslessSpec?.toLowerCase().includes('flac')
    ).length;
    return Math.round((hiResCount / queueItems.length) * 100);
  });

  // 隨機推薦音樂庫未在隊列中的寶藏盤
  const candidateStash = $derived.by(() => {
    const queuedArtistIds = new Set(pendingItems.map((q) => q.artistId));
    const results: { artist: ArtistEntry; album: NotableAlbum }[] = [];

    for (const a of artists) {
      if (!a.analysis?.notableAlbums) continue;
      for (const alb of a.analysis.notableAlbums) {
        // 避開已在隊列中的
        const isQueued = pendingItems.some(
          (q) => q.artistId === a.id && q.albumTitle === alb.title
        );
        if (!isQueued) {
          results.push({ artist: a, album: alb });
        }
      }
    }
    // 優先挑選深埋寶藏
    results.sort((x, y) => {
      const isXHidden = x.album.tier === 'hidden-treasure' ? 1 : 0;
      const isYHidden = y.album.tier === 'hidden-treasure' ? 1 : 0;
      return isYHidden - isXHidden;
    });
    return results.slice(0, 6);
  });

  // 啟動播放並自動標記為品鑑中
  function handlePlayItem(item: ListeningQueueItem) {
    if (item.appleMusicUrl) {
      window.open(item.appleMusicUrl, '_blank', 'noopener,noreferrer');
    }
    listeningQueue.updateStatus(item.id, 'listening');
    showToast?.(`已在 Apple Music 開啟品鑑：${item.artistName} ${item.albumTitle ? `- ${item.albumTitle}` : ''}`);
  }

  // 標記狀態
  function handleToggleStatus(item: ListeningQueueItem) {
    if (item.status === 'listening') {
      listeningQueue.updateStatus(item.id, 'completed');
      showToast?.(`標記完成品鑑：${item.artistName}`);
    } else if (item.status === 'queued') {
      listeningQueue.updateStatus(item.id, 'listening');
      showToast?.(`開始品鑑：${item.artistName}`);
    } else {
      listeningQueue.updateStatus(item.id, 'queued');
      showToast?.(`重設回待聆：${item.artistName}`);
    }
  }

  // 順序微調
  function handleMoveUp(index: number) {
    if (index > 0) {
      listeningQueue.reorder(index, index - 1);
    }
  }

  function handleMoveDown(index: number) {
    if (index < queueItems.length - 1) {
      listeningQueue.reorder(index, index + 1);
    }
  }

  // 打亂順序 (Shuffle)
  function handleShuffle() {
    if (queueItems.length <= 1) return;
    const shuffled = [...queueItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // 透過多次交換達到重新排序
    shuffled.forEach((it, idx) => {
      const currentIdx = queueItems.findIndex((q) => q.id === it.id);
      if (currentIdx !== -1) {
        listeningQueue.reorder(currentIdx, idx);
      }
    });
    showToast?.('品鑑工單順序已打亂 (SHUFFLE_COMPLETE)');
  }

  // 一鍵注入隨機推薦盤
  function handleInjectStash(artist: ArtistEntry, album: NotableAlbum) {
    listeningQueue.add({
      artistId: artist.id,
      artistName: artist.name,
      albumTitle: album.title,
      albumYear: album.year,
      tier: album.tier,
      losslessSpec: album.losslessSpec,
      description: album.description,
      rarityReason: album.rarityReason,
      audiophileHighlight: album.audiophileHighlight,
      dynamicRangeScore: album.dynamicRangeScore,
      appleMusicUrl: album.appleMusicSearchUrl,
      coverImage: artist.coverImage
    });
    showToast?.(`已將《${album.title}》推入聆賞隊列`);
  }
</script>

<div class="flex flex-col gap-5 p-6 bg-chassis min-h-screen text-ink font-sans">
  <!-- 頂部發燒友機架遙測儀表 (Telemetry Console Header) -->
  <div class="border border-wire bg-void p-5 shadow-2xl relative overflow-hidden">
    <!-- 背景等寬硬體飾紋 -->
    <div class="absolute right-4 top-2 text-[68px] font-mono font-black text-panel/40 select-none pointer-events-none">
      QUE_04
    </div>

    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 font-mono text-xs text-signal mb-1">
          <span class="w-2 h-2 rounded-full {activeListeningItem ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-signal shadow-[0_0_8px_rgba(254,196,134,0.6)]'}"></span>
          <span>MASTER_LISTENING_SESSION // 聲學聆賞工單調度台</span>
        </div>
        <h1 class="text-2xl font-serif font-bold text-ink tracking-tight flex items-center gap-2">
          <span>聆賞隊列</span>
          <span class="font-mono text-xs font-normal px-2 py-0.5 border border-wire bg-panel text-ink-muted">
            {pendingItems.length} PENDING / {completedItems.length} COMPLETED
          </span>
        </h1>
      </div>

      <!-- 聲學數據晶片組 -->
      <div class="flex items-center gap-3 font-mono">
        <div class="border border-wire bg-panel/60 px-3 py-1.5 flex flex-col items-center min-w-[76px]">
          <span class="text-[9px] text-ink-dim uppercase tracking-wider">SESSION_DR</span>
          <span class="text-sm font-bold text-signal">DR{averageDR}</span>
        </div>
        <div class="border border-wire bg-panel/60 px-3 py-1.5 flex flex-col items-center min-w-[76px]">
          <span class="text-[9px] text-ink-dim uppercase tracking-wider">HI-RES_PCT</span>
          <span class="text-sm font-bold text-emerald-400">{hiResRatio}%</span>
        </div>
        <div class="border border-wire bg-panel/60 px-3 py-1.5 flex flex-col items-center min-w-[76px]">
          <span class="text-[9px] text-ink-dim uppercase tracking-wider">EST_TIME</span>
          <span class="text-sm font-bold text-ink">{pendingItems.length * 42}m</span>
        </div>
      </div>
    </div>

    <!-- 操作列 -->
    <div class="mt-4 pt-3 border-t border-wire flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
      <div class="flex items-center gap-2">
        {#if pendingItems.length > 0}
          <button
            type="button"
            onclick={() => handlePlayItem(activeListeningItem || pendingItems[0])}
            class="px-3.5 py-1.5 bg-signal text-void font-bold flex items-center gap-1.5 hover:bg-signal/90 transition-colors cursor-pointer"
          >
            <Play class="w-3.5 h-3.5 fill-current" />
            <span>{activeListeningItem ? '繼續品鑑首盤' : '啟動首盤品鑑'}</span>
          </button>
        {/if}

        <button
          type="button"
          onclick={handleShuffle}
          disabled={queueItems.length <= 1}
          class="px-3 py-1.5 border border-wire bg-panel hover:bg-chassis text-ink-muted hover:text-ink flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="隨機打亂隊列順序"
        >
          <span class="material-symbols-outlined text-[13px]">shuffle</span>
          <span>隨機漫遊</span>
        </button>

        {#if completedItems.length > 0}
          <button
            type="button"
            onclick={() => listeningQueue.clearCompleted()}
            class="px-3 py-1.5 border border-wire bg-panel hover:bg-chassis text-ink-dim hover:text-ink-muted flex items-center gap-1.5 transition-colors cursor-pointer"
            title="清空已完成品鑑項目"
          >
            <span class="material-symbols-outlined text-[13px]">clear_all</span>
            <span>清除已品鑑 ({completedItems.length})</span>
          </button>
        {/if}
      </div>

      {#if queueItems.length > 0}
        <button
          type="button"
          onclick={() => {
            if (confirm('確定要清空目前整組聆賞隊列嗎？')) {
              listeningQueue.clearAll();
              showToast?.('已清空聆賞隊列');
            }
          }}
          class="text-ink-dim hover:text-rose-400 text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trash2 class="w-3 h-3" />
          <span>全清工單</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- 主版面：左側主隊列槽 ✕ 右側音樂庫推薦補給 -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
    <!-- 左側 (2 欄)：主品鑑卡槽列表 -->
    <div class="lg:col-span-2 flex flex-col gap-3 font-mono">
      <div class="flex items-center justify-between text-[11px] text-ink-muted uppercase tracking-wider px-1">
        <span>// ACTIVE_QUEUE_STRIPS [待播插槽]</span>
        <span>COUNT: 0{queueItems.length}</span>
      </div>

      {#if queueItems.length === 0}
        <!-- 待命中空狀態 -->
        <div class="border border-dashed border-wire bg-void/50 p-12 text-center flex flex-col items-center justify-center gap-3">
          <span class="material-symbols-outlined text-[42px] text-ink-dim">album</span>
          <div class="text-sm font-bold text-ink">隊列電路已接通 · 暫無待聽盤片</div>
          <p class="text-xs text-ink-muted max-w-md leading-relaxed">
            在「藝人展間」展開藝人時點擊 <span class="text-signal font-bold">[+ 聆賞]</span>，或由右側「聲學補給庫」直接一鍵注入發燒友深埋寶藏盤。
          </p>
          {#if candidateStash.length > 0}
            <button
              type="button"
              onclick={() => {
                const sample = candidateStash.slice(0, 3);
                sample.forEach((s) => handleInjectStash(s.artist, s.album));
              }}
              class="mt-2 px-4 py-2 border border-signal/40 bg-signal/10 hover:bg-signal/20 text-signal text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles class="w-3.5 h-3.5" />
              <span>自動注入 3 盤深埋寶藏啟動 Session</span>
            </button>
          {/if}
        </div>
      {:else}
        <div class="flex flex-col gap-2.5">
          {#each queueItems as item, idx}
            {@const isNowListening = item.status === 'listening'}
            {@const isCompleted = item.status === 'completed'}
            {@const isHidden = item.tier === 'hidden-treasure'}

            <div
              class="border p-4 transition-all relative group flex flex-col gap-2 {isNowListening
                ? 'border-signal bg-signal-dim/30 shadow-[0_0_20px_rgba(254,196,134,0.12)]'
                : isCompleted
                ? 'border-wire/50 bg-void/40 opacity-70'
                : 'border-wire bg-void hover:border-ink-muted'}"
            >
              <!-- 狀態銘牌指示條 -->
              <div class="flex items-center justify-between text-[10px]">
                <div class="flex items-center gap-2">
                  <span class="text-ink-dim font-bold">#{String(idx + 1).padStart(2, '0')}</span>
                  {#if isNowListening}
                    <span class="px-2 py-0.5 bg-signal text-void font-bold flex items-center gap-1 animate-pulse">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>NOW_LISTENING [品鑑中]</span>
                    </span>
                  {:else if isCompleted}
                    <span class="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-bold">
                      COMPLETED [已品鑑]
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 border border-wire bg-panel text-ink-dim">
                      QUEUED [待聆]
                    </span>
                  {/if}

                  {#if isHidden}
                    <span class="px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/20 text-amber-400 font-bold">
                      深埋寶藏
                    </span>
                  {:else if item.tier === 'milestone'}
                    <span class="px-1.5 py-0.5 border border-wire bg-panel text-ink-muted">
                      時代基石
                    </span>
                  {/if}

                  {#if item.losslessSpec}
                    <span class="text-ink-dim hidden sm:inline">[{item.losslessSpec}]</span>
                  {/if}
                </div>

                <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  {#if item.dynamicRangeScore}
                    <span class="text-signal font-bold mr-1">DR{item.dynamicRangeScore}</span>
                  {/if}

                  <!-- 排序調動按鈕 -->
                  <button
                    type="button"
                    onclick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    class="p-1 hover:text-signal disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    title="向上移"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onclick={() => handleMoveDown(idx)}
                    disabled={idx === queueItems.length - 1}
                    class="p-1 hover:text-signal disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    title="向下移"
                  >
                    ▼
                  </button>

                  <!-- 移除按鈕 -->
                  <button
                    type="button"
                    onclick={() => listeningQueue.remove(item.id)}
                    class="p-1 text-ink-dim hover:text-rose-400 ml-1 cursor-pointer"
                    title="從隊列移除"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- 主標題與藝人連結 -->
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => onselectArtist?.(item.artistId)}
                      class="text-base font-bold text-ink hover:text-signal transition-colors text-left truncate cursor-pointer"
                      title="檢視此藝人檔案"
                    >
                      {item.artistName}
                    </button>
                    {#if item.albumYear}
                      <span class="text-xs text-ink-dim">({item.albumYear})</span>
                    {/if}
                  </div>

                  {#if item.albumTitle}
                    <div class="text-sm font-sans font-bold text-ink-muted mt-0.5 truncate flex items-center gap-1.5">
                      <Music class="w-3.5 h-3.5 text-signal shrink-0" />
                      <span>{item.albumTitle}</span>
                    </div>
                  {/if}
                </div>

                <!-- 播放跳轉與完成標記 -->
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onclick={() => handleToggleStatus(item)}
                    class="px-2.5 py-1 text-xs border border-wire bg-panel hover:border-signal text-ink-muted hover:text-signal flex items-center gap-1 transition-colors cursor-pointer"
                    title={isCompleted ? '重設為待聽' : '標記為已完播'}
                  >
                    <CheckCircle2 class="w-3.5 h-3.5 {isCompleted ? 'text-emerald-400' : 'text-ink-dim'}" />
                    <span>{isCompleted ? '已完播' : '標為完成'}</span>
                  </button>

                  {#if item.appleMusicUrl}
                    <button
                      type="button"
                      onclick={() => handlePlayItem(item)}
                      class="px-3 py-1 text-xs font-bold border border-wire bg-ink text-void hover:bg-signal hover:text-void flex items-center gap-1 transition-colors cursor-pointer"
                      title="在 Apple Music 啟動聆賞"
                    >
                      <Play class="w-3.5 h-3.5 fill-current" />
                      <span>串流聆賞</span>
                      <ArrowUpRight class="w-3 h-3 ml-0.5" />
                    </button>
                  {/if}
                </div>
              </div>

              <!-- 聲學亮點或挖寶理由 -->
              {#if item.audiophileHighlight || item.rarityReason || item.description}
                <div class="text-[11px] font-sans text-ink-muted pt-2 border-t border-wire/60 flex flex-col gap-1 leading-relaxed">
                  {#if item.audiophileHighlight}
                    <div class="flex items-start gap-1">
                      <span class="text-emerald-400 shrink-0 font-bold font-mono">[聲學亮點]</span>
                      <span>{item.audiophileHighlight}</span>
                    </div>
                  {/if}
                  {#if item.rarityReason}
                    <div class="flex items-start gap-1">
                      <span class="text-amber-400 shrink-0 font-bold font-mono">[挖寶理由]</span>
                      <span>{item.rarityReason}</span>
                    </div>
                  {/if}
                  {#if !item.audiophileHighlight && !item.rarityReason && item.description}
                    <p class="text-ink-dim">{item.description}</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- 右側 (1 欄)：聲學補給抽屜 (Acoustic Stash & Picks) -->
    <div class="flex flex-col gap-3 font-mono">
      <div class="flex items-center justify-between text-[11px] text-ink-muted uppercase tracking-wider px-1">
        <span>// STASH_PICKS [庫存發燒補給]</span>
        <span class="text-signal">AVAILABLE</span>
      </div>

      <div class="border border-wire bg-void p-4 flex flex-col gap-3">
        <div class="text-xs text-ink-dim leading-relaxed">
          系統自您的音樂庫萃取出未入列之發燒基石與深埋盤，點擊一鍵推入聆賞排程：
        </div>

        {#if candidateStash.length === 0}
          <div class="text-xs text-ink-dim border border-dashed border-wire p-4 text-center">
            暫無可補給之推薦盤，請先在展間探索藝人
          </div>
        {:else}
          <div class="flex flex-col gap-2">
            {#each candidateStash as pick}
              <div class="border border-wire bg-panel/50 p-2.5 flex flex-col gap-1.5 hover:border-signal/50 transition-colors">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-ink-dim">{pick.album.year || 'HIST'}</span>
                  {#if pick.album.tier === 'hidden-treasure'}
                    <span class="text-amber-400 font-bold">[深埋寶藏]</span>
                  {:else}
                    <span class="text-signal font-bold">[核心基石]</span>
                  {/if}
                </div>

                <div>
                  <div class="text-xs font-bold text-ink truncate">{pick.artist.name}</div>
                  <div class="text-[11px] font-sans text-ink-muted truncate">{pick.album.title}</div>
                </div>

                <div class="pt-1.5 border-t border-wire/60 flex items-center justify-between">
                  <span class="text-[9px] text-ink-dim font-bold">
                    {pick.album.dynamicRangeScore ? `DR${pick.album.dynamicRangeScore}` : 'AUDIOPHILE'}
                  </span>
                  <button
                    type="button"
                    onclick={() => handleInjectStash(pick.artist, pick.album)}
                    class="text-[10px] px-2 py-0.5 border border-wire bg-chassis hover:border-signal hover:text-signal text-ink-muted flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span class="material-symbols-outlined text-[12px]">add</span>
                    <span>推入隊列</span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
