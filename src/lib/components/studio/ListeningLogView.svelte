<script lang="ts">
  import type { ArtistEntry } from '$lib/types/artist';
  import { analyzeListeningResonance, type ListeningResonanceResult } from '$lib/ai/client';
  import { i18n } from '$lib/i18n/index.svelte';
  import {
    Sparkles,
    Search,
    BookOpen,
    Music,
    Disc,
    Check,
    Plus,
    X,
    ExternalLink,
    Clock,
    Tag,
    Feather,
    Edit3,
    Trash2
  } from 'lucide-svelte';

  interface Props {
    artists: ArtistEntry[];
    initialTargetArtistId?: string | null;
    onupdateArtist?: (artist: ArtistEntry) => Promise<void> | void;
    onselectArtist?: (id: string) => void;
    onopenInCrate?: (id: string) => void;
    showToast?: (msg: string) => void;
  }

  let {
    artists = [],
    initialTargetArtistId = null,
    onupdateArtist,
    onselectArtist,
    onopenInCrate,
    showToast
  }: Props = $props();

  // 搜尋過濾已建立的手札
  let searchQuery = $state('');

  // 跨視圖跳轉聚焦卡片 ID 與動畫狀態
  let highlightedCardId = $state<string | null>(null);
  let lastHandledTargetId: string | null = null;

  // 判斷藝人是否已有手札記錄 (只有手動寫過筆記或標記過才算)
  function isArtistLogged(a: ArtistEntry): boolean {
    const hasNotes = typeof a.personalNotes === 'string' && a.personalNotes.trim().length > 0;
    const hasAlbums = (a.listeningContext?.pickedAlbums?.length ?? 0) > 0;
    const hasTracks = (a.listeningContext?.favoriteTracks?.length ?? 0) > 0;
    const hasMoods = (a.listeningContext?.moodTags?.length ?? 0) > 0;
    return hasNotes || hasAlbums || hasTracks || hasMoods;
  }

  // 僅篩選出「使用者已主動建立過日誌」的藝人清單 (拒絕威權式催促)
  const loggedArtists = $derived.by(() => {
    let list = artists.filter(isArtistLogged);

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((a) => {
        const matchName = a.name.toLowerCase().includes(q);
        const matchNotes = a.personalNotes?.toLowerCase().includes(q) ?? false;
        const matchGenre = a.analysis?.subGenre?.toLowerCase().includes(q) ?? false;
        const matchTracks = a.listeningContext?.favoriteTracks?.some((t) => t.toLowerCase().includes(q)) ?? false;
        const matchAlbums = a.listeningContext?.pickedAlbums?.some((alb) => alb.toLowerCase().includes(q)) ?? false;
        return matchName || matchNotes || matchGenre || matchTracks || matchAlbums;
      });
    }

    // 依最後記錄時間倒序排序
    return [...list].sort((a, b) => {
      const aTime = a.listeningContext?.lastLoggedAt || a.updatedAt || 0;
      const bTime = b.listeningContext?.lastLoggedAt || b.updatedAt || 0;
      if (aTime !== bTime) return bTime - aTime;
      return (b.weight || 20) - (a.weight || 20);
    });
  });

  // ==========================================
  // 手札 Modal 彈窗狀態管理 (主動添加 / 編輯)
  // ==========================================
  let isModalOpen = $state(false);
  let isEditingExisting = $state(false);

  // Modal 表單暫存狀態
  let modalArtistId = $state('');
  let modalArtistSearch = $state('');
  let modalScene = $state<'headphone' | 'speaker' | 'on-the-go' | 'night-solitude' | undefined>(undefined);
  let modalPickedAlbums = $state<string[]>([]);
  let modalCustomAlbumInput = $state(''); // 支援手動填寫自訂專輯
  let modalFavoriteTracks = $state<string[]>([]);
  let modalNewTrackInput = $state('');
  let modalMoodTags = $state<string[]>([]);
  let modalNotes = $state('');

  // AI 共鳴分析狀態與預覽結果 (顯性回顯使用者輸入的呼應)
  let isAnalyzingResonance = $state(false);
  let resonancePreview = $state<ListeningResonanceResult | null>(null);

  // 取得 Modal 中當前選中的藝人物件
  const modalSelectedArtist = $derived(artists.find((a) => a.id === modalArtistId));

  // 供選擇的藝人清單 (新建時可選擇庫存中的任何藝人)
  const availableArtistOptions = $derived.by(() => {
    if (!modalArtistSearch.trim()) return artists;
    const q = modalArtistSearch.trim().toLowerCase();
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  });

  // 最低限度情境選項
  const SCENE_OPTIONS: Array<{
    id: 'headphone' | 'speaker' | 'on-the-go' | 'night-solitude';
    label: string;
    icon: string;
  }> = [
    { id: 'headphone', label: '耳機獨享', icon: 'headphones' },
    { id: 'speaker', label: '空間揚聲', icon: 'speaker' },
    { id: 'on-the-go', label: '路上隨行', icon: 'directions_walk' },
    { id: 'night-solitude', label: '深夜私語', icon: 'nightlight' }
  ];

  // 常用人文氛圍標籤 (點擊即選)
  const QUICK_MOOD_TAGS = [
    '雨天沉思',
    '深夜獨處',
    '吉他留白',
    '詩意詞作',
    '路上漫遊',
    '純粹器樂',
    '溫暖治癒',
    '情緒宣洩',
    '時代記憶',
    '微醺放空'
  ];

  // 開啟「新增手札」Modal
  function openAddModal(defaultArtistId?: string) {
    isEditingExisting = false;
    modalArtistSearch = '';
    resonancePreview = null;
    modalCustomAlbumInput = '';
    modalNewTrackInput = '';

    const targetArtist = defaultArtistId
      ? artists.find((a) => a.id === defaultArtistId)
      : artists[0];

    modalArtistId = targetArtist?.id || '';
    modalScene = undefined;
    modalPickedAlbums = [];
    modalFavoriteTracks = [];
    modalMoodTags = [];
    modalNotes = '';

    isModalOpen = true;
  }

  // 開啟「編輯手札」Modal
  function openEditModal(artist: ArtistEntry) {
    isEditingExisting = true;
    modalArtistSearch = '';
    resonancePreview = null;
    modalCustomAlbumInput = '';
    modalNewTrackInput = '';

    modalArtistId = artist.id;
    modalScene = artist.listeningContext?.scene;
    modalPickedAlbums = [...(artist.listeningContext?.pickedAlbums || [])];
    modalFavoriteTracks = [...(artist.listeningContext?.favoriteTracks || [])];
    modalMoodTags = [...(artist.listeningContext?.moodTags || [])];
    modalNotes = artist.personalNotes || '';

    isModalOpen = true;
  }

  // 跨視圖跳轉導航響應邏輯
  $effect(() => {
    if (initialTargetArtistId && initialTargetArtistId !== lastHandledTargetId) {
      lastHandledTargetId = initialTargetArtistId;
      const target = artists.find((a) => a.id === initialTargetArtistId);
      if (target) {
        if (isArtistLogged(target)) {
          // 情境 A：該藝人已有手札，平滑滾動並開啟金色呼吸燈
          highlightedCardId = target.id;
          setTimeout(() => {
            const el = document.getElementById(`log-card-${target.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 80);
          setTimeout(() => {
            if (highlightedCardId === target.id) {
              highlightedCardId = null;
            }
          }, 2500);
        } else {
          // 情境 B：尚未手記，自動為其開啟新篇手札彈窗
          openAddModal(target.id);
        }
      }
    }
  });

  // 關閉 Modal
  function closeModal() {
    isModalOpen = false;
    resonancePreview = null;
  }

  // 切換選中專輯
  function toggleModalPickedAlbum(title: string) {
    if (modalPickedAlbums.includes(title)) {
      modalPickedAlbums = modalPickedAlbums.filter((t) => t !== title);
    } else {
      modalPickedAlbums = [...modalPickedAlbums, title];
    }
  }

  // 手動新增自訂專輯
  function handleModalAddCustomAlbum() {
    const val = modalCustomAlbumInput.trim();
    if (!val) return;
    if (!modalPickedAlbums.includes(val)) {
      modalPickedAlbums = [...modalPickedAlbums, val];
      showToast?.(`已加入心頭好專輯《${val}》`);
    }
    modalCustomAlbumInput = '';
  }

  // 移除已收錄專輯
  function handleModalRemovePickedAlbum(title: string) {
    modalPickedAlbums = modalPickedAlbums.filter((t) => t !== title);
  }

  // 切換情境
  function toggleModalScene(sceneId: typeof modalScene) {
    modalScene = modalScene === sceneId ? undefined : sceneId;
  }

  // 新增曲目
  function handleModalAddTrack() {
    const val = modalNewTrackInput.trim();
    if (!val) return;
    if (!modalFavoriteTracks.includes(val)) {
      modalFavoriteTracks = [...modalFavoriteTracks, val];
    }
    modalNewTrackInput = '';
  }

  // 移除曲目
  function handleModalRemoveTrack(track: string) {
    modalFavoriteTracks = modalFavoriteTracks.filter((t) => t !== track);
  }

  // 切換人文標籤
  function toggleModalMoodTag(tag: string) {
    if (modalMoodTags.includes(tag)) {
      modalMoodTags = modalMoodTags.filter((t) => t !== tag);
    } else {
      modalMoodTags = [...modalMoodTags, tag];
    }
  }

  // ✨ 執行 AI 共鳴分析 (以正面肯定語彙引導模型深刻呼應使用者輸入)
  async function triggerAIResonance() {
    if (!modalSelectedArtist) return;
    isAnalyzingResonance = true;
    resonancePreview = null;
    showToast?.(`AI 正在體會您所寫下的心境，為「${modalSelectedArtist.name}」提煉共鳴...`);

    try {
      const availableAlbums = (modalSelectedArtist.analysis?.notableAlbums || []).map((a) => a.title);
      const res = await analyzeListeningResonance(
        modalSelectedArtist.name,
        modalNotes,
        availableAlbums,
        i18n.locale
      );

      resonancePreview = res;
      showToast?.(`✨ AI 已完成共鳴體會！請在下方預覽確認`);
    } catch (err: any) {
      console.error('[Listening Resonance Error]:', err);
      showToast?.(`AI 共鳴分析失敗：${err.message || '請確認 API 金鑰'}`);
    } finally {
      isAnalyzingResonance = false;
    }
  }

  // 採納 AI 共鳴提煉成果
  function applyAIResonance() {
    if (!resonancePreview) return;

    if (resonancePreview.enhancedNote) {
      modalNotes = resonancePreview.enhancedNote;
    }
    if (resonancePreview.suggestedScene && !modalScene) {
      modalScene = resonancePreview.suggestedScene;
    }

    // 智能補充曲目與標籤
    const nextTracks = new Set([...modalFavoriteTracks, ...resonancePreview.recommendedTracks]);
    modalFavoriteTracks = Array.from(nextTracks);

    const nextMoods = new Set([...modalMoodTags, ...resonancePreview.moodTags]);
    modalMoodTags = Array.from(nextMoods);

    resonancePreview = null;
    showToast?.('已採納 AI 題詞與推薦曲目至手札草稿！');
  }

  // 儲存手札 (寫入資料庫並關閉 Modal)
  async function handleSaveModal() {
    if (!modalSelectedArtist) return;

    const updated: ArtistEntry = {
      ...modalSelectedArtist,
      personalNotes: modalNotes.trim(),
      listeningContext: {
        ...modalSelectedArtist.listeningContext,
        scene: modalScene,
        pickedAlbums: modalPickedAlbums,
        favoriteTracks: modalFavoriteTracks,
        moodTags: modalMoodTags,
        lastLoggedAt: Date.now()
      },
      updatedAt: Date.now()
    };

    await onupdateArtist?.(updated);
    closeModal();
    showToast?.(isEditingExisting ? `已更新「${modalSelectedArtist.name}」的聆賞手札` : `已收錄「${modalSelectedArtist.name}」的新手札！`);
  }

  // 移除手札 (自日誌中解除)
  async function handleDeleteLog(artist: ArtistEntry) {
    if (!confirm(`確定要自聆賞日誌中移除「${artist.name}」的手札紀錄嗎？`)) return;

    const updated: ArtistEntry = {
      ...artist,
      personalNotes: '',
      listeningContext: {
        ...artist.listeningContext,
        pickedAlbums: [],
        favoriteTracks: [],
        moodTags: [],
        lastLoggedAt: undefined
      },
      updatedAt: Date.now()
    };

    await onupdateArtist?.(updated);
    showToast?.(`已自日誌中移除「${artist.name}」`);
  }

  function formatLoggedDate(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
</script>

<div class="flex flex-col gap-4 sm:gap-6 p-3 sm:p-6 bg-chassis min-h-screen text-ink font-sans pb-24">
  <!-- 頂部人文書卷導航銘板 (Humanist Journal Header) -->
  <header class="border border-wire bg-void p-4 sm:p-5 shadow-2xl relative overflow-hidden">
    <div class="absolute right-4 top-2 text-[52px] sm:text-[64px] font-mono font-black text-panel/30 select-none pointer-events-none">
      LOG_05
    </div>

    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 font-mono text-xs text-signal mb-1">
          <Feather class="w-3.5 h-3.5 text-signal" />
          <span>LISTENING_JOURNAL // 聆賞手札</span>
        </div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-serif font-bold text-ink tracking-tight flex items-center gap-2.5">
            <span>聆賞日誌</span>
            <span class="font-mono text-xs font-normal px-2.5 py-0.5 border border-wire bg-panel text-[#A8ACB4]">
              已記述 {loggedArtists.length} 篇心境隨筆
            </span>
          </h1>
        </div>
        <p class="text-xs text-[#A8ACB4] mt-1.5 max-w-xl font-sans leading-relaxed">
          非強迫、無待辦。僅在某段旋律打動你時，點選「+ 記述新日誌」，記錄當下的心境碎片與生活共鳴。
        </p>
      </div>

      <!-- 右側動作按鈕：自主新增手札 (非威權強制) -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => openAddModal()}
          class="px-4 py-2 bg-signal hover:bg-signal/90 text-void font-bold text-xs font-mono flex items-center gap-2 transition-all shadow-lg shadow-signal/20 cursor-pointer"
        >
          <Plus class="w-4 h-4" />
          <span>記述新日誌 (NEW ENTRY)</span>
        </button>
      </div>
    </div>

    <!-- 搜尋工具列 (僅在已有日誌時便於檢索) -->
    {#if loggedArtists.length > 0 || searchQuery}
      <div class="relative mt-4 pt-3 border-t border-wire flex items-center gap-3">
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-[#8E9298] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="搜尋已記述之藝人、手札關鍵字、喜愛曲目或專輯..."
            class="w-full bg-chassis text-xs text-ink placeholder-[#8E9298] pl-9 pr-4 py-2 border border-wire focus:border-signal focus:outline-none font-mono"
          />
        </div>
        {#if searchQuery}
          <button
            type="button"
            onclick={() => (searchQuery = '')}
            class="text-xs font-mono text-[#8E9298] hover:text-signal px-2 py-1 cursor-pointer"
          >
            [CLEAR]
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <!-- 內容區：純粹呈現已建立的個人手札時間軸 -->
  {#if loggedArtists.length === 0}
    <!-- 溫潤舒緩的空狀態 (零威權、零作業感) -->
    <div class="py-24 text-center border border-wire border-dashed bg-void/60 p-8 font-mono text-xs text-[#A8ACB4] max-w-2xl mx-auto my-6">
      <BookOpen class="w-10 h-10 text-signal/80 mx-auto mb-3" />
      <div class="text-base font-serif font-bold text-ink mb-1.5">尚未開啟任何聆賞手札</div>
      <p class="text-xs text-[#9CA1AA] leading-relaxed max-w-md mx-auto mb-5 font-sans">
        音樂不必打卡，感受無須排程。當哪天的一段前奏切中了窗外的雨聲或夜色，點擊下方按鈕，為心動的旋律留下真實印記。
      </p>
      <button
        type="button"
        onclick={() => openAddModal()}
        class="inline-flex items-center gap-2 px-4 py-2 border border-signal text-signal bg-signal/10 hover:bg-signal/20 text-xs font-mono font-bold transition-all cursor-pointer shadow"
      >
        <Plus class="w-4 h-4" />
        <span>寫下第一篇聲音手札</span>
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6">
      {#each loggedArtists as artist (artist.id)}
        {@const pickedAlbums = artist.listeningContext?.pickedAlbums || []}
        {@const favoriteTracks = artist.listeningContext?.favoriteTracks || []}
        {@const activeMoods = artist.listeningContext?.moodTags || []}
        {@const currentScene = artist.listeningContext?.scene}
        {@const sceneLabel = SCENE_OPTIONS.find((s) => s.id === currentScene)}

        <article
          id="log-card-{artist.id}"
          class="border transition-all duration-300 bg-void shadow-md {highlightedCardId === artist.id
            ? 'border-signal ring-2 ring-signal/60 shadow-[0_0_24px_rgba(254,196,134,0.35)] scale-[1.01]'
            : 'border-wire hover:border-signal/40'}"
        >
          <!-- 卡片頂部：藝人、情境、最後記述時間與編輯操作 -->
          <div class="p-4 border-b border-wire flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-panel/30">
            <div class="flex items-center gap-3">
              {#if artist.coverImage}
                <img
                  src={artist.coverImage}
                  alt={artist.name}
                  class="w-10 h-10 object-cover border border-wire shrink-0 grayscale hover:grayscale-0 transition-all"
                />
              {:else}
                <div class="w-10 h-10 border border-wire bg-chassis flex items-center justify-center text-[#8E9298] shrink-0">
                  <Disc class="w-5 h-5" />
                </div>
              {/if}

              <div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => onopenInCrate?.(artist.id)}
                    class="text-base font-serif font-bold text-ink hover:text-signal transition-colors text-left flex items-center gap-1.5 group cursor-pointer"
                    title="在藝人展間檢視"
                  >
                    <span>{artist.name}</span>
                    <ExternalLink class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-signal transition-opacity" />
                  </button>

                  <span class="inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] font-mono font-bold bg-signal/15 text-signal border border-signal/40">
                    <span class="w-1.5 h-1.5 rounded-full bg-signal"></span>
                    LOGGED
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#9CA1AA] mt-0.5">
                  {#if artist.analysis?.sector}
                    <span class="text-[#B0B5BD]">{artist.analysis.sector}</span>
                  {/if}
                  {#if artist.analysis?.subGenre}
                    <span>· {artist.analysis.subGenre}</span>
                  {/if}
                  <span class="text-signal font-bold">W-{artist.weight || 20} (GRAVITY)</span>
                </div>
              </div>
            </div>

            <!-- 右上操作列：編輯、移除與 Apple Music -->
            <div class="flex items-center gap-2 font-mono text-xs">
              {#if artist.listeningContext?.lastLoggedAt}
                <div class="flex items-center gap-1 text-[10px] text-[#9CA1AA] mr-2">
                  <Clock class="w-3 h-3 text-[#8E9298]" />
                  <span>{formatLoggedDate(artist.listeningContext.lastLoggedAt)}</span>
                </div>
              {/if}

              {#if artist.appleMusicUrl}
                <a
                  href={artist.appleMusicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1.5 border border-wire hover:border-signal/60 bg-chassis hover:text-signal text-[#9CA1AA] transition-colors"
                  title="在 Apple Music 聆聽"
                >
                  <Music class="w-3.5 h-3.5" />
                </a>
              {/if}

              <button
                type="button"
                onclick={() => openEditModal(artist)}
                class="px-2.5 py-1 border border-wire hover:border-signal bg-chassis text-ink hover:text-signal text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Edit3 class="w-3 h-3" />
                <span>編輯手札</span>
              </button>

              <button
                type="button"
                onclick={() => handleDeleteLog(artist)}
                class="p-1.5 border border-wire hover:border-rose-500/60 text-[#8E9298] hover:text-rose-400 bg-chassis transition-colors cursor-pointer"
                title="自日誌中移除此篇手札"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="p-5 flex flex-col gap-4">
            <!-- 標籤與情境列 -->
            <div class="flex flex-wrap items-center gap-2">
              {#if sceneLabel}
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-sans bg-signal/15 text-signal border border-signal/40">
                  <span class="material-symbols-outlined text-[13px]">{sceneLabel.icon}</span>
                  <span>{sceneLabel.label}</span>
                </span>
              {/if}

              {#each activeMoods as mood}
                <span class="px-2 py-0.5 text-xs font-sans bg-panel text-[#A8ACB4] border border-wire">
                  #{mood}
                </span>
              {/each}
            </div>

            <!-- 喜愛專輯與曲目精選 -->
            {#if pickedAlbums.length > 0 || favoriteTracks.length > 0}
              <div class="p-3 bg-panel/30 border border-wire/70 flex flex-col gap-2 font-sans text-xs">
                {#if pickedAlbums.length > 0}
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-[10px] text-signal font-bold uppercase shrink-0">// ALBUMS:</span>
                    <div class="flex flex-wrap gap-1.5">
                      {#each pickedAlbums as alb}
                        <span class="font-bold text-ink bg-void px-2 py-0.5 border border-wire">
                          《{alb}》
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if favoriteTracks.length > 0}
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-[10px] text-[#9CA1AA] font-bold uppercase shrink-0">// TRACKS:</span>
                    <div class="flex flex-wrap gap-1.5">
                      {#each favoriteTracks as trk}
                        <span class="text-[#A8ACB4] bg-void px-2 py-0.5 border border-wire/60">
                          {trk}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- 手札正文隨筆 (Personal Notes) -->
            {#if artist.personalNotes}
              <div class="p-3.5 bg-void border border-wire font-sans text-xs text-ink leading-relaxed whitespace-pre-wrap">
                {artist.personalNotes}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<!-- ======================================================== -->
<!-- 手札添加 / 編輯專屬 Modal 彈窗 (支援點選與手動填寫專輯) -->
<!-- ======================================================== -->
{#if isModalOpen}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4">
    <div
      class="bg-chassis border border-wire w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Modal 標題列 -->
      <div class="p-3.5 sm:p-4 border-b border-wire flex items-center justify-between bg-void">
        <div class="flex items-center gap-2">
          <Feather class="w-4 h-4 text-signal" />
          <span class="font-serif font-bold text-sm text-ink">
            {isEditingExisting ? '編輯聲音手札' : '記錄新篇手札 // NEW LISTENING ENTRY'}
          </span>
        </div>
        <button
          type="button"
          onclick={closeModal}
          class="text-[#8E9298] hover:text-signal p-1 cursor-pointer transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal 滾動內容區 -->
      <div class="p-4 sm:p-6 overflow-y-auto flex flex-col gap-5 text-ink font-sans">
        <!-- 步驟 1: 選擇目標藝人 (若新建可搜尋選取，編輯時鎖定) -->
        <div>
          <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider block mb-1.5">
            // 選擇音樂人 (SELECT_ARTIST)
          </div>
          {#if isEditingExisting}
            <div class="p-2.5 bg-void border border-wire font-bold font-serif text-sm text-signal flex items-center justify-between">
              <span>{modalSelectedArtist?.name}</span>
              <span class="font-mono text-[10px] text-[#8E9298]">LOCKED_FOR_EDIT</span>
            </div>
          {:else}
            <select
              bind:value={modalArtistId}
              class="w-full bg-void text-xs text-ink p-2.5 border border-wire focus:border-signal focus:outline-none font-sans"
            >
              {#each availableArtistOptions as a}
                <option value={a.id}>{a.name} ({a.analysis?.subGenre || 'Artist'})</option>
              {/each}
            </select>
          {/if}
        </div>

        {#if modalSelectedArtist}
          <!-- 步驟 2: 心頭好專輯 (支援「點選推薦」+「自由手動填寫」) -->
          {@const notableAlbums = modalSelectedArtist.analysis?.notableAlbums || []}
          <div>
            <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>// 心頭好代表專輯 (FAVORITE_ALBUMS)</span>
              {#if modalPickedAlbums.length > 0}
                <span class="text-signal text-[10px]">已收錄 {modalPickedAlbums.length} 張</span>
              {/if}
            </div>

            <!-- 目前已收錄的喜愛專輯晶片列 (可隨時刪除) -->
            {#if modalPickedAlbums.length > 0}
              <div class="flex flex-wrap gap-1.5 mb-2.5 p-2 bg-void border border-wire">
                {#each modalPickedAlbums as alb}
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-signal/15 text-signal border border-signal/40 text-xs font-sans font-bold">
                    <span>《{alb}》</span>
                    <button
                      type="button"
                      onclick={() => handleModalRemovePickedAlbum(alb)}
                      class="text-signal/70 hover:text-signal p-0.5 cursor-pointer"
                      title="移除此專輯"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                {/each}
              </div>
            {/if}

            <!-- 方式 A: 點選串流推薦名盤 (若有) -->
            {#if notableAlbums.length > 0}
              <div class="text-[10px] font-mono text-[#8E9298] mb-1.5">點擊快速收錄推薦盤：</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {#each notableAlbums as alb}
                  {@const picked = modalPickedAlbums.includes(alb.title)}
                  <button
                    type="button"
                    onclick={() => toggleModalPickedAlbum(alb.title)}
                    class="p-2.5 text-left border transition-all cursor-pointer flex flex-col justify-between {picked
                      ? 'border-signal bg-signal/20 shadow-sm text-signal font-bold'
                      : 'border-wire bg-void text-ink hover:border-wire/90'}"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="font-sans text-xs line-clamp-1">
                        {alb.title}
                      </div>
                      {#if picked}
                        <Check class="w-3.5 h-3.5 text-signal shrink-0" />
                      {/if}
                    </div>
                    <div class="flex items-center justify-between text-[10px] font-mono text-[#8E9298] mt-1.5 pt-1 border-t border-wire/40">
                      <span>{alb.year || 'ALBUM'}</span>
                      <span>{alb.tier === 'milestone' ? '時代基石' : '深埋寶藏'}</span>
                    </div>
                  </button>
                {/each}
              </div>
            {:else}
              <div class="p-2.5 border border-wire border-dashed text-xs text-[#A0A5AE] font-sans bg-void mb-2">
                此藝人庫藏尚未列舉代表專輯，可直接在下方手動鍵入任何代表作品。
              </div>
            {/if}

            <!-- 方式 B: 手動鍵入自訂作品名稱 (因無列舉或想自訂時) -->
            <div class="flex items-center gap-1.5">
              <input
                type="text"
                bind:value={modalCustomAlbumInput}
                placeholder="手動填寫作品名稱（例如：經典單曲、Live 現場版...）後按 Enter"
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleModalAddCustomAlbum();
                  }
                }}
                class="flex-1 bg-void text-xs text-ink placeholder-[#8E9298] px-2.5 py-1.5 border border-wire focus:border-signal focus:outline-none font-sans"
              />
              <button
                type="button"
                onclick={handleModalAddCustomAlbum}
                class="px-3 py-1.5 bg-chassis border border-wire hover:border-signal text-ink hover:text-signal text-xs font-mono transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>收錄專輯</span>
              </button>
            </div>
          </div>

          <!-- 步驟 3: 極簡聆聽情境 (最低限度器材) -->
          <div>
            <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider mb-2">
              // 聆聽情境 (LISTENING_SCENE)
            </div>
            <div class="flex flex-wrap gap-2">
              {#each SCENE_OPTIONS as opt}
                {@const active = modalScene === opt.id}
                <button
                  type="button"
                  onclick={() => toggleModalScene(opt.id)}
                  class="px-3 py-1.5 text-xs font-sans flex items-center gap-1.5 border transition-all cursor-pointer {active
                    ? 'border-signal bg-signal/20 text-signal font-bold'
                    : 'border-wire bg-void text-[#A8ACB4] hover:text-ink'}"
                >
                  <span class="material-symbols-outlined text-[14px]">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 步驟 4: 心選曲目與人文標籤 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- 加曲 -->
            <div class="border border-wire p-3 bg-void">
              <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider mb-1.5">
                // 心選曲目 (FAVORITE_TRACKS)
              </div>
              <div class="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
                {#each modalFavoriteTracks as trk}
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-chassis border border-wire text-xs font-sans text-ink">
                    <span>{trk}</span>
                    <button
                      type="button"
                      onclick={() => handleModalRemoveTrack(trk)}
                      class="text-[#8E9298] hover:text-signal p-0.5 cursor-pointer"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                {/each}
              </div>
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  bind:value={modalNewTrackInput}
                  placeholder="輸入動人曲名後按 Enter..."
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleModalAddTrack();
                    }
                  }}
                  class="flex-1 bg-chassis text-xs text-ink placeholder-[#8E9298] px-2.5 py-1.5 border border-wire focus:border-signal focus:outline-none font-sans"
                />
                <button
                  type="button"
                  onclick={handleModalAddTrack}
                  class="p-1.5 bg-chassis border border-wire hover:border-signal text-ink hover:text-signal text-xs font-mono transition-colors cursor-pointer"
                >
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- 點選氛圍標籤 -->
            <div class="border border-wire p-3 bg-void">
              <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider mb-1.5">
                // 氛圍標籤 (點擊即選)
              </div>
              <div class="flex flex-wrap gap-1.5">
                {#each QUICK_MOOD_TAGS as tag}
                  {@const picked = modalMoodTags.includes(tag)}
                  <button
                    type="button"
                    onclick={() => toggleModalMoodTag(tag)}
                    class="px-2 py-0.5 text-xs font-sans border transition-all cursor-pointer {picked
                      ? 'border-signal bg-signal/20 text-signal font-medium'
                      : 'border-wire bg-chassis text-[#A8ACB4] hover:text-ink'}"
                  >
                    {picked ? '✓ ' : ''}{tag}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- 步驟 5: 隨筆文字 ✕ ✨ AI 共鳴分析 (顯性根據使用者輸入提煉) -->
          <div class="border border-wire p-3.5 bg-void flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="font-mono text-[11px] text-[#A8ACB4] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Feather class="w-3.5 h-3.5 text-signal" />
                <span>// 聽感手札與生活碎片 (FIELD_NOTES)</span>
              </div>

              <!-- AI 共鳴分析按鈕 -->
              <button
                type="button"
                disabled={isAnalyzingResonance}
                onclick={triggerAIResonance}
                class="px-2.5 py-1 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer {isAnalyzingResonance
                  ? 'bg-signal/20 text-signal border border-signal/40 animate-pulse'
                  : 'bg-chassis hover:bg-signal/15 text-signal border border-signal/40 hover:border-signal'}"
                title="AI 將根據您寫下的文字，提煉文學題詞與推薦曲目"
              >
                <Sparkles class="w-3.5 h-3.5 {isAnalyzingResonance ? 'animate-spin' : ''}" />
                <span>{isAnalyzingResonance ? 'AI 體會中...' : '✨ AI 共鳴分析'}</span>
              </button>
            </div>

            <textarea
              bind:value={modalNotes}
              placeholder="在此寫下聆聽時的隻字片語（例如：「窗外下著小雨，這張吉他延遲回音讓人想起大學宿舍的深夜」）... 點擊上方「✨ AI 共鳴分析」，AI 會嚴格依據您寫下的感觸，提煉文學題詞並推薦契合曲目。"
              rows="3"
              class="w-full bg-chassis text-xs leading-relaxed text-ink placeholder-[#8E9298] p-2.5 border border-wire focus:border-signal focus:outline-none resize-none font-sans"
            ></textarea>

            <!-- ✨ 顯性呈現：AI 根據使用者輸入產生的共鳴預覽面板 -->
            {#if resonancePreview}
              <div class="p-3.5 bg-signal/10 border border-signal/50 flex flex-col gap-2 animate-in fade-in duration-200">
                <div class="flex items-center justify-between text-xs font-mono text-signal font-bold">
                  <div class="flex items-center gap-1.5">
                    <Sparkles class="w-3.5 h-3.5 text-signal" />
                    <span>AI 共鳴提煉預覽 // RESONANCE ECHO</span>
                  </div>
                  <button
                    type="button"
                    onclick={() => (resonancePreview = null)}
                    class="text-[#8E9298] hover:text-signal text-[11px] cursor-pointer"
                  >
                    [✕ 關閉預覽]
                  </button>
                </div>

                {#if resonancePreview.userEchoQuote}
                  <div class="text-xs font-serif text-signal italic border-l-2 border-signal pl-2">
                    「{resonancePreview.userEchoQuote}」
                  </div>
                {/if}

                <div class="text-xs text-ink leading-relaxed font-sans bg-void/80 p-2.5 border border-wire">
                  {resonancePreview.enhancedNote}
                </div>

                {#if resonancePreview.recommendedTracks.length > 0}
                  <div class="text-[11px] font-mono text-[#A8ACB4] flex items-center gap-2">
                    <span class="text-signal font-bold">推薦心境曲目:</span>
                    <span>{resonancePreview.recommendedTracks.join('、')}</span>
                  </div>
                {/if}

                <div class="pt-2 flex justify-end">
                  <button
                    type="button"
                    onclick={applyAIResonance}
                    class="px-3 py-1.5 bg-signal text-void font-bold text-xs font-mono flex items-center gap-1.5 hover:bg-signal/90 transition-all cursor-pointer shadow"
                  >
                    <Check class="w-3.5 h-3.5" />
                    <span>採納並套用至手札草稿</span>
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Modal 底部確認儲存 -->
      <div class="p-4 border-t border-wire bg-void flex items-center justify-between">
        <button
          type="button"
          onclick={closeModal}
          class="px-4 py-2 text-xs font-mono text-[#A8ACB4] hover:text-ink transition-colors cursor-pointer"
        >
          取消 (CANCEL)
        </button>

        <button
          type="button"
          disabled={!modalSelectedArtist}
          onclick={handleSaveModal}
          class="px-5 py-2 bg-signal hover:bg-signal/90 text-void font-bold text-xs font-mono flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-signal/20 disabled:opacity-50"
        >
          <Check class="w-4 h-4" />
          <span>{isEditingExisting ? '儲存手札變更' : '完成記述並收錄手札'}</span>
        </button>
      </div>
    </div>
  </div>
{/if}
