<script lang="ts">
  import { onMount } from 'svelte';
  import { t, i18n } from '$lib/i18n/index.svelte';
  import {
    getArtists,
    quickPickupArtist,
    deleteArtist,
    updateArtist,
    seedInitialSampleIfEmpty
  } from '$lib/db';
  import type { ArtistEntry } from '$lib/types/artist';
  import StudioSidebar from '$lib/components/studio/StudioSidebar.svelte';
  import StudioTopBar from '$lib/components/studio/StudioTopBar.svelte';
  import CrateDiggerView from '$lib/components/studio/CrateDiggerView.svelte';
  import HoneycombClusterView from '$lib/components/studio/HoneycombClusterView.svelte';
  import FastPickupModal from '$lib/components/studio/FastPickupModal.svelte';
  import { CheckCircle2 } from 'lucide-svelte';

  // 狀態管理 (Svelte 5 Runes)
  let artists = $state<ArtistEntry[]>([]);
  let activeStudioView = $state<'crate-digger' | 'honeycomb-cluster' | 'lossless-matrix' | 'hardware-racks' | 'telemetry-audit'>('crate-digger');
  let selectedArtistId = $state<string | null>(null);
  let searchQuery = $state('');
  let isPickupModalOpen = $state(false);
  let toastMessage = $state<string | null>(null);
  let isAnalyzing = $state(false);

  // 待解剖收件匣計數
  const inboxCount = $derived(artists.filter((a) => a.status === 'inbox').length);

  // 關鍵字搜尋過濾
  const filteredArtists = $derived(
    artists.filter((artist) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inName = artist.name.toLowerCase().includes(q);
      const inAliases = artist.aliases?.some((al) => al.toLowerCase().includes(q)) ?? false;
      const inGenres = artist.analysis?.genres.some((g) => g.toLowerCase().includes(q)) ?? false;
      const inCat = artist.catalogNumber?.toLowerCase().includes(q) ?? false;
      return inName || inAliases || inGenres || inCat;
    })
  );

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

  // 執行拾音
  async function handlePickup(input: string) {
    const newEntry = await quickPickupArtist(input);
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

  // AI 深度解剖
  async function handleAnalyze(artist: ArtistEntry) {
    isAnalyzing = true;
    setTimeout(async () => {
      await updateArtist(artist.id, {
        status: 'analyzed',
        audiophileGrade: 'Reference',
        dynamicRange: 14,
        analysis: artist.analysis || {
          genres: ['Contemporary Lossless', 'Acoustic / Electric', 'Experimental'],
          summary: `${artist.name} 具備鮮明的聲學特質與錄音空間感。其編曲架構打破了傳統串流壓縮聲音常規，在器材耳機回放下呈現高度分離的樂器泛音與純淨動態。`,
          instrumentationNotes: '動態保留完整，母帶後製無過度壓限（Brickwall Limiter），極具類比錄音盤帶特質。',
          similarArtists: ['toe', 'mouse on the keys', 'Cornelius', 'Fishmans'],
          notableAlbums: [
            {
              title: `${artist.name} - Essential Studio Master`,
              year: '2023',
              description: '代表性母帶錄音版本，呈現高寬容度之聲場定位與瞬態表現。',
              appleMusicSearchUrl: `https://music.apple.com/search?term=${encodeURIComponent(artist.name)}`
            }
          ]
        }
      });
      await reloadArtists();
      isAnalyzing = false;
    }, 800);
  }

  // 相似藝人一鍵拾取
  async function handlePickupSimilar(name: string) {
    const newEntry = await quickPickupArtist(name);
    await reloadArtists();
    selectedArtistId = newEntry.id;
    showToast(`已拾取相似音樂人「${name}」至收件匣`);
  }

  // 全域快捷鍵
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('header input') as HTMLInputElement | null;
      searchInput?.focus();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="min-h-screen bg-[#08090A] text-[#EEF0F2] flex flex-col font-sans">
  <!-- Toast 通知 -->
  {#if toastMessage}
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1B1E23] border border-[#E0A96D] text-[#FEC486] rounded-[3px] font-mono text-xs shadow-[0_0_20px_rgba(224,169,109,0.3)] flex items-center gap-2 animate-bounce">
      <CheckCircle2 class="w-4 h-4 text-[#E0A96D]" />
      <span>{toastMessage}</span>
    </div>
  {/if}

  <!-- 拾音彈窗 (Fast Pickup Modal) -->
  <FastPickupModal
    open={isPickupModalOpen}
    onclose={() => (isPickupModalOpen = false)}
    onpickup={handlePickup}
  />

  <!-- 電腦版 Studio 左側固定機架導航欄 (Studio Left Sidebar) -->
  <div class="hidden lg:block">
    <StudioSidebar
      activeView={activeStudioView}
      onselectView={(v) => (activeStudioView = v)}
      totalArtistsCount={artists.length}
      {inboxCount}
    />
  </div>

  <!-- Studio 頂部母帶工作列 (Studio Master TopBar) -->
  <StudioTopBar
    activeView={activeStudioView}
    onselectView={(v) => (activeStudioView = v)}
    onopenPickupModal={() => (isPickupModalOpen = true)}
    bind:searchQuery
    onsearchChange={(q) => (searchQuery = q)}
  />

  <!-- Studio 主畫布內容區 (帶左側 64 欄位位移與頂部 16 欄位位移) -->
  <div class="lg:pl-64 pt-16 flex-1 flex flex-col">
    <main class="flex-1 p-4 md:p-6 max-w-[1720px] w-full mx-auto">
      {#if activeStudioView === 'crate-digger'}
        <!-- 視圖 1: 唱片架庫存視圖 (Crate Digger View) -->
        <CrateDiggerView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          ondeleteArtist={handleDelete}
          onanalyzeArtist={handleAnalyze}
          onpickupSimilar={handlePickupSimilar}
          {isAnalyzing}
        />
      {:else if activeStudioView === 'honeycomb-cluster'}
        <!-- 視圖 2: 聲學蜂巢星系矩陣視圖 (Honeycomb Cluster View) -->
        <HoneycombClusterView
          artists={filteredArtists}
          bind:selectedArtistId
          onselectArtist={(id) => (selectedArtistId = id)}
          onanalyzeArtist={handleAnalyze}
        />
      {:else}
        <!-- 其他 Studio 機架視圖占位 -->
        <div class="py-24 text-center font-mono text-xs text-[#8E9298] bg-[#0D0E11] rounded-[4px] border border-[#1F2228] p-8">
          <span class="material-symbols-outlined text-[36px] text-[#FEC486] mb-2">settings_input_component</span>
          <div class="text-sm font-bold text-[#EEF0F2] mb-1">
            {activeStudioView.toUpperCase()} // STUDIO MODULE STANDBY
          </div>
          <p class="text-[#52565E]">此硬體機架模組已接線待命。點擊左側導航「唱片架庫存」或「聲學蜂巢星系」切換主視圖。</p>
        </div>
      {/if}
    </main>
  </div>
</div>
