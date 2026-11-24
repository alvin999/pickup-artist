<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { i18n, t } from '$lib/i18n';
  import type { ArtistEntry } from '$lib/types/artist';
  import {
    getQuickChipsForContext,
    type AgentPageContext
  } from '$lib/ai/agentContext';
  import type { AgentActionProposal } from '$lib/ai/scenePrompts';
  import { curatorAgent } from '$lib/services/curatorAgent.svelte';
  import { listeningQueue } from '$lib/services/listeningQueue';
  import StreamingTrigger from '$lib/components/studio/StreamingTrigger.svelte';
  import AgentActionCards from '$lib/components/studio/AgentActionCards.svelte';
  import {
    Send,
    Sparkles,
    Disc,
    Plus,
    Check,
    Compass,
    Headphones,
    Loader2,
    Minimize2
  } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    pageContext?: AgentPageContext;
    onselectArtist?: (id: string) => void;
    onquickPickup?: (artistName: string) => void;
    onexecuteAction?: (action: AgentActionProposal) => void;
    oncollapseToDrawer?: () => void;
    showToast?: (msg: string) => void;
  }

  let {
    artists = [],
    pageContext,
    onselectArtist,
    onquickPickup,
    onexecuteAction,
    oncollapseToDrawer,
    showToast
  }: Props = $props();

  let userInput = $state('');
  let turnCount = $derived(curatorAgent.messages.filter((m) => m.role === 'user').length);
  const quickChips = $derived(pageContext ? getQuickChipsForContext(pageContext, i18n.locale) : []);

  // 滾動容器參考
  let chatScrollElement = $state<HTMLDivElement | null>(null);

  // 初始化時還原先前對話與策展狀態（與跨頁副駕抽屜共享同一份全域狀態）
  onMount(() => {
    curatorAgent.initFromSession(artists);
    curatorAgent.recomputeLocalMatches(artists);
    scrollToBottom();
  });

  // 當對話更新時自動捲動到底部
  async function scrollToBottom() {
    await tick();
    if (chatScrollElement) {
      chatScrollElement.scrollTop = chatScrollElement.scrollHeight;
    }
  }

  // 發送情境對話（支援自定義追問文字）
  async function handleSendMessage(overrideText?: string) {
    const textToSend = (overrideText !== undefined ? overrideText : userInput).trim();
    if (!textToSend || curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0) return;

    if (overrideText === undefined) {
      userInput = '';
    }
    await scrollToBottom();
    const ok = await curatorAgent.sendMessage(
      textToSend,
      artists,
      i18n.locale,
      pageContext,
      showToast
    );
    if (ok) {
      await scrollToBottom();
    }
  }

  // 一鍵請 AI 深度介紹特定藝人與推薦專輯
  function handleAskAboutArtist(artistName: string) {
    if (curatorAgent.isLoading) return;
    const prompt = t('radio_ask_artist_prompt', { name: artistName });
    handleSendMessage(prompt);
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
    userInput = '';
    curatorAgent.reset(showToast);
  }

  // 快速將庫內藝人排入聆賞隊列
  function handleEnqueueArtist(artist: ArtistEntry) {
    listeningQueue.add({
      artistId: artist.id,
      artistName: artist.name,
      albumTitle: artist.analysis?.notableAlbums?.[0]?.title || t('radio_featured_work_fallback'),
      albumYear: artist.analysis?.notableAlbums?.[0]?.year,
      appleMusicUrl: artist.analysis?.notableAlbums?.[0]?.appleMusicSearchUrl,
      losslessSpec: artist.analysis?.notableAlbums?.[0]?.losslessSpec,
      dynamicRangeScore: artist.analysis?.notableAlbums?.[0]?.dynamicRangeScore
    });
    showToast?.(t('radio_queued_toast', { name: artist.name }));
  }

  // 快速拾音外部推薦藝人
  function handlePickupExternal(name: string) {
    curatorAgent.markExternalPicked(name);
    if (onquickPickup) {
      onquickPickup(name);
    } else {
      showToast?.(t('radio_pickup_toast', { name }));
    }
  }
</script>

