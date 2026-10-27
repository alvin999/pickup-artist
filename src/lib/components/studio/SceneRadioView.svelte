<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ArtistEntry } from '$lib/types/artist';
  import {
    getSceneRecommendation,
    matchLocalArtists,
    type LocalArtistMatch
  } from '$lib/services/aiSceneService';
  import type { SceneChatMessage, ExternalArtistRecommendation } from '$lib/ai/scenePrompts';
  import { listeningQueue } from '$lib/services/listeningQueue';
  import {
    Send,
    RotateCcw,
    Sparkles,
    Disc,
    Plus,
    Check,
    Compass,
    Headphones,
    MessageSquare,
    Loader2
  } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    onselectArtist?: (id: string) => void;
    onquickPickup?: (artistName: string) => void;
    showToast?: (msg: string) => void;
  }

  let {
    artists = [],
    onselectArtist,
    onquickPickup,
    showToast
  }: Props = $props();

  // 對話狀態
  let messages = $state<SceneChatMessage[]>([]);
  let userInput = $state('');
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);

  // 當前策展成果狀態
  let activeMatchedGenres = $state<string[]>([]);
  let externalRecommendations = $state<ExternalArtistRecommendation[]>([]);
  let localMatches = $state<LocalArtistMatch[]>([]);
  let addedExternalNames = $state<Set<string>>(new Set());

  // 滾動容器參考
  let chatScrollElement = $state<HTMLDivElement | null>(null);

  const SESSION_KEY = 'pua_scene_chat_session_v1';

  // 初始化時還原先前對話與策展狀態（切換分頁不遺失）
  onMount(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        messages = saved.messages || [];
        activeMatchedGenres = saved.activeMatchedGenres || [];
        externalRecommendations = saved.externalRecommendations || [];
        if (activeMatchedGenres.length > 0 && artists.length > 0) {
          localMatches = matchLocalArtists(artists, activeMatchedGenres);
        }
        scrollToBottom();
      }
    } catch (e) {
      console.warn('[SceneRadio] 無法讀取對話 session:', e);
    }
  });

  // 自動同步至 SessionStorage
  function saveSession() {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          messages,
          activeMatchedGenres,
          externalRecommendations
        })
      );
    } catch (e) {
      console.warn('[SceneRadio] 儲存對話 session 失敗:', e);
    }
  }

  // 當對話更新時自動捲動到底部
  async function scrollToBottom() {
    await tick();
    if (chatScrollElement) {
      chatScrollElement.scrollTop = chatScrollElement.scrollHeight;
    }
  }

  // 發送情境對話
  async function handleSendMessage() {
    const trimmed = userInput.trim();
    if (!trimmed || isLoading) return;

    errorMessage = null;
    const newHistory: SceneChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed }
    ];

    messages = newHistory;
    userInput = '';
    isLoading = true;
    scrollToBottom();

    try {
      const result = await getSceneRecommendation(newHistory);

      messages = [
        ...newHistory,
        { role: 'assistant', content: result.reply }
      ];

      activeMatchedGenres = result.matchedGenres;
      externalRecommendations = result.externalArtists;

      // 即時比對本地庫
      localMatches = matchLocalArtists(artists, result.matchedGenres);
      saveSession();
      scrollToBottom();
    } catch (err: any) {
      console.error('[SceneRadio] 推薦失敗:', err);
      errorMessage = err?.message || '推論失敗，請確認 AI 金鑰配置。';
      showToast?.(errorMessage ?? '發生異常');
    } finally {
      isLoading = false;
    }
  }

  // 鍵盤送出 (Enter 送出, Shift+Enter 換行)
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  // 開啟新對話並清空當前歷程
  function handleReset() {
    messages = [];
    userInput = '';
    activeMatchedGenres = [];
    externalRecommendations = [];
    localMatches = [];
    errorMessage = null;
    sessionStorage.removeItem(SESSION_KEY);
    showToast?.('已開啟全新情境對話');
  }

  // 快速將庫內藝人排入聆賞隊列
  function handleEnqueueArtist(artist: ArtistEntry) {
    listeningQueue.add({
      artistId: artist.id,
      artistName: artist.name,
      albumTitle: artist.analysis?.notableAlbums?.[0]?.title || '精選代表作',
      albumYear: artist.analysis?.notableAlbums?.[0]?.year,
      appleMusicUrl: artist.analysis?.notableAlbums?.[0]?.appleMusicSearchUrl,
      losslessSpec: artist.analysis?.notableAlbums?.[0]?.losslessSpec,
      dynamicRangeScore: artist.analysis?.notableAlbums?.[0]?.dynamicRangeScore
    });
    showToast?.(`已將《${artist.name}》加入聆賞隊列`);
  }

  // 快速拾音外部推薦藝人
  function handlePickupExternal(name: string) {
    addedExternalNames.add(name);
    addedExternalNames = new Set(addedExternalNames);
    if (onquickPickup) {
      onquickPickup(name);
    } else {
      showToast?.(`已發起拾音：${name}`);
    }
  }
