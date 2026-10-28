<script lang="ts">
  import { Flame } from 'lucide-svelte';

  interface Props {
    weight?: number;
    variant?: 'compact' | 'detailed';
    disabled?: boolean;
    label?: string;
    showLabel?: boolean;
    onchange?: (newWeight: number) => void;
  }

  let {
    weight = 20,
    variant = 'compact',
    disabled = false,
    label = 'GRAVITY',
    showLabel = true,
    onchange
  }: Props = $props();

  // 本地輸入暫存（用於數字輸入框，避免打字過程中被外層 state 立即重置）
  let inputVal = $state('');
  let isEditing = $state(false);

  // 指針角度計算：-80deg (1) ~ +80deg (100)
  const clampedWeight = $derived(Math.max(1, Math.min(100, Math.round(weight))));

  // 當外部 weight 改變且不在編輯中時同步
  $effect(() => {
    if (!isEditing) {
      inputVal = clampedWeight.toString();
    }
  });

  const needleAngle = $derived.by(() => {
    const ratio = (clampedWeight - 1) / 99; // 0 ~ 1
    return -80 + ratio * 160;
  });

  // 引力等級與配色
  const tierColor = $derived.by(() => {
    if (clampedWeight >= 100) return '#FA383E'; // 超重恆星 (信號紅)
    if (clampedWeight >= 70) return '#FEC486';  // 氣態巨星 (橙金)
    if (clampedWeight >= 20) return '#4080FF';  // 標準岩質星 (天體藍 / 琥珀)
    return '#8E9298';                          // 小行星 (暗灰)
  });

  const tierGlow = $derived.by(() => {
    if (clampedWeight >= 100) return 'rgba(250, 56, 62, 0.45)';
    if (clampedWeight >= 70) return 'rgba(254, 196, 134, 0.45)';
    if (clampedWeight >= 20) return 'rgba(64, 128, 255, 0.3)';
    return 'transparent';
  });

  const tierName = $derived.by(() => {
    if (clampedWeight >= 100) return '超重恆星';
    if (clampedWeight >= 70) return '氣態巨星';
    if (clampedWeight >= 20) return '岩質星';
    return '小行星';
  });

  // 天體行星質量基準階級 (點擊快速吸附 Snap)
  const PLANET_TIERS = [
    { label: '小行星', value: 1, min: 1, max: 19, color: '#8E9298' },
    { label: '岩質星', value: 20, min: 20, max: 69, color: '#4080FF' },
    { label: '氣態巨星', value: 70, min: 70, max: 99, color: '#FEC486' },
    { label: '超重星', value: 100, min: 100, max: 100, color: '#FA383E' }
  ] as const;

  // 循環切換天體階級
  function cycleTier() {
    if (disabled) return;
    if (clampedWeight < 20) commitWeight(20);
    else if (clampedWeight < 70) commitWeight(70);
    else if (clampedWeight < 100) commitWeight(100);
    else commitWeight(1);
  }

  // 動畫衝擊波 trigger
  let rippleKey = $state(0);
  let isBreakthrough = $state(false);
  let prevWeight: number | null = null;

  function triggerFeedback(newWeight: number) {
    if (prevWeight !== null && prevWeight < 70 && newWeight >= 70) {
      isBreakthrough = true;
      setTimeout(() => {
        isBreakthrough = false;
      }, 700);
    }
    prevWeight = newWeight;
    rippleKey += 1;
  }

  function commitWeight(val: number) {
    if (disabled) return;
    const next = Math.max(1, Math.min(100, Math.round(val)));
    if (next !== clampedWeight) {
      triggerFeedback(next);
      onchange?.(next);
    }
    inputVal = next.toString();
  }

  function handleStep(delta: number) {
    commitWeight(clampedWeight + delta);
  }

  function handleInputBlur() {
    isEditing = false;
    const parsed = parseInt(inputVal, 10);
    if (isNaN(parsed)) {
      inputVal = clampedWeight.toString();
    } else {
      commitWeight(parsed);
    }
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep(e.shiftKey ? 5 : 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep(e.shiftKey ? -5 : -1);
    }
  }

  // 支援滑鼠滾輪直接在儀表盤上滑動調校
  function handleWheel(e: WheelEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 5 : 1;
    if (e.deltaY < 0) {
      handleStep(step);
    } else if (e.deltaY > 0) {
      handleStep(-step);
    }
  }

  // 支援拖曳 / 點擊半圓儀表調整
  let isDragging = $state(false);
  let gaugeSvgEl = $state<SVGSVGElement | null>(null);

  function calculateWeightFromPointer(clientX: number, clientY: number) {
    if (!gaugeSvgEl) return;
    const rect = gaugeSvgEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    // 圓心在底部中心偏上一點
    const centerY = rect.bottom - (variant === 'compact' ? 4 : 10);
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // 計算相對於垂直向上 (0°) 的角度，範圍 -90° ~ +90°
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    deg = Math.max(-80, Math.min(80, deg));
    const ratio = (deg + 80) / 160;
    const target = Math.round(1 + ratio * 99);
    commitWeight(target);
  }

  function handlePointerDown(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    calculateWeightFromPointer(e.clientX, e.clientY);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    calculateWeightFromPointer(e.clientX, e.clientY);
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 忽略指標捕獲例外
    }
  }
