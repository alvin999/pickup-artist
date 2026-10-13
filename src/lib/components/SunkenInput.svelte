<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    label?: string;
    onenter?: (val: string) => void;
    oninput?: (val: string) => void;
    class?: string;
    autofocus?: boolean;
    disabled?: boolean;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    label = '',
    onenter,
    oninput,
    class: className = '',
    autofocus = false,
    disabled = false
  }: Props = $props();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      onenter?.(value);
    }
  }

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    value = val;
    oninput?.(val);
  }
  let inputId = `sunken-input-${Math.random().toString(36).substring(2, 9)}`;
</script>

<div class="flex flex-col gap-1 w-full {className}">
  {#if label}
    <label for={inputId} class="font-mono text-[11px] uppercase tracking-widest text-[#8E9298] font-medium flex items-center gap-1.5 select-none">
      <span class="w-1.5 h-1.5 bg-[#E0A96D]/70 rounded-full inline-block"></span>
      {label}
    </label>
  {/if}
  <div class="relative w-full group">
    <input
      id={inputId}
      type="text"
      bind:value
      {placeholder}
      {disabled}
      onkeydown={handleKeyDown}
      oninput={handleInput}
      class="w-full bg-[#040405] text-[#EEF0F2] placeholder-[#52565E] font-sans text-sm px-3.5 py-2.5 rounded-[3px] border border-[#1F2228] transition-all shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)] focus:outline-none focus:border-[#E0A96D] focus:shadow-[inset_0_1px_3px_rgba(0,0,0,0.95),0_0_14px_rgba(224,169,109,0.18)] disabled:opacity-50"
    />
  </div>
</div>
