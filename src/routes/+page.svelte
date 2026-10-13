<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n } from '$lib/i18n/index.svelte';
  import {
    db,
    quickPickupArtist,
    getArtists,
    deleteArtist,
    updateArtist,
    seedInitialSampleIfEmpty
  } from '$lib/db';
  import type { ArtistEntry } from '$lib/types/artist';
  import TactileButton from '$lib/components/TactileButton.svelte';
  import SpecBadge from '$lib/components/SpecBadge.svelte';
  import SunkenInput from '$lib/components/SunkenInput.svelte';
  import LedIndicator from '$lib/components/LedIndicator.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import {
    Disc3,
    Music,
    Search,
    ExternalLink,
    Sparkles,
    Trash2,
    SlidersHorizontal,
    Radio,
    Flame,
    Headphones,
    ArrowUpRight,
    CheckCircle2,
    RefreshCw
  } from 'lucide-svelte';

  // 狀態管理 (Svelte 5 Runes)
  let artists = $state<ArtistEntry[]>([]);
  let pickupInput = $state('');
  let searchQuery = $state('');
  let activeTab = $state<'all' | 'inbox' | 'analyzed'>('all');
  let selectedArtistId = $state<string | null>(null);
  let toastMessage = $state<string | null>(null);
  let isAnalyzing = $state(false);

  // 選中之藝人詳情
  const selectedArtist = $derived(
    artists.find((a) => a.id === selectedArtistId) || artists[0] || null
  );

  // 篩選後之清單
  const filteredArtists = $derived(
    artists.filter((artist) => {
      // 分頁過濾
      if (activeTab === 'inbox' && artist.status !== 'inbox') return false;
      if (activeTab === 'analyzed' && artist.status !== 'analyzed') return false;

      // 關鍵字搜尋
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inName = artist.name.toLowerCase().includes(q);
      const inAliases = artist.aliases?.some((al) => al.toLowerCase().includes(q)) ?? false;
      const inGenres = artist.analysis?.genres.some((g) => g.toLowerCase().includes(q)) ?? false;
      return inName || inAliases || inGenres;
    })
  );

  // 統計數據
  const countTotal = $derived(artists.length);
  const countInbox = $derived(artists.filter((a) => a.status === 'inbox').length);
  const countAnalyzed = $derived(artists.filter((a) => a.status === 'analyzed').length);

  onMount(async () => {
    await seedInitialSampleIfEmpty();
    await reloadArtists();
    if (artists.length > 0 && !selectedArtistId) {
      selectedArtistId = artists[0].id;
    }
  });

  async function reloadArtists() {
    artists = await getArtists();
  }

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2500);
  }

  // 執行拾音（Enter 或 點擊拾音按鈕）
  async function handlePickup() {
    if (!pickupInput.trim()) {
      showToast(t('pickup_empty_warn'));
      return;
    }
    const name = pickupInput.trim();
    pickupInput = '';
    const newEntry = await quickPickupArtist(name);
    await reloadArtists();
    selectedArtistId = newEntry.id;
    showToast(t('pickup_success_toast'));
  }

  // 刪除藝人
  async function handleDelete(id: string) {
    await deleteArtist(id);
    await reloadArtists();
    if (selectedArtistId === id) {
      selectedArtistId = artists[0]?.id || null;
    }
  }

  // 模擬觸發 AI 深度解剖
  async function handleAnalyze(artist: ArtistEntry) {
    isAnalyzing = true;
    setTimeout(async () => {
      // 模擬解剖成果（稍後 Phase 2 將對接動態 Groq / Gemini 引擎）
      await updateArtist(artist.id, {
        status: 'analyzed',
        audiophileGrade: 'Hi-Res Lossless',
        dynamicRange: 13,
        analysis: artist.analysis || {
          genres: ['Contemporary Lossless', 'Acoustic / Electric', 'Experimental'],
          summary: `${artist.name} 具備鮮明的聲學特質與錄音空間感。其編曲架構打破了傳統串流壓縮聲音常規，在器材耳機回放下呈現高度分離的樂器泛音。`,
          instrumentationNotes: '動態保留完整，母帶後製無過度壓限（Brickwall Limiter），極具類比錄音盤帶特質。',
          similarArtists: ['toe', 'Cornelius', 'Fishmans', 'Special Others'],
          notableAlbums: [
            {
              title: `${artist.name} - Essential Master`,
              year: '2023',
              description: '代表性母帶錄音版本，呈現高寬容度之聲場定位。',
              appleMusicSearchUrl: `https://music.apple.com/search?term=${encodeURIComponent(artist.name)}`
            }
          ]
        }
      });
      await reloadArtists();
      isAnalyzing = false;
    }, 800);
  }

  // 點擊「相似藝人」一鍵拾音入庫
  async function handlePickupSimilar(similarName: string) {
    const newEntry = await quickPickupArtist(similarName);
    await reloadArtists();
    selectedArtistId = newEntry.id;
    showToast(`已拾取相似音樂人「${similarName}」至收件匣`);
  }
