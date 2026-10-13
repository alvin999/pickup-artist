<script lang="ts">
  import { i18n, type SupportedLocale } from '$lib/i18n/index.svelte';

  const locales: { id: SupportedLocale; label: string }[] = [
    { id: 'zh-TW', label: '繁中' },
    { id: 'en', label: 'EN' },
    { id: 'ja', label: '日本語' }
  ];
</script>

<div class="inline-flex items-center p-0.5 rounded-[3px] bg-[#040405] border border-[#1F2228] select-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]">
  {#each locales as item}
    <button
      type="button"
      onclick={() => i18n.setLocale(item.id)}
      class="px-2 py-0.5 font-mono text-[11px] rounded-[2px] transition-all tracking-wider font-semibold cursor-pointer {i18n.locale === item.id ? 'bg-[#1E222A] text-[#FEC486] shadow-[0_1px_2px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] border border-[#E0A96D]/40' : 'text-[#8E9298] hover:text-[#EEF0F2] border border-transparent'}"
    >
      {item.label}
    </button>
  {/each}
</div>
