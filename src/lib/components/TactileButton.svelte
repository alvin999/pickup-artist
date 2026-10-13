<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'amber' | 'crimson' | 'titanium' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    class?: string;
    title?: string;
  }

  let {
    variant = 'amber',
    size = 'md',
    disabled = false,
    onclick,
    children,
    class: className = '',
    title
  }: Props = $props();

  const baseStyles = 'inline-flex items-center justify-center font-mono font-medium transition-all select-none rounded-[3px] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 cursor-pointer';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1 tracking-wider',
    md: 'text-xs px-3.5 py-1.5 tracking-wider',
    lg: 'text-sm px-5 py-2.5 tracking-widest'
  };

  const variantStyles = {
    amber: 'bg-[#1A1D22] text-[#FEC486] border border-[#E0A96D]/40 hover:border-[#E0A96D] hover:bg-[#22262D] hover:shadow-[0_0_12px_rgba(224,169,109,0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_3px_rgba(0,0,0,0.8)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]',
    crimson: 'bg-[#FA383E] text-white border border-[#FF6B70] hover:bg-[#E0262C] hover:shadow-[0_0_14px_rgba(250,56,62,0.35)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_3px_rgba(0,0,0,0.8)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]',
    titanium: 'bg-[#14161A] text-[#CCCFD6] border border-[#2B2F38] hover:border-[#8E9298] hover:bg-[#1B1E24] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.7)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]',
    ghost: 'bg-transparent text-[#8E9298] hover:text-[#EEF0F2] hover:bg-[#1A1D22]/60 border border-transparent'
  };
</script>

<button
  type="button"
  {disabled}
  {onclick}
  {title}
  class="{baseStyles} {sizeStyles[size]} {variantStyles[variant]} {className}"
>
  {@render children?.()}
</button>
