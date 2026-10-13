<script lang="ts">
  interface Props {
    status?: 'active' | 'syncing' | 'idle' | 'warning' | 'offline';
    pulse?: boolean;
    label?: string;
    class?: string;
  }

  let {
    status = 'active',
    pulse = false,
    label = '',
    class: className = ''
  }: Props = $props();

  const statusColors = {
    active: 'bg-[#63C78B] shadow-[0_0_8px_rgba(99,199,139,0.8)]',
    syncing: 'bg-[#FEC486] shadow-[0_0_8px_rgba(254,196,134,0.9)] animate-pulse',
    idle: 'bg-[#E0A96D]/70 shadow-[0_0_6px_rgba(224,169,109,0.5)]',
    warning: 'bg-[#FA383E] shadow-[0_0_8px_rgba(250,56,62,0.8)]',
    offline: 'bg-[#52565E]'
  };
</script>

<div class="inline-flex items-center gap-2 select-none {className}">
  <span class="relative flex h-2 w-2">
    {#if pulse || status === 'syncing'}
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 {statusColors[status]}"></span>
    {/if}
    <span class="relative inline-flex rounded-full h-2 w-2 {statusColors[status]}"></span>
  </span>
  {#if label}
    <span class="font-mono text-[11px] text-[#8E9298] tracking-wider uppercase font-medium">
      {label}
    </span>
  {/if}
</div>