</script>

{#if variant === 'compact'}
  <!-- ================= COMPACT 模式 (內嵌於卡片底欄) ================= -->
  <div
    class="gravity-gauge-compact flex items-center gap-1.5 font-mono select-none relative group/gauge"
    onwheel={handleWheel}
  >
    {#if showLabel}
      <span class="text-[9px] text-ink-dim tracking-wider font-semibold">{label}:</span>
    {/if}

    <!-- 步進按鈕 [-] -->
    <button
      type="button"
      {disabled}
      onclick={(e) => {
        e.stopPropagation();
        handleStep(e.shiftKey ? -5 : -1);
      }}
      class="w-4 h-4 flex items-center justify-center rounded-[2px] bg-void hover:bg-chassis border border-wire hover:border-signal text-ink-muted hover:text-signal text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="調降引力 -1 (按住 Shift -5)"
    >
      -
    </button>

    <!-- 半圓指針儀表 (SVG Dial) -->
    <div
      class="relative w-[36px] h-[20px] flex items-end justify-center cursor-ew-resize group-hover/gauge:scale-105 transition-transform"
      role="slider"
      tabindex="0"
      aria-label="Gravitational Weight"
      aria-valuenow={clampedWeight}
      aria-valuemin="1"
      aria-valuemax="100"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      title="點擊、拖曳或滾輪微調天體引力質量 ({tierName})"
    >
      <!-- 動態引力波微擴散環 (Shockwave) -->
      {#key rippleKey}
        <div
          class="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border border-signal/60 animate-ping opacity-75"
          style="border-color: {tierColor}; animation-duration: 0.6s;"
        ></div>
      {/key}

      <svg
        bind:this={gaugeSvgEl}
        viewBox="0 0 40 22"
        class="w-full h-full overflow-visible"
      >
        <defs>
          <!-- 刻度光暈濾鏡 -->
          <filter id="gauge-glow-sm" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        <!-- 背景刻度底弧 (R=16, Center 20, 19, -80deg ~ +80deg) -->
        <path
          d="M 4.24 16.22 A 16 16 0 0 1 35.76 16.22"
          fill="none"
          stroke="#1F232B"
          stroke-width="3"
          stroke-linecap="round"
        />

        <!-- 前景能量弧 (填色比率) -->
        <path
          d="M 4.24 16.22 A 16 16 0 0 1 35.76 16.22"
          fill="none"
          stroke={tierColor}
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray="45"
          stroke-dashoffset={45 - (clampedWeight / 100) * 45}
          style="filter: drop-shadow(0 0 2px {tierGlow}); transition: stroke-dashoffset 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.3s ease;"
        />

        <!-- 70 臨界點標記 (氣態巨星門檻刻度，可點擊直接切換至 70) -->
        <circle
          cx="28.3"
          cy="5.3"
          r="1.8"
          fill="#FEC486"
          role="button"
          tabindex="0"
          class="cursor-pointer hover:r-2.5 transition-all outline-none"
          onclick={(e) => {
            e.stopPropagation();
            commitWeight(70);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              commitWeight(70);
            }
          }}
        >
          <title>點擊切換至氣態巨星 (W-70)</title>
        </circle>

        <!-- 類比機械旋轉指針 (Needle) -->
        <g
          transform="translate(20, 19) rotate({needleAngle})"
          style="transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);"
        >
          <!-- 指針骨架 -->
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="-15"
            stroke={tierColor}
            stroke-width="1.5"
            stroke-linecap="round"
            style="filter: drop-shadow(0 0 1.5px {tierColor});"
          />
          <!-- 軸心裝飾珠 -->
          <circle cx="0" cy="0" r="2.5" fill="#0A0C10" stroke={tierColor} stroke-width="1" />
        </g>
      </svg>
    </div>

    <!-- 精準數字輸入框 (W-XX) -->
    <div
      class="flex items-center bg-void px-1 py-0.5 rounded-[2px] border border-wire hover:border-signal/50 focus-within:border-signal transition-colors shadow-inner"
    >
      <span class="text-[9px] font-bold text-ink-dim select-none">W-</span>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        bind:value={inputVal}
        onclick={(e) => e.stopPropagation()}
        onfocus={() => { isEditing = true; }}
        onblur={handleInputBlur}
        onkeydown={(e) => {
          e.stopPropagation();
          handleInputKeydown(e);
        }}
        {disabled}
        class="w-5 text-[10px] font-bold font-mono bg-transparent text-center outline-none p-0 m-0 {clampedWeight >= 70 ? 'text-[#FEC486]' : 'text-ink'}"
        title="直接手動輸入 1~100 (按 Enter 確認，↑↓ 微調)"
      />
    </div>

    <!-- 步進按鈕 [+] -->
    <button
      type="button"
      {disabled}
      onclick={(e) => {
        e.stopPropagation();
        handleStep(e.shiftKey ? 5 : 1);
      }}
      class="w-4 h-4 flex items-center justify-center rounded-[2px] bg-void hover:bg-chassis border border-wire hover:border-signal text-ink-muted hover:text-signal text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="調升引力 +1 (按住 Shift +5)"
    >
      +
    </button>
  </div>

{:else}
  <!-- ================= DETAILED 模式 (用於星系與側邊詳情抽屜) ================= -->
  <div
    class="gravity-gauge-detailed p-3 bg-[#050608] border border-[#2B303C] rounded-[4px] flex flex-col gap-2.5 font-mono select-none relative overflow-hidden"
    onwheel={handleWheel}
  >
    <!-- 頂部標題與目前天體階級標籤 -->
    <div class="flex items-center justify-between">
      <span class="text-[11px] text-[#8E9298] font-bold flex items-center gap-1.5">
        <Flame class="w-3.5 h-3.5" style="color: {tierColor};" />
        <span>{label}</span>
      </span>

      <div class="flex items-center gap-2">
        <!-- 點擊可循環切換階級按鈕 -->
        <button
          type="button"
          {disabled}
          onclick={(e) => {
            e.stopPropagation();
            cycleTier();
          }}
          class="px-1.5 py-0.2 rounded text-[9px] font-bold border transition-all cursor-pointer hover:brightness-125 active:scale-95"
          style="background-color: {clampedWeight >= 70 ? '#2E1E10' : '#101216'}; color: {tierColor}; border-color: {tierColor}40;"
          title="點擊依序切換天體階級 (1 ➔ 20 ➔ 70 ➔ 100)"
        >
          {tierName}
        </button>
        <span class="text-sm font-bold font-tabular" style="color: {tierColor};">
          {clampedWeight} <span class="text-[9px] text-[#8E9298] font-normal">/ 100</span>
        </span>
      </div>
    </div>

    <!-- 大尺寸半圓儀表盤 (SVG Semicircular VU Dial) -->
    <div
      class="relative w-full h-[90px] flex items-end justify-center cursor-ew-resize py-1"
      role="slider"
      tabindex="0"
      aria-label="Gravitational Weight Detailed Dial"
      aria-valuenow={clampedWeight}
      aria-valuemin="1"
      aria-valuemax="100"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      title="按住滑動、點擊刻度或滾輪微調"
    >
      <!-- 引力震盪脈衝光環 (Breakthrough Flash) -->
      {#key rippleKey}
        <div
          class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border border-signal/60 animate-ping opacity-60"
          style="border-color: {tierColor}; animation-duration: 0.75s;"
        ></div>
      {/key}

      {#if isBreakthrough}
        <div class="pointer-events-none absolute inset-0 bg-[#FEC486]/10 animate-pulse rounded"></div>
      {/if}

      <svg
        bind:this={gaugeSvgEl}
        viewBox="0 0 160 85"
        class="w-full h-full max-w-[240px] overflow-visible"
      >
        <defs>
          <filter id="gauge-glow-lg" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        <!-- 弧形底軌 (R=65, Center 80, 78, -80deg ~ +80deg) -->
        <path
          d="M 15.98 66.71 A 65 65 0 0 1 144.02 66.71"
          fill="none"
          stroke="#181B22"
          stroke-width="7"
          stroke-linecap="round"
        />

        <!-- 刻度線環 (每隔 10 一格刻度) -->
        {#each Array.from({ length: 11 }, (_, i) => i * 10) as tick}
          {@const t = tick / 100}
          {@const deg = -80 + t * 160}
          {@const rad = ((deg - 90) * Math.PI) / 180}
          {@const isMajor = tick === 0 || tick === 20 || tick === 70 || tick === 100}
          {@const rOut = 75}
          {@const rIn = isMajor ? 67 : 70}
          {@const x1 = 80 + rOut * Math.cos(rad)}
          {@const y1 = 78 + rOut * Math.sin(rad)}
          {@const x2 = 80 + rIn * Math.cos(rad)}
          {@const y2 = 78 + rIn * Math.sin(rad)}
          <line
            {x1}
            {y1}
            {x2}
            {y2}
            stroke={tick <= clampedWeight ? (tick >= 70 ? '#FEC486' : '#686E7C') : '#2A2E38'}
            stroke-width={isMajor ? 1.5 : 1}
            stroke-linecap="round"
          />
        {/each}

        <!-- 前景能量弧光 (R=65) -->
        <path
          d="M 15.98 66.71 A 65 65 0 0 1 144.02 66.71"
          fill="none"
          stroke={tierColor}
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray="182"
          stroke-dashoffset={182 - (clampedWeight / 100) * 182}
          style="filter: drop-shadow(0 0 4px {tierGlow}); transition: stroke-dashoffset 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.3s ease;"
        />

        <!-- 氣態巨星 70 突破點發光刻度標籤 (點擊可直接 snap 到 70) -->
        <g
          role="button"
          tabindex="0"
          class="cursor-pointer group/tick70 outline-none"
          onclick={(e) => {
            e.stopPropagation();
            commitWeight(70);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              commitWeight(70);
            }
          }}
        >
          <circle cx="113.8" cy="22.6" r="3" fill="#FEC486" style="filter: drop-shadow(0 0 2px #FEC486);" class="group-hover/tick70:scale-125 transition-transform" />
          <text x="118" y="19" fill="#FEC486" font-size="7.5" font-family="JetBrains Mono" font-weight="bold" class="group-hover/tick70:underline">70</text>
          <title>點擊直接切換至氣態巨星 (W-70)</title>
        </g>

        <!-- 類比指針 (Needle) -->
        <g
          transform="translate(80, 78) rotate({needleAngle})"
          style="transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);"
        >
          <!-- 指針針體 -->
          <polygon
            points="-2,4 2,4 1,-64 -1,-64"
            fill={tierColor}
            style="filter: drop-shadow(0 0 3px {tierColor});"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="-64"
            stroke="#FFFFFF"
            stroke-width="0.8"
            opacity="0.85"
          />
          <!-- 軸心裝飾蓋 -->
          <circle cx="0" cy="0" r="6" fill="#0A0C10" stroke={tierColor} stroke-width="2" />
          <circle cx="0" cy="0" r="2" fill={tierColor} />
        </g>
      </svg>
    </div>

    <!-- 底部控制排：精準數字輸入框 + 階梯步進按鈕 -->
    <div class="flex items-center gap-1.5 pt-1">
      <button
        type="button"
        {disabled}
        onclick={() => handleStep(-5)}
        class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-signal rounded border border-[#2B303C] hover:border-signal font-mono text-[11px] font-bold cursor-pointer transition-colors"
        title="調降權重 -5"
      >
        -5
      </button>
      <button
        type="button"
        {disabled}
        onclick={() => handleStep(-1)}
        class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-signal rounded border border-[#2B303C] hover:border-signal font-mono text-[11px] font-bold cursor-pointer transition-colors"
        title="調降權重 -1"
      >
        -1
      </button>

      <!-- 居中精準數字手動輸入 -->
      <div
        class="flex-[2] flex items-center justify-center bg-[#090C12] px-2 py-1 rounded border border-[#2B303C] focus-within:border-[#FEC486] transition-colors"
      >
        <span class="text-[10px] font-bold text-[#8E9298] mr-0.5 select-none">W</span>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          bind:value={inputVal}
          onclick={(e) => e.stopPropagation()}
          onfocus={() => { isEditing = true; }}
          onblur={handleInputBlur}
          onkeydown={(e) => {
            e.stopPropagation();
            handleInputKeydown(e);
          }}
          {disabled}
          class="w-10 text-xs font-bold font-mono bg-transparent text-center outline-none p-0 m-0"
          style="color: {tierColor};"
          title="直接手動輸入 1~100 (按 Enter 確認，↑↓ 微調)"
        />
        <span class="text-[9px] text-[#52565E] font-normal select-none">/100</span>
      </div>

      <button
        type="button"
        {disabled}
        onclick={() => handleStep(1)}
        class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FEC486] rounded border border-[#2B303C] hover:border-[#FEC486] font-mono text-[11px] font-bold cursor-pointer transition-colors"
        title="調升權重 +1"
      >
        +1
      </button>
      <button
        type="button"
        {disabled}
        onclick={() => handleStep(5)}
        class="flex-1 py-1 px-1 bg-[#14161B] hover:bg-[#1E222A] text-[#8E9298] hover:text-[#FEC486] rounded border border-[#2B303C] hover:border-[#FEC486] font-mono text-[11px] font-bold cursor-pointer transition-colors"
        title="調升權重 +5"
      >
        +5
      </button>
    </div>

    <!-- 刻度階級快捷吸附按鈕 (點選立即切換對應基準值) -->
    <div class="flex justify-between items-center gap-1 font-mono text-[9px] pt-1 select-none">
      {#each PLANET_TIERS as pt}
        {@const isActive = clampedWeight >= pt.min && clampedWeight <= pt.max}
        <button
          type="button"
          {disabled}
          onclick={(e) => {
            e.stopPropagation();
            commitWeight(pt.value);
          }}
          class="flex-1 py-0.5 px-1 rounded-[2px] border text-center transition-all cursor-pointer {isActive
            ? 'bg-[#181B22] font-bold shadow-sm'
            : 'bg-transparent border-transparent text-[#686E7C] hover:bg-[#12141A] hover:text-[#EEF0F2]'}"
          style={isActive ? `border-color: ${pt.color}70; color: ${pt.color};` : ''}
          title={`點擊切換至 ${pt.label} (W-${pt.value})`}
        >
          {pt.label} ({pt.value})
        </button>
      {/each}
    </div>
  </div>
{/if}
