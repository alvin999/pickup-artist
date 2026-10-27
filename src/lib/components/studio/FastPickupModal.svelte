<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import {
    X,
    Radio,
    ArrowLeft,
    Disc3,
    Check,
    Loader2,
    Smartphone,
    Copy,
    CheckCheck,
    AlertTriangle,
    ExternalLink,
    Sparkles,
    RefreshCw,
    Compass
  } from 'lucide-svelte';
  import { searchAppleMusicCandidates, buildAppleMusicSearchUrl, type ArtistCandidate } from '$lib/utils/appleMusic';
  import type { ArtistEntry, AcousticSector } from '$lib/types/artist';
  import { checkDuplicateArtist } from '$lib/db';
  import { SECTOR_LIST } from '$lib/constants/sectors';
  import {
    pickLuckyFromLocal,
    pickLuckyFromAI,
    pickLuckyFromCurated,
    type LuckySectorOption,
    type LuckyCandidateResult
  } from '$lib/services/luckySerendipity';

  interface Props {
    open: boolean;
    onclose: () => void;
    onpickup: (nameOrUrl: string, candidate?: ArtistCandidate) => void;
    existingArtists?: ArtistEntry[];
    onselectExisting?: (artist: ArtistEntry) => void;
    initialQuery?: string;
    initialCandidates?: ArtistCandidate[];
  }

  let {
    open = false,
    onclose,
    onpickup,
    existingArtists = [],
    onselectExisting,
    initialQuery = '',
    initialCandidates = []
  }: Props = $props();

  let pickupInput = $state('');
  let isSearching = $state(false);
  let candidates = $state<ArtistCandidate[]>([]);
  let selectedGenreFilter = $state<string>('all');
  let step = $state<'input' | 'disambiguation' | 'duplicate_alert'>('input');
  let showMobileGuide = $state(false);
  let copiedUrl = $state(false);

  // 好手氣 (Acoustic Serendipity) 狀態
  let activeTab = $state<'input' | 'lucky'>('input');
  let selectedLuckySector = $state<LuckySectorOption>('ALL');
  let isRollingLucky = $state(false);
  let luckyResult = $state<{
    name: string;
    sourceType: 'local-ghost' | 'ai-seed' | 'curated-seed';
    sourceArtists: string[];
    sector?: AcousticSector;
    subGenre?: string;
    candidate?: ArtistCandidate;
  } | null>(null);
  let luckyRollHistory = $state<string[]>([]);
  let luckyFeedbackMsg = $state<string | null>(null);

  let inputEl = $state<HTMLInputElement | null>(null);

  // 當外部傳入候選人或初始查詢字串時，自動代入輸入框或直接開啟排歧選單
  $effect(() => {
    if (open) {
      if (initialCandidates && initialCandidates.length > 0) {
        pickupInput = initialQuery || initialCandidates[0].name;
        candidates = initialCandidates;
        step = 'disambiguation';
      } else if (initialQuery && initialQuery.trim()) {
        pickupInput = initialQuery.trim();
        step = 'input';
        setTimeout(() => {
          inputEl?.focus();
          inputEl?.select();
        }, 60);
      } else {
        setTimeout(() => {
          inputEl?.focus();
        }, 60);
      }
    } else {
      resetState();
    }
  });

  let duplicateMatch = $state<{
    existing: ArtistEntry;
    pendingName: string;
    pendingCandidate?: ArtistCandidate;
    isExactUrl: boolean;
  } | null>(null);

  // 取得候選清單中包含的所有曲風標籤
  let availableGenres = $derived.by(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (c.primaryGenre) set.add(c.primaryGenre);
    }
    return Array.from(set).sort();
  });

  // 依曲風過濾後的候選人列表
  let filteredCandidates = $derived.by(() => {
    if (selectedGenreFilter === 'all') return candidates;
    return candidates.filter((c) => c.primaryGenre === selectedGenreFilter);
  });

  function resetState() {
    pickupInput = '';
    isSearching = false;
    candidates = [];
    selectedGenreFilter = 'all';
    step = 'input';
    showMobileGuide = false;
    copiedUrl = false;
    duplicateMatch = null;
    activeTab = 'input';
    isRollingLucky = false;
    luckyResult = null;
    luckyFeedbackMsg = null;
  }

  async function handleRollLucky(forceAI = false) {
    if (isRollingLucky) return;
    isRollingLucky = true;
    luckyFeedbackMsg = null;

    try {
      let result: LuckyCandidateResult | null = null;

      if (!forceAI) {
        // 優先從本地已分析藝人的 AI 相似名單中挑選（零 Token、零等待、混合加權隨機）
        result = pickLuckyFromLocal(selectedLuckySector, existingArtists, luckyRollHistory);
      }

      // 若本地池為空或使用者強制指定深空 AI 探勘
      if (!result) {
        result = await pickLuckyFromAI(selectedLuckySector, existingArtists, luckyRollHistory);
      }

      // 若 AI 連線不順，退回發燒友保底種子庫
      if (!result) {
        result = pickLuckyFromCurated(selectedLuckySector, existingArtists, luckyRollHistory);
      }

      if (result) {
        // 加入近期抽取紀錄避免連續換一位時重複
        luckyRollHistory = [...luckyRollHistory.slice(-15), result.name];

        // 嘗試抓取 Apple Music 封面與元資料以供預覽
        let candidate: ArtistCandidate | undefined;
        try {
          const appleCandidates = await searchAppleMusicCandidates(result.name);
          if (appleCandidates.length > 0) {
            candidate = appleCandidates[0];
          }
        } catch (err) {
          console.warn('[LuckyRoll] Apple Music 預覽檢索略過:', err);
        }

        luckyResult = {
          ...result,
          candidate
        };
      } else {
        luckyFeedbackMsg = '此分類下的探索名單皆已悉數收錄，可切換至「全域隨緣」或探索其他星系板塊！';
      }
    } catch (err: any) {
      luckyFeedbackMsg = err?.message || '好手氣探勘失敗，請稍後再試';
    } finally {
      isRollingLucky = false;
    }
  }

  function getDynamicEndpoint() {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?quickAdd=`;
  }

  async function copyEndpoint() {
    const url = getDynamicEndpoint();
    if (url && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      copiedUrl = true;
      setTimeout(() => {
        copiedUrl = false;
      }, 2000);
    }
  }

  function handleClose() {
    resetState();
    onclose();
  }

  async function handleSubmit() {
    const trimmed = pickupInput.trim();
    if (!trimmed) return;

    // 若為 URL 直接存入
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      commitPickup(trimmed);
      return;
    }

    // 搜尋候選名單以解決同名重複問題
    isSearching = true;
    try {
      const results = await searchAppleMusicCandidates(trimmed);
      if (results.length > 1) {
        candidates = results;
        step = 'disambiguation';
      } else if (results.length === 1) {
        commitPickup(results[0].name, results[0]);
      } else {
        commitPickup(trimmed);
      }
    } catch {
      commitPickup(trimmed);
    } finally {
      isSearching = false;
    }
  }

  function commitPickup(name: string, candidate?: ArtistCandidate, force = false) {
    if (!force && existingArtists.length > 0) {
      const targetUrl = candidate?.appleMusicUrl || (name.startsWith('http://') || name.startsWith('https://') ? name : undefined);
      const match = checkDuplicateArtist(existingArtists, name, targetUrl);

      if (match && (match.exactUrlMatch || match.nameMatch)) {
        const existing = match.exactUrlMatch || match.nameMatch!;
        duplicateMatch = {
          existing,
          pendingName: name,
          pendingCandidate: candidate,
          isExactUrl: !!match.exactUrlMatch
        };
        step = 'duplicate_alert';
        return;
      }
    }

    onpickup(name, candidate);
    handleClose();
  }

  function handleSelectExisting() {
    if (duplicateMatch?.existing && onselectExisting) {
      onselectExisting(duplicateMatch.existing);
    }
    handleClose();
  }

  function handleForcePickup() {
    if (duplicateMatch) {
      const { pendingName, pendingCandidate } = duplicateMatch;
      commitPickup(pendingName, pendingCandidate, true);
    }
  }

  function handleBackFromAlert() {
    step = candidates.length > 1 ? 'disambiguation' : 'input';
    duplicateMatch = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in font-mono">
    <!-- 背景遮罩點擊關閉 -->
    <button
      type="button"
      aria-label="關閉彈窗"
      onclick={handleClose}
      class="absolute inset-0 w-full h-full bg-void/85 backdrop-blur-md cursor-default border-0"
    ></button>

    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="crosshair-box bg-[#0c0d11] border border-[#262832] p-5 sm:p-6 max-w-lg w-full shadow-[0_0_36px_rgba(255,42,60,0.25)] flex flex-col gap-4 relative z-10 rounded-[3px]"
    >
      <!-- 關閉按鈕 -->
      <button
        type="button"
        onclick={handleClose}
        class="absolute top-4 right-4 text-ink-muted hover:text-signal cursor-pointer transition-colors"
      >
        <X class="w-4 h-4" />
      </button>

      {#if step === 'input'}
        <!-- 分頁切換 (Studio Style) -->
        <div class="flex items-center gap-1.5 border-b border-[#262832] pb-2.5">
          <button
            type="button"
            onclick={() => (activeTab = 'input')}
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold tracking-wider uppercase transition-all rounded-[2px] cursor-pointer {activeTab === 'input' ? 'bg-[#1e2029] text-signal border border-signal/40 shadow-[0_0_10px_rgba(255,42,60,0.2)]' : 'text-[#8e929d] hover:text-[#f4f4f6]'}"
          >
            <Radio class="w-3.5 h-3.5" />
            <span>FAST ACK // 鍵盤知悉</span>
          </button>

          <button
            type="button"
            onclick={() => {
              activeTab = 'lucky';
              if (!luckyResult && !isRollingLucky) {
                handleRollLucky();
              }
            }}
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold tracking-wider uppercase transition-all rounded-[2px] cursor-pointer {activeTab === 'lucky' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'text-[#8e929d] hover:text-amber-300'}"
          >
            <Sparkles class="w-3.5 h-3.5 text-amber-400" />
            <span>🎲 聲學好手氣</span>
          </button>
        </div>

        {#if activeTab === 'input'}
          <!-- 鍵盤知悉模式 -->
          <p class="font-sans text-xs text-[#8e929d] leading-relaxed">
            輸入音樂人、樂團名稱，或直接貼上 Apple Music 分享連結。系統將自動比對藝人脈絡並等候聲學深度解剖。
          </p>

          <!-- 終端輸入框（已去除具體藝人舉例） -->
          <div class="flex items-center px-3.5 py-2.5 bg-[#121318] border border-[#2b2d36] hover:border-[#434755] focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30 transition-all font-mono rounded-[2px]">
            <span class="text-signal text-xs mr-2 font-bold select-none">&gt;_</span>
            <input
              type="text"
              bind:this={inputEl}
              bind:value={pickupInput}
              onkeydown={(e) => e.key === 'Enter' && !isSearching && handleSubmit()}
              disabled={isSearching}
              placeholder="輸入音樂人名稱或貼上 Apple Music 連結..."
              class="bg-transparent text-xs text-[#f4f4f6] placeholder-[#8e929d] focus:outline-none w-full font-mono tracking-wide disabled:opacity-50"
            />
          </div>

          <!-- 動作列 -->
          <div class="flex items-center justify-between gap-3 pt-2">
            <!-- 輕量手機聽音/快捷收錄折疊按鈕（僅行動裝置/小螢幕顯示，電腦版完全隱藏） -->
            <button
              type="button"
              onclick={() => (showMobileGuide = !showMobileGuide)}
              class="flex sm:hidden items-center gap-1.5 text-[11px] text-[#8e929d] hover:text-[#f4f4f6] font-mono cursor-pointer transition-colors"
            >
              <Smartphone class="w-3.5 h-3.5 text-signal" />
              <span>{showMobileGuide ? '收起手機串接' : '手機聽音收錄'}</span>
            </button>

            <div class="flex items-center gap-3 sm:ml-auto">
              <button
                type="button"
                onclick={handleClose}
                class="px-3 py-1.5 text-xs text-ink-muted hover:text-ink font-mono cursor-pointer transition-colors"
              >
                [ESC] 取消
              </button>
              <button
                type="button"
                onclick={handleSubmit}
                disabled={isSearching || !pickupInput.trim()}
                class="corner-cut-sm flex items-center gap-1.5 px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {#if isSearching}
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>比對脈絡中...</span>
                {:else}
                  <Radio class="w-3.5 h-3.5" />
                  <span>立即知悉入庫</span>
                {/if}
              </button>
            </div>
          </div>
        {:else}
          <!-- 聲學好手氣模式 (Acoustic Serendipity) -->
          <div class="space-y-3.5">
            <!-- 自選分類標籤列 -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-[#8e929d] font-mono">
                <span class="flex items-center gap-1">
                  <Compass class="w-3 h-3 text-amber-400" />
                  <span>探索星系板塊 (按風格鎖定)：</span>
                </span>
                <span class="text-[10px] text-neutral-500">
                  {selectedLuckySector === 'ALL' ? '全域隨機' : selectedLuckySector}
                </span>
              </div>

              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onclick={() => {
                    selectedLuckySector = 'ALL';
                    handleRollLucky();
                  }}
                  class="px-2.5 py-1 text-[11px] font-mono font-bold rounded-[2px] border transition-all cursor-pointer {selectedLuckySector === 'ALL' ? 'bg-amber-500/20 text-amber-300 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.25)]' : 'bg-[#121318] text-[#8e929d] border-[#262832] hover:border-[#434755] hover:text-[#f4f4f6]'}"
                >
                  🎲 全域隨緣
                </button>
                {#each SECTOR_LIST as sec}
                  <button
                    type="button"
                    onclick={() => {
                      selectedLuckySector = sec.id;
                      handleRollLucky();
                    }}
                    class="px-2 py-1 text-[11px] font-mono rounded-[2px] border transition-all cursor-pointer {selectedLuckySector === sec.id ? 'font-bold border-current shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'bg-[#121318] text-[#8e929d] border-[#262832] hover:border-[#434755] hover:text-[#f4f4f6]'}"
                    style={selectedLuckySector === sec.id ? `color: ${sec.colorHex}; background-color: ${sec.colorHex}18; border-color: ${sec.colorHex}80;` : ''}
                  >
                    {sec.nameTw}
                  </button>
                {/each}
              </div>
            </div>

            <!-- 開箱預覽區 (Reveal Card) -->
            {#if isRollingLucky}
              <div class="p-6 bg-[#121318] border border-[#2b2d36] rounded-[2px] flex flex-col items-center justify-center gap-2.5 min-h-[140px] animate-pulse">
                <RefreshCw class="w-6 h-6 text-amber-400 animate-spin" />
                <span class="text-xs text-[#8e929d] font-mono tracking-widest uppercase">
                  正在比對聲學頻率共振...
                </span>
              </div>
            {:else if luckyResult}
              <div class="p-4 bg-[#121318] border border-[#2b2d36] rounded-[2px] space-y-3 relative overflow-hidden">
                <div class="flex items-start gap-3.5 relative z-10">
                  <!-- 藝人頭像/封面 -->
                  {#if luckyResult.candidate?.coverImage}
                    <img
                      src={luckyResult.candidate.coverImage}
                      alt={luckyResult.name}
                      class="w-16 h-16 rounded-[2px] object-cover border border-[#3b3e4d] shadow-md shrink-0"
                    />
                  {:else}
                    <div class="w-16 h-16 rounded-[2px] bg-[#1a1c24] border border-[#262832] flex items-center justify-center shrink-0 text-neutral-500">
                      <Disc3 class="w-7 h-7 text-amber-400/60 animate-[spin_8s_linear_infinite]" />
                    </div>
                  {/if}

                  <!-- 藝人資訊 -->
                  <div class="flex-1 min-w-0 space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="text-sm sm:text-base font-bold text-white font-mono tracking-wide truncate">
                        {luckyResult.name}
                      </h3>
                      {#if luckyResult.sourceType === 'local-ghost'}
                        <span class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          本地 AI 頻率共振
                        </span>
                      {:else if luckyResult.sourceType === 'ai-seed'}
                        <span class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          AI 微種子啟發
                        </span>
                      {:else}
                        <span class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          時代基石
                        </span>
                      {/if}
                    </div>

                    {#if luckyResult.candidate?.primaryGenre}
                      <p class="text-[11px] text-[#8e929d] font-mono">
                        {luckyResult.candidate.primaryGenre}
                      </p>
                    {/if}

                    <!-- 推薦溯源 (Lineage) -->
                    {#if luckyResult.sourceArtists && luckyResult.sourceArtists.length > 0}
                      <p class="text-[11px] text-amber-300/80 font-mono leading-tight pt-0.5">
                        💡 聲學溯源：源自庫中 <span class="text-white font-bold">{luckyResult.sourceArtists.join('、')}</span> 的交集推薦
                      </p>
                    {/if}
                  </div>
                </div>

                <!-- 動作列 -->
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2029]">
                  <button
                    type="button"
                    onclick={() => handleRollLucky(false)}
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8e929d] hover:text-white font-mono bg-[#181a22] hover:bg-[#222530] border border-[#2b2d36] rounded-[2px] transition-colors cursor-pointer"
                  >
                    <RefreshCw class="w-3.5 h-3.5" />
                    <span>換一位 (Re-roll)</span>
                  </button>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => handleRollLucky(true)}
                      title="略過本地庫存，以微種子向 AI 發起深度探索"
                      class="hidden sm:flex items-center gap-1 text-[11px] text-[#8e929d] hover:text-indigo-300 font-mono cursor-pointer transition-colors"
                    >
                      <Sparkles class="w-3 h-3 text-indigo-400" />
                      <span>AI 深空探勘</span>
                    </button>

                    <button
                      type="button"
                      onclick={() => commitPickup(luckyResult!.name, luckyResult!.candidate)}
                      class="corner-cut-sm flex items-center gap-1.5 px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)]"
                    >
                      <Radio class="w-3.5 h-3.5" />
                      <span>立即知悉入庫</span>
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <!-- 初始未抽取狀態 -->
              <div class="p-5 bg-[#121318] border border-[#2b2d36] rounded-[2px] text-center space-y-3">
                <p class="text-xs text-[#8e929d] font-mono leading-relaxed">
                  優先自本地 AI 相似星網中採掘尚未收錄之藝人，零 Token 消耗、零等待。<br>
                  結合引力權重與隨機採樣，每次點擊皆是一場全新的聲學邂逅。
                </p>
                <button
                  type="button"
                  onclick={() => handleRollLucky(false)}
                  class="inline-flex items-center gap-2 px-5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-[2px] font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                >
                  <Sparkles class="w-4 h-4 text-amber-400" />
                  <span>🎲 啟動聲學好手氣</span>
                </button>
              </div>
            {/if}

            {#if luckyFeedbackMsg}
              <p class="text-[11px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 p-2 rounded-[2px]">
                {luckyFeedbackMsg}
              </p>
            {/if}
          </div>
        {/if}

        <!-- 手機聽音收錄極簡引導面板（展開時僅在行動端顯示） -->
        {#if showMobileGuide}
          <div class="sm:hidden p-3 bg-[#121318] border border-[#262832] rounded-[2px] text-xs font-mono space-y-2.5 animate-in fade-in duration-150">
            <div class="flex items-center justify-between">
              <span class="text-[#8e929d] text-[11px]">動態接收端點 (不寫死網域)：</span>
              <button
                type="button"
                onclick={copyEndpoint}
                class="flex items-center gap-1 text-[11px] text-signal hover:underline cursor-pointer"
              >
                {#if copiedUrl}
                  <CheckCheck class="w-3 h-3 text-emerald-400" />
                  <span class="text-emerald-400">已複製</span>
                {:else}
                  <Copy class="w-3 h-3" />
                  <span>複製 URL</span>
                {/if}
              </button>
            </div>
            <div class="p-1.5 bg-[#08090b] text-[10px] text-[#b4b7c2] truncate select-all border border-[#1b1d24]">
              {getDynamicEndpoint()}
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1 text-[10px] text-[#8e929d]">
              <div class="p-2 bg-[#181920] border border-[#262832] rounded-[2px] space-y-1">
                <div class="text-[#f4f4f6] font-bold">🍎 iOS 捷徑</div>
                <div>1. 辨識歌曲 (Shazam)</div>
                <div>2. 打開 URL：<span class="text-signal">[端點][演出者]</span></div>
              </div>
              <div class="p-2 bg-[#181920] border border-[#262832] rounded-[2px] space-y-1">
                <div class="text-[#f4f4f6] font-bold">🤖 Android 分享</div>
                <div>瀏覽器點選「加入主畫面」後，任何 App 點系統分享即可見 PUA！</div>
              </div>
            </div>
          </div>
        {/if}

      {:else if step === 'disambiguation'}
        <!-- 第二階段：同名候選人選取矩陣 (Disambiguation Matrix) -->
        <div class="flex items-center justify-between border-b border-[#21232d] pb-2.5">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-signal animate-ping"></span>
            <span class="font-dot text-xs text-signal tracking-widest uppercase">DISAMBIGUATION // 重名排歧</span>
          </div>
          <span class="font-mono text-[10px] text-[#8e929d]">
            發現 {candidates.length} 筆候選結果{#if selectedGenreFilter !== 'all'}（篩選：{filteredCandidates.length} 筆）{/if}
          </span>
        </div>

        <p class="font-sans text-xs text-[#b4b7c2]">
          資料庫偵測到多位同名或關聯藝人，請點選您想收錄的目標：
        </p>

        <!-- 曲風標籤快速過濾條 (Genre Quick Filter) -->
        {#if availableGenres.length > 1}
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 font-mono text-[10px] scrollbar-none">
            <button
              type="button"
              onclick={() => (selectedGenreFilter = 'all')}
              class="px-2 py-0.5 rounded-[2px] transition-colors shrink-0 cursor-pointer {selectedGenreFilter === 'all'
                ? 'bg-signal text-black font-bold'
                : 'bg-[#181920] text-[#8e929d] hover:text-[#f4f4f6] border border-[#262832]'}"
            >
              全部 ({candidates.length})
            </button>
            {#each availableGenres as genre}
              {@const count = candidates.filter((c) => c.primaryGenre === genre).length}
              <button
                type="button"
                onclick={() => (selectedGenreFilter = genre)}
                class="px-2 py-0.5 rounded-[2px] transition-colors shrink-0 cursor-pointer {selectedGenreFilter === genre
                  ? 'bg-signal text-black font-bold'
                  : 'bg-[#181920] text-[#8e929d] hover:text-[#f4f4f6] border border-[#262832]'}"
              >
                {genre} ({count})
              </button>
            {/each}
          </div>
        {/if}

        <!-- 候選卡片格架 -->
        <div class="flex flex-col gap-2 max-h-72 sm:max-h-80 overflow-y-auto pr-1">
          {#if filteredCandidates.length === 0}
            <div class="p-6 text-center text-xs text-[#8e929d] bg-[#121318] border border-[#21232d] rounded-[2px]">
              此風格分類下無候選結果，請切換至「全部」或其他風格標籤。
            </div>
          {/if}
          {#each filteredCandidates as c}
            <button
              type="button"
              onclick={() => commitPickup(c.name, c)}
              class="group flex items-center justify-between p-2.5 bg-[#14151b] hover:bg-[#1c1d25] border border-[#262833] hover:border-signal/70 transition-all text-left cursor-pointer rounded-[2px]"
            >
              <div class="flex items-center gap-3 min-w-0">
                {#if c.coverImage}
                  <img
                    src={c.coverImage}
                    alt={c.name}
                    class="w-11 h-11 object-cover rounded-[2px] border border-[#303340] shrink-0"
                  />
                {:else}
                  <div class="w-11 h-11 bg-[#1a1b22] border border-[#303340] flex items-center justify-center shrink-0">
                    <Disc3 class="w-5 h-5 text-ink-muted group-hover:text-signal transition-colors" />
                  </div>
                {/if}
                <div class="min-w-0 flex flex-col">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-[#f4f4f6] group-hover:text-signal transition-colors truncate">
                      {c.name}
                    </span>
                    {#if c.primaryGenre}
                      <span class="font-mono text-[9px] px-1.5 py-0.2 bg-[#21232d] text-[#b4b7c2] rounded-[2px] uppercase">
                        {c.primaryGenre}
                      </span>
                    {/if}
                  </div>
                  <span class="font-sans text-[11px] text-[#8e929d] truncate mt-0.5">
                    {#if c.albumTitle}
                      代表作：《{c.albumTitle}》
                    {:else}
                      （查無代表專輯）
                    {/if}
                    {#if c.releaseYear}
                      ({c.releaseYear})
                    {/if}
                  </span>
                </div>
              </div>

              <div class="shrink-0 ml-3 flex items-center gap-2">
                {#if c.appleMusicUrl}
                  <a
                    href={c.appleMusicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick={(e) => e.stopPropagation()}
                    class="p-1.5 text-[#8e929d] hover:text-signal hover:bg-[#252834] rounded transition-colors"
                    title="在 Apple Music 中開啓預覽確認"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </a>
                {/if}
                <div class="flex items-center gap-1 text-[11px] font-mono text-ink-dim group-hover:text-signal transition-colors">
                  <span class="hidden sm:inline">鎖定</span>
                  <Check class="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </button>
          {/each}
        </div>

        <!-- 底部退回或自訂與 Apple Music 外連 -->
        <div class="pt-2 border-t border-[#21232d] flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
          <button
            type="button"
            onclick={() => (step = 'input')}
            class="flex items-center gap-1 text-[#8e929d] hover:text-[#f4f4f6] cursor-pointer transition-colors"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>重新輸入</span>
          </button>

          <div class="flex items-center gap-3">
            <a
              href={buildAppleMusicSearchUrl(pickupInput.trim())}
              target="_blank"
              rel="noopener noreferrer"
              class="text-[11px] text-[#8e929d] hover:text-signal flex items-center gap-1 transition-colors"
              title="在 Apple Music 官方搜尋頁尋找後複製連結貼回"
            >
              <span>在 Apple Music 搜尋</span>
              <ExternalLink class="w-3 h-3" />
            </a>

            <button
              type="button"
              onclick={() => commitPickup(pickupInput.trim())}
              class="text-[11px] text-[#8e929d] hover:text-signal underline underline-offset-4 cursor-pointer transition-colors"
            >
              皆不符合？直接以此自訂名稱知悉
            </button>
          </div>
        </div>

      {:else if step === 'duplicate_alert'}
        <!-- 第三階段：重複與同名警示矩陣 (Duplicate / Homonym Alert) -->
        <div class="flex items-center justify-between border-b border-[#21232d] pb-2.5">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-signal animate-pulse" />
            <span class="font-dot text-xs text-signal tracking-widest uppercase">
              {duplicateMatch?.isExactUrl ? 'DUPLICATE // 來源完全重複' : 'HOMONYM // 偵測到同名藝人'}
            </span>
          </div>
          <span class="font-mono text-[10px] text-[#8e929d]">
            {duplicateMatch?.isExactUrl ? '已存在相同 Apple Music 來源' : '本地收藏庫已存在同名檔案'}
          </span>
        </div>

        <p class="font-sans text-xs text-[#b4b7c2] leading-relaxed">
          {#if duplicateMatch?.isExactUrl}
            資料庫中已有一筆來源完全相同的藝人，建議直接定位查看以避免冗餘重複：
          {:else}
            本地庫已收錄名為「<strong class="text-signal">{duplicateMatch?.pendingName}</strong>」的藝人。若為同一人可直接定位；若為不同世代或領域的同名藝人，亦可另立新檔收錄：
          {/if}
        </p>

        <!-- 既有藝人資料卡片 -->
        {#if duplicateMatch?.existing}
          {@const ex = duplicateMatch.existing}
          <div class="p-3 bg-[#14151b] border border-signal/40 rounded-[2px] flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              {#if ex.coverImage}
                <img
                  src={ex.coverImage}
                  alt={ex.name}
                  class="w-12 h-12 object-cover rounded-[2px] border border-[#303340] shrink-0"
                />
              {:else}
                <div class="w-12 h-12 bg-[#1a1b22] border border-[#303340] flex items-center justify-center shrink-0">
                  <Disc3 class="w-6 h-6 text-ink-muted" />
                </div>
              {/if}
              <div class="min-w-0 flex flex-col">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm text-[#f4f4f6] truncate">{ex.name}</span>
                  <span class="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-signal/20 text-signal border border-signal/30 rounded-[1px]">
                    {ex.status.toUpperCase()}
                  </span>
                </div>
                <span class="font-mono text-[10px] text-[#8e929d] truncate mt-0.5">
                  {ex.formatSpec || 'Lossless Hi-Res'}
                </span>
                {#if ex.addedAt}
                  <span class="font-mono text-[9px] text-[#636775]">
                    收錄於 {new Date(ex.addedAt).toLocaleDateString()}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- 動作決策按鈕列 -->
        <div class="pt-2 border-t border-[#21232d] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 font-mono text-xs">
          <button
            type="button"
            onclick={handleBackFromAlert}
            class="flex items-center justify-center gap-1 text-[#8e929d] hover:text-[#f4f4f6] cursor-pointer transition-colors py-1.5"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>返回修改</span>
          </button>

          <div class="flex items-center gap-2 sm:ml-auto">
            {#if !duplicateMatch?.isExactUrl}
              <button
                type="button"
                onclick={handleForcePickup}
                class="px-3 py-1.5 border border-[#303340] hover:border-[#8e929d] text-[#b4b7c2] hover:text-white rounded-[2px] transition-colors cursor-pointer text-xs"
                title="收錄為另一位同名音樂人"
              >
                仍作為新藝人收錄
              </button>
            {/if}
            <button
              type="button"
              onclick={handleSelectExisting}
              class="corner-cut-sm flex items-center justify-center gap-1.5 px-4 py-1.5 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,60,0.3)]"
            >
              <Check class="w-3.5 h-3.5" />
              <span>定位至既有藝人</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