</script>

<div class="min-h-screen bg-[#08090A] text-[#EEF0F2] flex flex-col font-sans">
  <!-- Toast 通知 -->
  {#if toastMessage}
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1B1E23] border border-[#E0A96D] text-[#FEC486] rounded-[3px] font-mono text-xs shadow-[0_0_20px_rgba(224,169,109,0.3)] flex items-center gap-2 animate-bounce">
      <CheckCircle2 class="w-4 h-4 text-[#E0A96D]" />
      <span>{toastMessage}</span>
    </div>
  {/if}

  <!-- Master Rack Header -->
  <header class="border-b border-[#1F2228] bg-[#0D0E11]/90 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 py-3">
    <div class="max-w-[1440px] mx-auto flex items-center justify-between">
      <!-- 品牌與聲學銘牌 -->
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-[3px] bg-[#14161A] border border-[#E0A96D]/40 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_12px_rgba(224,169,109,0.15)]">
          <Disc3 class="w-5 h-5 text-[#FEC486] animate-[spin_10s_linear_infinite]" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-serif text-lg md:text-xl font-bold tracking-wide text-[#EEF0F2] leading-tight">
              {t('app_title')}
            </h1>
            <span class="font-mono text-[10px] tracking-widest text-[#E0A96D] uppercase px-1.5 py-0.2 border border-[#E0A96D]/30 rounded-[2px] bg-[#E0A96D]/5">
              PUA v0.1
            </span>
          </div>
          <p class="font-mono text-[11px] text-[#8E9298] tracking-wider hidden sm:block">
            {t('app_tagline')}
          </p>
        </div>
      </div>

      <!-- 右側儀表指示與控制開關 -->
      <div class="flex items-center gap-4">
        <div class="hidden md:flex items-center gap-3 px-3 py-1 rounded-[3px] bg-[#040405] border border-[#1F2228]">
          <LedIndicator status="active" label={t('status_local_first')} />
          <span class="text-[#323740]">|</span>
          <span class="font-mono text-[11px] text-[#8E9298] font-tabular">
            CRATES: {countTotal}
          </span>
        </div>

        <!-- 語言切換 -->
        <LanguageToggle />
      </div>
    </div>
  </header>

  <!-- 主機架工作區 (Dual Mode: Mobile Fast-Inbox + Desktop Split Crate Digger) -->
  <main class="flex-1 max-w-[1440px] w-full mx-auto p-3 md:p-6 flex flex-col md:flex-row gap-6">
    <!-- 左側與中欄：快速拾音輸入槽 + 唱片箱列表 -->
    <section class="flex-1 flex flex-col gap-4">
      <!-- 零延遲拾音槽 (Tactile Input Well) -->
      <div class="beveled-plate p-4 md:p-5 rounded-[4px] relative overflow-hidden">
        <div class="absolute -right-8 -top-8 w-28 h-28 bg-[#E0A96D]/5 rounded-full blur-2xl pointer-events-none"></div>
        <div class="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
          <div class="flex-1">
            <SunkenInput
              bind:value={pickupInput}
              label={t('pickup_shortcut_hint')}
              placeholder={t('pickup_placeholder')}
              onenter={handlePickup}
              autofocus={true}
            />
          </div>
          <TactileButton
            variant="amber"
            size="md"
            onclick={handlePickup}
            class="h-[42px] px-6 text-sm"
          >
            <Radio class="w-4 h-4 mr-1.5 text-[#E0A96D]" />
            {t('pickup_button')}
          </TactileButton>
        </div>
      </div>

      <!-- 唱片庫管理架 (Crate Shelf View) -->
      <div class="bg-[#0D0E11] border border-[#1F2228] rounded-[4px] flex-1 flex flex-col overflow-hidden">
        <!-- 分頁標籤與搜尋工具列 -->
        <div class="p-3 border-b border-[#1F2228] flex flex-wrap items-center justify-between gap-3 bg-[#121417]">
          <!-- 標籤開關 -->
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick={() => (activeTab = 'all')}
              class="px-3 py-1 font-mono text-xs rounded-[2px] transition-all cursor-pointer {activeTab === 'all' ? 'bg-[#1F2228] text-[#FEC486] border border-[#E0A96D]/40 font-semibold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            >
              {t('tab_all')} ({countTotal})
            </button>
            <button
              type="button"
              onclick={() => (activeTab = 'inbox')}
              class="px-3 py-1 font-mono text-xs rounded-[2px] transition-all cursor-pointer flex items-center gap-1.5 {activeTab === 'inbox' ? 'bg-[#1F2228] text-[#FEC486] border border-[#E0A96D]/40 font-semibold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-[#E0A96D]"></span>
              {t('tab_inbox')} ({countInbox})
            </button>
            <button
              type="button"
              onclick={() => (activeTab = 'analyzed')}
              class="px-3 py-1 font-mono text-xs rounded-[2px] transition-all cursor-pointer flex items-center gap-1.5 {activeTab === 'analyzed' ? 'bg-[#1F2228] text-[#63C78B] border border-[#254C34] font-semibold' : 'text-[#8E9298] hover:text-[#EEF0F2]'}"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-[#63C78B]"></span>
              {t('tab_analyzed')} ({countAnalyzed})
            </button>
          </div>

          <!-- 搜尋槽 -->
          <div class="relative w-full sm:w-60">
            <Search class="w-3.5 h-3.5 text-[#52565E] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder={t('search_placeholder')}
              class="w-full bg-[#040405] text-xs text-[#EEF0F2] placeholder-[#52565E] pl-8 pr-3 py-1.5 rounded-[2px] border border-[#1F2228] focus:border-[#E0A96D] focus:outline-none"
            />
          </div>
        </div>

        <!-- 藝人清單項目卡片 -->
        <div class="divide-y divide-[#1F2228] overflow-y-auto max-h-[560px]">
          {#if filteredArtists.length === 0}
            <div class="py-16 text-center text-[#52565E] font-mono text-xs">
              <Headphones class="w-8 h-8 mx-auto mb-2 opacity-40 text-[#8E9298]" />
              尚無符合條件的音樂人。在上方輸入框隨手拾取一個吧。
            </div>
          {:else}
            {#each filteredArtists as artist (artist.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => (selectedArtistId = artist.id)}
                onkeydown={(e) => e.key === 'Enter' && (selectedArtistId = artist.id)}
                class="p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer group {selectedArtistId === artist.id ? 'bg-[#181B21] border-l-2 border-l-[#E0A96D]' : 'hover:bg-[#121417] border-l-2 border-l-transparent'}"
              >
                <!-- 音樂人資訊 -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 class="font-serif text-base font-semibold text-[#EEF0F2] group-hover:text-[#FEC486] transition-colors truncate">
                      {artist.name}
                    </h3>
                    {#if artist.status === 'inbox'}
                      <SpecBadge type="inbox" text={t('status_inbox')} />
                    {:else}
                      <SpecBadge type="analyzed" text={t('status_analyzed')} />
                      {#if artist.dynamicRange}
                        <SpecBadge type="dr" text={`DR${artist.dynamicRange}`} />
                      {/if}
                      {#if artist.audiophileGrade === 'Reference'}
                        <SpecBadge type="vinyl" text="REFERENCE" />
                      {/if}
                    {/if}
                  </div>

                  <!-- 流派與別名標籤 -->
                  <div class="flex items-center gap-2 font-mono text-[11px] text-[#8E9298] truncate">
                    {#if artist.analysis?.genres && artist.analysis.genres.length > 0}
                      <span>{artist.analysis.genres.slice(0, 3).join(' • ')}</span>
                    {:else}
                      <span class="text-[#52565E] italic">等待 AI 聲學解剖...</span>
                    {/if}
                  </div>
                </div>

                <!-- 快捷操作：Apple Music 跳轉與刪除 -->
                <div class="flex items-center gap-1.5 shrink-0">
                  {#if artist.appleMusicUrl}
                    <a
                      href={artist.appleMusicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('action_open_apple_music')}
                      onclick={(e) => e.stopPropagation()}
                      class="p-2 rounded-[2px] bg-[#14161A] text-[#FA383E] hover:bg-[#FA383E] hover:text-white border border-[#252930] transition-colors"
                    >
                      <ArrowUpRight class="w-3.5 h-3.5" />
                    </a>
                  {/if}
                  <button
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      handleDelete(artist.id);
                    }}
                    title={t('action_delete')}
                    class="p-2 rounded-[2px] bg-[#14161A] text-[#52565E] hover:text-[#FA383E] hover:bg-[#201013] border border-[#252930] transition-colors cursor-pointer"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </section>

    <!-- 右側：發燒友 Master Dossier 檔案抽屜 (Desktop Deep-Dive) -->
    <aside class="w-full md:w-[480px] lg:w-[520px] beveled-plate p-5 rounded-[4px] flex flex-col gap-5 border border-[#1F2228] bg-[#0E1013]">
      {#if selectedArtist}
        <!-- 檔案看板頭部 -->
        <div class="border-b border-[#1F2228] pb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-[10px] tracking-widest uppercase text-[#E0A96D] flex items-center gap-1">
              <span class="w-2 h-0.5 bg-[#E0A96D]"></span>
              ACOUSTIC DOSSIER // MASTER RECORD
            </span>
            <div class="flex items-center gap-1.5">
              <SpecBadge type="hires" text={t('spec_hires')} />
              <SpecBadge type="lossless" text={t('spec_lossless')} />
            </div>
          </div>

          <h2 class="font-serif text-2xl font-bold text-[#EEF0F2] mb-1">
            {selectedArtist.name}
          </h2>

          {#if selectedArtist.aliases && selectedArtist.aliases.length > 0}
            <p class="font-mono text-xs text-[#8E9298] mb-3">
              AKA: {selectedArtist.aliases.join(', ')}
            </p>
          {/if}

          <!-- 核心動作列 -->
          <div class="flex items-center gap-2 mt-3">
            {#if selectedArtist.appleMusicUrl}
              <a
                href={selectedArtist.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 inline-flex items-center justify-center gap-1.5 font-mono text-xs bg-[#FA383E] text-white py-2 px-3 rounded-[3px] font-semibold hover:bg-[#E0262C] transition-all shadow-[0_0_12px_rgba(250,56,62,0.25)]"
              >
                <Music class="w-3.5 h-3.5" />
                {t('action_open_apple_music')}
              </a>
            {/if}

            <TactileButton
              variant="amber"
              size="md"
              disabled={isAnalyzing}
              onclick={() => handleAnalyze(selectedArtist)}
              class="flex-1 py-2 text-xs"
            >
              <Sparkles class="w-3.5 h-3.5 mr-1.5 text-[#FEC486]" />
              {isAnalyzing ? t('action_analyzing') : t('action_analyze_ai')}
            </TactileButton>
          </div>
        </div>

        <!-- 檔案主內容 -->
        <div class="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[640px] pr-1">
          {#if selectedArtist.analysis}
            <!-- 聲響簽名與生涯沿革 -->
            <div>
              <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 bg-[#E0A96D] rounded-full"></span>
                {t('dossier_biography')}
              </h4>
              <p class="font-sans text-xs text-[#CCCFD6] leading-relaxed bg-[#060708] p-3 rounded-[3px] border border-[#1A1D23]">
                {selectedArtist.analysis.summary}
              </p>
            </div>

            <!-- 配器特徵與錄音質地 -->
            {#if selectedArtist.analysis.instrumentationNotes}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <SlidersHorizontal class="w-3.5 h-3.5 text-[#E0A96D]" />
                  {t('dossier_acoustics')}
                </h4>
                <p class="font-mono text-xs text-[#E0A96D]/90 bg-[#14120D] p-3 rounded-[3px] border border-[#E0A96D]/30 leading-relaxed">
                  {selectedArtist.analysis.instrumentationNotes}
                </p>
              </div>
            {/if}

            <!-- 經典代表專輯 -->
            {#if selectedArtist.analysis.notableAlbums && selectedArtist.analysis.notableAlbums.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <Disc3 class="w-3.5 h-3.5 text-[#FA383E]" />
                  {t('dossier_albums')}
                </h4>
                <div class="space-y-2">
                  {#each selectedArtist.analysis.notableAlbums as album}
                    <div class="bg-[#060708] p-3 rounded-[3px] border border-[#1A1D23] flex items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="font-serif text-sm font-semibold text-[#EEF0F2]">
                            {album.title}
                          </span>
                          <span class="font-mono text-[10px] text-[#E0A96D] px-1 bg-[#E0A96D]/10 rounded">
                            {album.year}
                          </span>
                        </div>
                        <p class="font-sans text-[11px] text-[#8E9298] mt-1 leading-normal">
                          {album.description}
                        </p>
                      </div>
                      <a
                        href={album.appleMusicSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="p-1.5 rounded bg-[#14161A] text-[#FA383E] hover:bg-[#FA383E] hover:text-white transition-colors shrink-0"
                        title="在 Apple Music 搜尋專輯"
                      >
                        <ArrowUpRight class="w-3.5 h-3.5" />
                      </a>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 相似風格系譜 (可一鍵拾取) -->
            {#if selectedArtist.analysis.similarArtists && selectedArtist.analysis.similarArtists.length > 0}
              <div>
                <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5 flex items-center gap-1.5">
                  <Flame class="w-3.5 h-3.5 text-[#E0A96D]" />
                  {t('dossier_similar')}（點擊直接拾音入庫）
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  {#each selectedArtist.analysis.similarArtists as sim}
                    <button
                      type="button"
                      onclick={() => handlePickupSimilar(sim)}
                      class="px-2.5 py-1 rounded-[2px] bg-[#14161B] hover:bg-[#20252E] hover:border-[#E0A96D] border border-[#232731] font-mono text-xs text-[#CCCFD6] hover:text-[#FEC486] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>+ {sim}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <!-- 尚未解剖狀態提示 -->
            <div class="p-8 text-center bg-[#060708] border border-[#1A1D23] rounded-[3px] my-auto">
              <Sparkles class="w-8 h-8 mx-auto text-[#E0A96D]/50 mb-3" />
              <p class="font-sans text-xs text-[#8E9298] mb-4">
                {t('dossier_not_analyzed')}
              </p>
              <TactileButton
                variant="amber"
                size="md"
                disabled={isAnalyzing}
                onclick={() => handleAnalyze(selectedArtist)}
              >
                {isAnalyzing ? t('action_analyzing') : t('action_analyze_ai')}
              </TactileButton>
            </div>
          {/if}

          <!-- 私藏聆聽筆記 -->
          <div class="mt-2 pt-3 border-t border-[#1F2228]">
            <h4 class="font-mono text-[11px] uppercase tracking-wider text-[#8E9298] font-bold mb-1.5">
              {t('dossier_personal_notes')}
            </h4>
            <textarea
              bind:value={selectedArtist.personalNotes}
              onchange={() => updateArtist(selectedArtist.id, { personalNotes: selectedArtist.personalNotes })}
              placeholder={t('dossier_notes_placeholder')}
              rows="3"
              class="w-full bg-[#040405] text-xs text-[#EEF0F2] placeholder-[#52565E] p-2.5 rounded-[3px] border border-[#1F2228] focus:border-[#E0A96D] focus:outline-none resize-none"
            ></textarea>
          </div>
        </div>
      {:else}
        <div class="py-24 text-center text-[#52565E] font-mono text-xs m-auto">
          請從左側挑選一張唱片以檢視檔案。
        </div>
      {/if}
    </aside>
  </main>
</div>
