<script lang="ts">
  import { tick } from 'svelte';
  import { i18n, t } from '$lib/i18n/index.svelte';
  import type { ArtistEntry } from '$lib/types/artist';
  import {
    getQuickChipsForContext,
    type AgentPageContext,
    type StudioViewId
  } from '$lib/ai/agentContext';
  import type { AgentActionProposal } from '$lib/ai/scenePrompts';
  import { curatorAgent } from '$lib/services/curatorAgent.svelte';
  import { listeningQueue } from '$lib/services/listeningQueue';
  import AgentActionCards from '$lib/components/studio/AgentActionCards.svelte';
  import {
    X,
    Maximize2,
    Plus,
    Send,
    Sparkles,
    Compass,
    Loader2,
    ChevronDown,
    ChevronUp,
    Headphones,
    Check
  } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    pageContext: AgentPageContext;
    onselectArtist?: (id: string) => void;
    onquickPickup?: (artistName: string) => void;
    onexpandFullView?: () => void;
    onexecuteAction?: (action: AgentActionProposal) => void;
    showToast?: (msg: string) => void;
  }

  let {
    artists = [],
    pageContext,
    onselectArtist,
    onquickPickup,
    onexpandFullView,
    onexecuteAction,
    showToast
  }: Props = $props();

  let userInput = $state('');
  let showMatches = $state(false);
  let chatScrollEl = $state<HTMLDivElement | null>(null);

  const quickChips = $derived(getQuickChipsForContext(pageContext, i18n.locale));
  const turnCount = $derived(curatorAgent.messages.filter((m) => m.role === 'user').length);

  const VIEW_LABEL_MAP: Record<StudioViewId, () => string> = {
    'crate-digger': () => t('agent_view_crate_digger'),
    'honeycomb-cluster': () => t('agent_view_honeycomb_cluster'),
    'acoustic-matrix': () => t('agent_view_acoustic_matrix'),
    'listening-queue': () => t('agent_view_listening_queue'),
    'listening-log': () => t('agent_view_listening_log'),
    'ai-recommend': () => t('agent_view_ai_recommend')
  };

  const currentViewLabel = $derived(VIEW_LABEL_MAP[pageContext.activeView]?.() || pageContext.activeView);

  async function scrollToBottom() {
    await tick();
    if (chatScrollEl) {
      chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
    }
  }

  $effect(() => {
    if (curatorAgent.isOpen && curatorAgent.messages.length >= 0) {
      scrollToBottom();
    }
  });

  async function handleSend(overrideText?: string) {
    const text = (overrideText !== undefined ? overrideText : userInput).trim();
    if (!text || curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0) return;
    if (overrideText === undefined) {
      userInput = '';
    }
    const ok = await curatorAgent.sendMessage(
      text,
      artists,
      i18n.locale,
      pageContext,
      showToast
    );
    if (ok) {
      await scrollToBottom();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      curatorAgent.closeDrawer();
    }
  }

  function handleEnqueueLocal(artist: ArtistEntry) {
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

  function handlePickupExternal(name: string) {
    curatorAgent.markExternalPicked(name);
    if (onquickPickup) {
      onquickPickup(name);
    } else {
      showToast?.(t('radio_pickup_toast', { name }));
    }
  }
</script>

{#if curatorAgent.isOpen}
  <aside
    class="fixed top-16 right-0 bottom-0 w-full sm:w-[420px] z-40 bg-void/98 backdrop-blur-md border-l border-wire shadow-[-12px_0_36px_rgba(0,0,0,0.65)] flex flex-col font-mono animate-fadeIn"
    aria-label={t('agent_drawer_title')}
  >
    <!-- 頂部標題與控制列 -->
    <div class="px-3.5 py-2.5 border-b border-wire bg-chassis flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="w-2 h-2 rounded-full shrink-0 {curatorAgent.cooldownSeconds > 0
            ? 'bg-red-400 animate-pulse'
            : curatorAgent.isLoading
              ? 'bg-amber-400 animate-ping'
              : 'bg-signal shadow-[0_0_8px_rgba(255,42,60,0.7)]'}"
        ></span>
        <span class="font-dot text-[11px] tracking-widest text-ink uppercase truncate">
          {t('agent_drawer_title')}
        </span>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        {#if curatorAgent.messages.length > 0}
          <button
            type="button"
            onclick={() => curatorAgent.reset(showToast)}
            title={t('radio_new_chat_title')}
            class="p-1.5 text-ink-muted hover:text-signal hover:bg-panel border border-transparent hover:border-wire rounded-[2px] transition-colors cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        {/if}

        {#if onexpandFullView}
          <button
            type="button"
            onclick={() => {
              curatorAgent.closeDrawer();
              onexpandFullView?.();
            }}
            title={t('agent_expand_full')}
            class="p-1.5 text-ink-muted hover:text-ink hover:bg-panel border border-transparent hover:border-wire rounded-[2px] transition-colors cursor-pointer"
          >
            <Maximize2 class="w-3.5 h-3.5" />
          </button>
        {/if}

        <button
          type="button"
          onclick={() => curatorAgent.closeDrawer()}
          title={t('agent_close_drawer')}
          class="p-1.5 text-ink-muted hover:text-signal hover:bg-panel border border-transparent hover:border-wire rounded-[2px] transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 當前頁面情境感知條 -->
    <div class="px-3.5 py-2 border-b border-wire/70 bg-[#101116] flex items-center justify-between gap-2 text-[10px] shrink-0">
      <div class="flex items-center gap-1.5 min-w-0 text-ink-muted">
        <span class="px-1.5 py-0.5 bg-panel border border-wire rounded-[2px] text-ink truncate">
          {t('agent_context_badge', { view: currentViewLabel })}
        </span>
        {#if pageContext.selectedArtist}
          <span class="text-signal truncate font-sans font-bold">
            · {pageContext.selectedArtist.name}
          </span>
        {/if}
      </div>

      {#if pageContext.inboxCount > 0}
        <span class="shrink-0 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-[2px]">
          {t('agent_context_inbox', { count: pageContext.inboxCount })}
        </span>
      {/if}
    </div>

    <!-- 對話與動作提案捲動區 -->
    <div
      bind:this={chatScrollEl}
      class="flex-1 p-3.5 overflow-y-auto space-y-3 custom-scrollbar"
    >
      {#if curatorAgent.messages.length === 0}
        <div class="py-8 flex flex-col items-center justify-center text-center px-4 text-ink-muted">
          <div class="w-10 h-10 rounded-full border border-wire flex items-center justify-center mb-2.5 bg-panel/40">
            <Compass class="w-5 h-5 text-signal/80" />
          </div>
          <p class="text-xs font-sans font-bold text-ink mb-1">{t('radio_welcome_title')}</p>
          <p class="text-[11px] text-ink-dim font-sans leading-relaxed">
            {t('radio_welcome_desc')}
          </p>
        </div>
      {:else}
        {#each curatorAgent.messages as msg}
          {#if msg.role === 'user'}
            <div class="flex justify-end">
              <div class="max-w-[85%] bg-ink text-void px-3 py-2 rounded-[2px] text-xs font-sans shadow-sm">
                <p class="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          {:else}
            <div class="flex justify-start">
              <div class="max-w-[92%] bg-panel border border-wire px-3 py-2 rounded-[2px] text-xs font-sans text-ink">
                <div class="flex items-center gap-1.5 font-mono text-[10px] text-signal mb-1">
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

        <!-- Phase 3: 互動式動作提案卡片 -->
        {#if !curatorAgent.isLoading && curatorAgent.suggestedActions.length > 0}
          <div class="pt-1">
            <AgentActionCards
              actions={curatorAgent.suggestedActions}
              executedIds={curatorAgent.executedActionIds}
              onexecute={onexecuteAction}
              compact={true}
            />
          </div>
        {/if}

        <!-- 可折疊的庫內 / 庫外匹配列表 -->
        {#if curatorAgent.localMatches.length > 0 || curatorAgent.externalRecommendations.length > 0}
          <div class="border border-wire rounded-[2px] bg-chassis/70 overflow-hidden">
            <button
              type="button"
              onclick={() => (showMatches = !showMatches)}
              class="w-full px-2.5 py-2 flex items-center justify-between text-[11px] font-sans text-ink hover:bg-panel/60 transition-colors cursor-pointer"
            >
              <span class="flex items-center gap-1.5">
                <Headphones class="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {t('agent_drawer_results_toggle', {
                    local: curatorAgent.localMatches.length,
                    ext: curatorAgent.externalRecommendations.length
                  })}
                </span>
              </span>
              {#if showMatches}
                <ChevronUp class="w-3.5 h-3.5 text-ink-muted" />
              {:else}
                <ChevronDown class="w-3.5 h-3.5 text-ink-muted" />
              {/if}
            </button>

            {#if showMatches}
              <div class="p-2 border-t border-wire space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {#each curatorAgent.localMatches.slice(0, 6) as match}
                  <div class="p-2 bg-panel/60 border border-wire rounded-[2px] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onclick={() => onselectArtist?.(match.artist.id)}
                      class="text-xs font-sans font-bold text-ink hover:text-signal truncate text-left cursor-pointer"
                    >
                      {match.artist.name}
                    </button>
                    <button
                      type="button"
                      onclick={() => handleEnqueueLocal(match.artist)}
                      title={t('radio_queue_add_title')}
                      class="p-1 text-ink-muted hover:text-emerald-400 border border-wire hover:border-emerald-500/50 rounded-[2px] cursor-pointer shrink-0"
                    >
                      <Plus class="w-3 h-3" />
                    </button>
                  </div>
                {/each}

                {#each curatorAgent.externalRecommendations as ext}
                  {@const picked = curatorAgent.addedExternalNames.includes(ext.name)}
                  <div class="p-2 bg-panel/40 border border-wire/80 rounded-[2px] flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-sans font-bold text-ink truncate">{ext.name}</div>
                      <div class="text-[10px] text-signal/80 truncate">{ext.subGenre}</div>
                    </div>
                    <button
                      type="button"
                      disabled={picked}
                      onclick={() => handlePickupExternal(ext.name)}
                      class="px-2 py-0.5 text-[10px] border {picked
                        ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                        : 'border-wire hover:border-signal text-ink-muted hover:text-signal bg-void'} rounded-[2px] flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {#if picked}
                        <Check class="w-3 h-3" />
                        <span>{t('radio_picked_btn')}</span>
                      {:else}
                        <Plus class="w-3 h-3" />
                        <span>{t('radio_pickup_btn')}</span>
                      {/if}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- 底部零 Token 快捷提問與輸入區 -->
    <div class="p-3 border-t border-wire bg-chassis/95 shrink-0 space-y-2">
      {#if quickChips.length > 0}
        <div class="space-y-1">
          <div class="text-[9px] text-ink-dim uppercase tracking-wider">
            {t('agent_quick_chips_label')}
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each quickChips as chip (chip.id)}
              <button
                type="button"
                disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
                onclick={() => handleSend(chip.prompt)}
                class="px-2 py-1 text-[10px] font-sans rounded-[2px] border {chip.category === 'library'
                  ? 'border-amber-500/40 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20'
                  : 'border-wire text-ink bg-panel hover:border-signal hover:text-signal'} transition-colors cursor-pointer disabled:opacity-40 text-left"
              >
                {chip.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if curatorAgent.errorMessage}
        <div class="text-[10px] text-red-400 font-mono break-words">
          [ERR] {curatorAgent.errorMessage}
        </div>
      {/if}

      <div class="relative flex items-center">
        <input
          type="text"
          bind:value={userInput}
          onkeydown={handleKeyDown}
          disabled={curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
          placeholder={t('radio_input_placeholder')}
          class="w-full bg-void border border-wire focus:border-signal text-ink placeholder:text-ink-dim px-3 py-2 pr-10 text-xs font-sans rounded-[2px] outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onclick={() => handleSend()}
          disabled={!userInput.trim() || curatorAgent.isLoading || curatorAgent.cooldownSeconds > 0}
          class="absolute right-1.5 p-1.5 bg-signal text-void hover:bg-signal/90 disabled:opacity-30 transition-all rounded-[2px] cursor-pointer"
          title={t('radio_send_title')}
        >
          <Send class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="flex justify-between items-center text-[9px] text-ink-dim px-0.5">
        {#if curatorAgent.cooldownSeconds > 0}
          <span class="text-red-400">{t('radio_hint_cooldown', { seconds: curatorAgent.cooldownSeconds })}</span>
        {:else if turnCount > 0}
          <span>{t('radio_hint_turn', { count: turnCount })}</span>
        {:else}
          <span>CTRL+. // TOGGLE</span>
        {/if}
        <span>{t('radio_hint_right')}</span>
      </div>
    </div>
  </aside>
{/if}