</script>

<div class="h-full flex flex-col lg:flex-row gap-4 select-none font-mono">
  <!-- 左側：多輪對話互動舞台 -->
  <div class="flex-1 flex flex-col bg-chassis border border-wire rounded-[2px] overflow-hidden min-h-[460px] lg:min-h-0">
    <!-- 對話頂部狀態列 -->
    <div class="px-4 py-3 border-b border-wire bg-void/60 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span class="w-2 h-2 rounded-full {isLoading ? 'bg-amber-400 animate-ping' : 'bg-signal shadow-[0_0_8px_rgba(234,179,8,0.8)]'}"></span>
        <span class="font-dot text-xs tracking-widest text-ink uppercase">AI.RECOMMEND // NEURAL_CURATOR</span>
      </div>
      <div class="flex items-center gap-2">
        {#if messages.length > 0}
          <button
            type="button"
            onclick={handleReset}
            class="px-2.5 py-1 text-[11px] text-ink-muted hover:text-signal hover:bg-panel border border-wire hover:border-signal/50 transition-colors rounded-[2px] flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="清空對話並開啟新話題"
          >
            <Plus class="w-3.5 h-3.5 text-signal" />
            <span class="font-sans">開啟新對話</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- 訊息捲動區域 -->
    <div
      bind:this={chatScrollElement}
      class="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar"
    >
      {#if messages.length === 0}
        <!-- 初始空狀態引導 -->
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-ink-muted">
          <div class="w-12 h-12 rounded-full border border-wire flex items-center justify-center mb-3 bg-panel/30">
            <Compass class="w-6 h-6 text-signal/80" />
          </div>
          <p class="text-sm font-sans text-ink mb-1">智慧聲學情境對話</p>
          <p class="text-xs text-ink-dim max-w-sm font-sans leading-relaxed">
            透過自然對話描述您當下的身體狀態、工作活動或渴望的聽覺音景。AI 將解析深層音樂風格，即時媒合您收藏庫中的寶藏藝人，並探索庫外未知新聲音。
          </p>
        </div>
      {:else}
        {#each messages as msg, idx}
          {#if msg.role === 'user'}
            <div class="flex justify-end">
              <div class="max-w-[85%] bg-ink text-void px-3.5 py-2.5 rounded-[2px] text-xs font-sans shadow-md">
                <p class="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          {:else}
            <div class="flex justify-start">
              <div class="max-w-[90%] bg-panel border border-wire px-3.5 py-2.5 rounded-[2px] text-xs font-sans text-ink shadow-sm">
                <div class="flex items-center gap-1.5 font-mono text-[10px] text-signal mb-1.5">
                  <Sparkles class="w-3 h-3" />
                  <span>CURATOR // 策展解析</span>
                </div>
                <p class="whitespace-pre-wrap leading-relaxed text-ink/90">{msg.content}</p>
              </div>
            </div>
          {/if}
        {/each}

        {#if isLoading}
          <div class="flex justify-start">
            <div class="bg-panel border border-wire px-3 py-2 rounded-[2px] text-xs font-mono text-ink-muted flex items-center gap-2">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-signal" />
              <span>正在解剖聲學音景並比對曲庫...</span>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- 底部輸入區域 -->
    <div class="p-3 border-t border-wire bg-void/80">
      {#if errorMessage}
        <div class="mb-2 text-[11px] text-red-400 font-mono">
          [ERR] {errorMessage}
        </div>
      {/if}
      <div class="relative flex items-center">
        <!-- 保持中性引導，嚴禁提供範例以防範錨定偏差 -->
        <input
          type="text"
          bind:value={userInput}
          onkeydown={handleKeyDown}
          disabled={isLoading}
          placeholder="描述當前的心情狀態、活動節奏或想沈浸的聽覺氛圍..."
          class="w-full bg-chassis border border-wire focus:border-signal text-ink placeholder:text-ink-dim px-3.5 py-2.5 pr-12 text-xs font-sans rounded-[2px] outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onclick={handleSendMessage}
          disabled={!userInput.trim() || isLoading}
          class="absolute right-1.5 p-1.5 bg-signal text-void hover:bg-signal/90 disabled:opacity-30 disabled:hover:bg-signal transition-all rounded-[2px] cursor-pointer"
          title="發送 (Enter)"
        >
          <Send class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="flex justify-between items-center text-[10px] text-ink-dim mt-2 px-1">
        <span>支援連續微調 // 隨時可開啟新對話</span>
        <span>ENTER 發送 // SHIFT+ENTER 換行</span>
      </div>
    </div>
  </div>

  <!-- 右側：即時雙軌成果呈現看板 -->
  <div class="w-full lg:w-[420px] flex flex-col gap-4 overflow-hidden">
    <!-- 1. 當前聚焦之風格標籤 (Acoustic Genres) -->
    {#if activeMatchedGenres.length > 0}
      <div class="bg-chassis border border-wire p-3 rounded-[2px]">
        <div class="flex items-center gap-1.5 text-[10px] text-ink-muted uppercase tracking-wider mb-2">
          <Disc class="w-3 h-3 text-signal" />
          <span>MATCHED_ACOUSTIC_GENRES // 聲學風格軸</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each activeMatchedGenres as genre}
            <span class="px-2 py-0.5 bg-panel border border-wire text-ink text-[11px] rounded-[2px] font-sans">
              #{genre}
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 2. 本地庫吻合藝人 (In-Library Matches) -->
    <div class="flex-1 bg-chassis border border-wire rounded-[2px] flex flex-col overflow-hidden min-h-[220px]">
      <div class="px-3.5 py-2.5 border-b border-wire bg-void/60 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Headphones class="w-3.5 h-3.5 text-emerald-400" />
          <span class="text-xs text-ink font-bold font-sans">🎧 庫內匹配藝人</span>
        </div>
        <span class="text-[10px] text-ink-dim">
          {localMatches.length} 位符合
        </span>
      </div>

      <div class="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar">
        {#if localMatches.length === 0}
          <div class="h-full flex items-center justify-center text-center p-4 text-ink-dim text-xs font-sans">
            {#if activeMatchedGenres.length === 0}
              對話開始後將自動在此檢索出庫內最契合的藝人
            {:else}
              在您現有的曲庫中未找到完全吻合此風格的藝人
            {/if}
          </div>
        {:else}
          {#each localMatches as match}
            <div class="p-2.5 bg-panel/50 hover:bg-panel border border-wire hover:border-signal/50 rounded-[2px] transition-colors group flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => onselectArtist?.(match.artist.id)}
                    class="font-sans text-xs font-bold text-ink hover:text-signal transition-colors truncate text-left cursor-pointer"
                  >
                    {match.artist.name}
                  </button>
                  {#if match.artist.analysis?.subGenre}
                    <span class="text-[9px] px-1 py-0.2 bg-void border border-wire text-ink-muted rounded-[2px]">
                      {match.artist.analysis.subGenre}
                    </span>
                  {/if}
                </div>
                <div class="text-[10px] text-ink-dim truncate mt-0.5 font-sans">
                  命中：{match.hitGenres.join(', ')}
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onclick={() => handleEnqueueArtist(match.artist)}
                  class="p-1.5 text-ink-muted hover:text-emerald-400 hover:bg-void border border-transparent hover:border-wire rounded-[2px] transition-colors cursor-pointer"
                  title="加入聆賞隊列"
                >
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- 3. 庫外新聲音探索 (AI Out-of-Library Discoveries) -->
    <div class="flex-1 bg-chassis border border-wire rounded-[2px] flex flex-col overflow-hidden min-h-[220px]">
      <div class="px-3.5 py-2.5 border-b border-wire bg-void/60 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles class="w-3.5 h-3.5 text-signal" />
          <span class="text-xs text-ink font-bold font-sans">✦ 探索新聲音</span>
        </div>
        <span class="text-[10px] text-ink-dim">
          AI 特選 {externalRecommendations.length} 組
        </span>
      </div>

      <div class="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar">
        {#if externalRecommendations.length === 0}
          <div class="h-full flex items-center justify-center text-center p-4 text-ink-dim text-xs font-sans">
            AI 將根據對話脈絡主動挖掘未收藏的潛在寶藏
          </div>
        {:else}
          {#each externalRecommendations as ext}
            <div class="p-2.5 bg-panel/50 hover:bg-panel border border-wire hover:border-signal/50 rounded-[2px] transition-colors flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <span class="font-sans text-xs font-bold text-ink">{ext.name}</span>
                  <span class="text-[9px] px-1 py-0.2 bg-signal-dim border border-signal/40 text-signal rounded-[2px]">
                    {ext.subGenre}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={addedExternalNames.has(ext.name)}
                  onclick={() => handlePickupExternal(ext.name)}
                  class="px-2 py-0.5 text-[10px] border {addedExternalNames.has(ext.name) ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-wire hover:border-signal text-ink-muted hover:text-signal bg-void'} rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-default"
                  title="拾音收錄此藝人"
                >
                  {#if addedExternalNames.has(ext.name)}
                    <Check class="w-3 h-3" />
                    <span>已拾音</span>
                  {:else}
                    <Plus class="w-3 h-3" />
                    <span>拾音</span>
                  {/if}
                </button>
              </div>

              <p class="text-[11px] font-sans text-ink-dim leading-relaxed">
                {ext.recommendReason}
              </p>

              {#if ext.curationHighlight}
                <div class="text-[9px] font-mono text-signal/80 flex items-center gap-1">
                  <span>HIGHLIGHT //</span>
                  <span class="font-sans">{ext.curationHighlight}</span>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>
