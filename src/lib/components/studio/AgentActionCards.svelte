<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { AgentActionProposal, AgentActionType } from '$lib/ai/scenePrompts';
  import {
    Compass,
    Search,
    ListPlus,
    PlusCircle,
    Cpu,
    Layers,
    SlidersHorizontal,
    FileEdit,
    Check,
    Play
  } from 'lucide-svelte';

  interface Props {
    actions: AgentActionProposal[];
    executedIds: string[];
    onexecute?: (action: AgentActionProposal) => void;
    compact?: boolean;
  }

  let {
    actions = [],
    executedIds = [],
    onexecute,
    compact = false
  }: Props = $props();

  const ACTION_ICON_MAP: Record<AgentActionType, typeof Compass> = {
    navigate_artist: Compass,
    filter_library: Search,
    add_to_queue: ListPlus,
    quick_pickup: PlusCircle,
    enqueue_analysis: Cpu,
    analyze_all_inbox: Layers,
    update_artist_weight: SlidersHorizontal,
    append_artist_notes: FileEdit
  };
</script>

{#if actions.length > 0}
  <div class="space-y-1.5">
    <div class="text-[10px] font-mono text-ink-muted uppercase tracking-wider px-0.5">
      {t('agent_actions_header')}
    </div>
    <div class="space-y-1.5">
      {#each actions as action (action.id)}
        {@const isDone = executedIds.includes(action.id)}
        {@const IconComp = ACTION_ICON_MAP[action.type] || Compass}
        <div
          class="p-2 bg-panel/70 border {isDone
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-wire hover:border-signal/50'} rounded-[2px] flex items-center justify-between gap-2 transition-colors"
        >
          <div class="flex items-start gap-2 min-w-0">
            <div
              class="w-6 h-6 rounded-[2px] border {isDone
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                : 'border-wire text-signal bg-void/70'} flex items-center justify-center shrink-0 mt-0.5"
            >
              <IconComp class="w-3.5 h-3.5" />
            </div>
            <div class="min-w-0">
              <div class="text-xs font-sans font-bold text-ink truncate">
                {action.label}
              </div>
              {#if action.description && !compact}
                <p class="text-[10px] font-sans text-ink-dim leading-snug mt-0.5 line-clamp-2">
                  {action.description}
                </p>
              {:else if action.artistName}
                <div class="text-[10px] font-mono text-ink-dim truncate">
                  {action.artistName}{action.albumTitle ? ` · ${action.albumTitle}` : ''}
                </div>
              {/if}
            </div>
          </div>

          <button
            type="button"
            disabled={isDone}
            onclick={() => onexecute?.(action)}
            class="shrink-0 px-2 py-1 text-[10px] font-mono rounded-[2px] border transition-all flex items-center gap-1 cursor-pointer disabled:cursor-default {isDone
              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
              : 'border-signal/60 text-signal hover:bg-signal hover:text-void bg-void/80'}"
          >
            {#if isDone}
              <Check class="w-3 h-3" />
              <span>{t('agent_action_done')}</span>
            {:else}
              <Play class="w-3 h-3" />
              <span>{t('agent_action_execute')}</span>
            {/if}
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
