<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { X, Radio, ArrowLeft, Disc3, Check, Loader2, Smartphone, Copy, CheckCheck, AlertTriangle, ExternalLink } from 'lucide-svelte';
  import { searchAppleMusicCandidates, buildAppleMusicSearchUrl, type ArtistCandidate } from '$lib/utils/appleMusic';
  import type { ArtistEntry } from '$lib/types/artist';
  import { checkDuplicateArtist } from '$lib/db';

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

  // 當外部傳入候選人時，直接開啟排歧選單，無須重複搜尋
  $effect(() => {
    if (open) {
      if (initialCandidates && initialCandidates.length > 0) {
        pickupInput = initialQuery || initialCandidates[0].name;
        candidates = initialCandidates;
        step = 'disambiguation';
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
        <!-- 第一階段：輸入藝人或連結 -->
        <div class="flex items-center gap-2 text-xs text-signal">
          <span class="w-2 h-2 rounded-full bg-signal animate-pulse"></span>
          <span class="font-dot text-sm font-bold tracking-widest uppercase">FAST ACK // 藝人知悉終端</span>
        </div>

        <p class="font-sans text-xs text-[#8e929d] leading-relaxed">
          輸入音樂人、樂團名稱，或直接貼上 Apple Music 分享連結。系統將自動比對藝人脈絡並等候聲學深度解剖。
        </p>

        <!-- 終端輸入框 -->
        <div class="flex items-center px-3.5 py-2.5 bg-[#121318] border border-[#2b2d36] hover:border-[#434755] focus-within:border-signal focus-within:ring-1 focus-within:ring-signal/30 transition-all font-mono rounded-[2px]">
          <span class="text-signal text-xs mr-2 font-bold select-none">&gt;_</span>
          <input
            type="text"
            bind:value={pickupInput}
            onkeydown={(e) => e.key === 'Enter' && !isSearching && handleSubmit()}
            disabled={isSearching}
            placeholder="輸入音樂人名稱（如 Oasis、落日飛車...）"
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