<div class="h-full flex flex-col lg:flex-row gap-4 select-none font-mono">
  <!-- 左側：多輪對話互動舞台 -->
  <div class="flex-1 flex flex-col bg-chassis border border-wire rounded-[2px] overflow-hidden min-h-[460px] lg:min-h-0">
    <!-- 對話頂部狀態列 -->
    <div class="px-4 py-3 border-b border-wire bg-void/60 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span class="w-2 h-2 rounded-full {curatorAgent.cooldownSeconds > 0 ? 'bg-red-400 animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.8)]' : curatorAgent.errorMessage ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]' : curatorAgent.isLoading ? 'bg-amber-400 animate-ping' : 'bg-signal shadow-[0_0_8px_rgba(234,179,8,0.8)]'}"></span>
        <span class="font-dot text-xs tracking-widest text-ink uppercase">AI.RECOMMEND // NEURAL_CURATOR</span>
      </div>
      <div class="flex items-center gap-2">
        {#if oncollapseToDrawer}
          <button
            type="button"
            onclick={oncollapseToDrawer}
            class="px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink hover:bg-panel border border-wire hover:border-signal/50 transition-colors rounded-[2px] flex items-center gap-1.5 cursor-pointer shadow-sm"
            title={t('agent_collapse_drawer')}
          >
            <Minimize2 class="w-3.5 h-3.5 text-ink-muted" />
            <span class="hidden sm:inline font-sans">{t('topbar_agent_btn')}</span>
          </button>
        {/if}
        {#if curatorAgent.messages.length > 0}
          <button
            type="button"
            onclick={handleReset}
            class="px-2.5 py-1 text-[11px] text-ink-muted hover:text-signal hover:bg-panel border border-wire hover:border-signal/50 transition-colors rounded-[2px] flex items-center gap-1.5 cursor-pointer shadow-sm"
            title={t('radio_new_chat_title')}
          >
            <Plus class="w-3.5 h-3.5 text-signal" />
            <span class="font-sans">{t('radio_new_chat_btn')}</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- 訊息捲動區域 -->
    <div
      bind:this={chatScrollElement}
      class="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar"
    >
      {#if curatorAgent.messages.length === 0}
        <!-- 初始空狀態引導 -->
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-ink-muted">
          <div class="w-12 h-12 rounded-full border border-wire flex items-center justify-center mb-3 bg-panel/30">
            <Compass class="w-6 h-6 text-signal/80" />
          </div>
          <p class="text-sm font-sans text-ink mb-1">{t('radio_welcome_title')}</p>
          <p class="text-xs text-ink-dim max-w-sm font-sans leading-relaxed">
            {t('radio_welcome_desc')}
          </p>
        </div>
      {:else}
        {#each curatorAgent.messages as msg}
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
                  <span>{t('radio_curator_header')}</span>
                </div>
                <p class="whitespace-pre-wrap leading-relaxed text-ink/90">{msg.content}</p>
              </div>
            </div>
          {/if}
        {/each}

        {#if curatorAgent.isLoading}
          <div class="flex justify-start">
            <div class="bg-panel border border-wire px-3 py-2 rounded-[2px] text-xs font-mono text-ink-muted flex items-center gap-2">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-signal" />
              <span>{t('radio_loading_text')}</span>
            </div>
          </div>
        {/if}

        {#if !curatorAgent.isLoading && curatorAgent.suggestedActions.length > 0}
          <AgentActionCards
            actions={curatorAgent.suggestedActions}
            executedIds={curatorAgent.executedActionIds}
            onexecute={onexecuteAction}
          />
        {/if}
      {/if}
    </div>

    <!-- 底部輸入區域 -->
    <div class="p-3 border-t border-wire bg-void/80 space-y-2">
      {#if quickChips.length > 0}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[9px] text-ink-dim uppercase tracking-wider mr-1">
            {t('agent_quick_chips_label')}
          </span>
          {#each quickChips as chip (chip.id)}
            <button
              type="button"
              disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
              onclick={() => handleSendMessage(chip.prompt)}
              class="px-2 py-1 text-[10px] font-sans rounded-[2px] border {chip.category === 'library'
                ? 'border-amber-500/40 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20'
                : 'border-wire text-ink bg-panel hover:border-signal hover:text-signal'} transition-colors cursor-pointer disabled:opacity-40"
            >
              {chip.label}
            </button>
          {/each}
        </div>
      {/if}
      {#if curatorAgent.errorMessage}
        <div class="text-[11px] text-red-400 font-mono">
          [ERR] {curatorAgent.errorMessage}
        </div>
      {/if}
      <div class="relative flex items-center">
        <!-- 保持中性引導，嚴禁提供範例以防範錨定偏差 -->
        <input
          type="text"
          bind:value={userInput}
          onkeydown={handleKeyDown}
          disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
          placeholder={t('radio_input_placeholder')}
          class="w-full bg-chassis border border-wire focus:border-signal text-ink placeholder:text-ink-dim px-3.5 py-2.5 pr-12 text-xs font-sans rounded-[2px] outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onclick={() => handleSendMessage()}
          disabled={!userInput.trim() || curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
          class="absolute right-1.5 p-1.5 bg-signal text-void hover:bg-signal/90 disabled:opacity-30 disabled:hover:bg-signal transition-all rounded-[2px] cursor-pointer"
          title={t('radio_send_title')}
        >
          <Send class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="flex justify-between items-center text-[10px] text-ink-dim mt-2 px-1 gap-2">
        {#if curatorAgent.cooldownSeconds > 0}
          <span class="text-red-400 font-medium">{t('radio_hint_cooldown', { seconds: curatorAgent.cooldownSeconds })}</span>
        {:else if turnCount >= 10}
          <span class="text-amber-400/90">{t('radio_hint_long_session', { count: turnCount })}</span>
        {:else if turnCount > 0}
          <span>{t('radio_hint_turn', { count: turnCount })}</span>
        {:else}
          <span>{t('radio_hint_left')}</span>
        {/if}
        <span class="shrink-0">{t('radio_hint_right')}</span>
      </div>
    </div>
  </div>

  <!-- 右側：即時雙軌成果呈現看板 -->
  <div class="w-full lg:w-[420px] flex flex-col gap-4 overflow-hidden">
    <!-- 1. 當前聚焦之風格標籤 (Acoustic Genres) -->
    {#if curatorAgent.activeMatchedGenres.length > 0}
      <div class="bg-chassis border border-wire p-3 rounded-[2px]">
        <div class="flex items-center gap-1.5 text-[10px] text-ink-muted uppercase tracking-wider mb-2">
          <Disc class="w-3 h-3 text-signal" />
          <span>{t('radio_genres_header')}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each curatorAgent.activeMatchedGenres as genre}
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
          <span class="text-xs text-ink font-bold font-sans">{t('radio_local_title')}</span>
        </div>
        <span class="text-[10px] text-ink-dim">
          {t('radio_local_count', { count: curatorAgent.localMatches.length })}
        </span>
      </div>

      <div class="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar">
        {#if curatorAgent.localMatches.length === 0}
          <div class="h-full flex items-center justify-center text-center p-4 text-ink-dim text-xs font-sans">
            {#if curatorAgent.activeMatchedGenres.length === 0}
              {t('radio_local_empty_idle')}
            {:else}
              {t('radio_local_empty_none')}
            {/if}
          </div>
        {:else}
          {#each curatorAgent.localMatches as match}
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
                  {t('radio_hit_genres', { genres: match.hitGenres.join(', ') })}
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onclick={() => handleAskAboutArtist(match.artist.name)}
                  disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
                  class="px-1.5 py-1 text-[10px] text-ink-muted hover:text-signal hover:bg-void border border-wire hover:border-signal/50 rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  title={t('radio_ask_ai_title')}
                >
                  <Sparkles class="w-3 h-3 text-signal" />
                  <span class="hidden sm:inline">{t('radio_ask_ai_btn')}</span>
                </button>

                <StreamingTrigger
                  artistName={match.artist.name}
                  albumTitle={match.artist.analysis?.notableAlbums?.[0]?.title}
                  appleMusicUrl={match.artist.appleMusicUrl}
                  variant="subtle"
                />

                <button
                  type="button"
                  onclick={() => handleEnqueueArtist(match.artist)}
                  class="p-1 text-ink-muted hover:text-emerald-400 hover:bg-void border border-wire hover:border-emerald-500/50 rounded-[2px] transition-colors cursor-pointer"
                  title={t('radio_queue_add_title')}
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
          <span class="text-xs text-ink font-bold font-sans">{t('radio_external_title')}</span>
        </div>
        <span class="text-[10px] text-ink-dim">
          {t('radio_external_count', { count: curatorAgent.externalRecommendations.length })}
        </span>
      </div>

      <div class="flex-1 p-3 overflow-y-auto space-y-2 custom-scrollbar">
        {#if curatorAgent.externalRecommendations.length === 0}
          <div class="h-full flex items-center justify-center text-center p-4 text-ink-dim text-xs font-sans">
            {t('radio_external_empty')}
          </div>
        {:else}
          {#each curatorAgent.externalRecommendations as ext}
            {@const isExtPicked = curatorAgent.addedExternalNames.includes(ext.name)}
            <div class="p-2.5 bg-panel/50 hover:bg-panel border border-wire hover:border-signal/50 rounded-[2px] transition-colors flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-sans text-xs font-bold text-ink truncate">{ext.name}</span>
                  <span class="text-[9px] px-1 py-0.2 bg-signal-dim border border-signal/40 text-signal rounded-[2px] shrink-0">
                    {ext.subGenre}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onclick={() => handleAskAboutArtist(ext.name)}
                    disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
                    class="px-1.5 py-0.5 text-[10px] text-ink-muted hover:text-signal hover:bg-void border border-wire hover:border-signal/50 rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    title={t('radio_ask_ai_title')}
                  >
                    <Sparkles class="w-3 h-3 text-signal" />
                    <span>{t('radio_ask_ai_btn')}</span>
                  </button>

                  <StreamingTrigger
                    artistName={ext.name}
                    variant="subtle"
                  />

                  <button
                    type="button"
                    disabled={isExtPicked}
                    onclick={() => handlePickupExternal(ext.name)}
                    class="px-2 py-0.5 text-[10px] border {isExtPicked ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-wire hover:border-signal text-ink-muted hover:text-signal bg-void'} rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-default"
                    title={t('radio_pickup_title')}
                  >
                    {#if isExtPicked}
                      <Check class="w-3 h-3" />
                      <span>{t('radio_picked_btn')}</span>
                    {:else}
                      <Plus class="w-3 h-3" />
                      <span>{t('radio_pickup_btn')}</span>
                    {/if}
                  </button>
                </div>
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
