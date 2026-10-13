<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    type?: 'hires' | 'lossless' | 'dr' | 'vinyl' | 'inbox' | 'analyzed' | 'neutral';
    text?: string;
    children?: Snippet;
    class?: string;
  }

  let {
    type = 'neutral',
    text = '',
    children,
    class: className = ''
  }: Props = $props();

  const badgeStyles = {
    hires: 'bg-[#180A0C] text-[#FA383E] border-[#FA383E]/50 shadow-[0_0_8px_rgba(250,56,62,0.15)]',
    lossless: 'bg-[#141009] text-[#FEC486] border-[#E0A96D]/50 shadow-[0_0_8px_rgba(224,169,109,0.15)]',
    dr: 'bg-[#0E1513] text-[#78E08F] border-[#78E08F]/40',
    vinyl: 'bg-[#1A1610] text-[#E0A96D] border-[#E0A96D]/60',
    inbox: 'bg-[#17191E] text-[#8E9298] border-[#2A2E38]',
    analyzed: 'bg-[#111A16] text-[#63C78B] border-[#254C34]',
    neutral: 'bg-[#0B0C0E] text-[#8E9298] border-[#252930]'
  };
</script>

<span
  class="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase font-semibold px-1.5 py-0.5 rounded-[2px] border select-none leading-none {badgeStyles[type]} {className}"
>
  {#if text}
    {text}
  {/if}
  {@render children?.()}
</span>
