import type { SupportedLocale } from '$lib/i18n';
import type { ArtistEntry, AcousticSector } from '$lib/types/artist';
import type { ListeningQueueItem } from '$lib/services/listeningQueue';
import { sanitizePromptInput } from './prompts';

export type StudioViewId =
  | 'crate-digger'
  | 'honeycomb-cluster'
  | 'acoustic-matrix'
  | 'listening-queue'
  | 'listening-log'
  | 'ai-recommend';

export interface AgentSelectedArtistContext {
  id: string;
  name: string;
  status: 'inbox' | 'analyzed';
  sector?: AcousticSector;
  subGenre?: string;
  weight?: number;
  hasNotes: boolean;
  notableAlbumTitles: string[];
  moodTags: string[];
  personalNotesExcerpt?: string;
}

export interface AgentQueueItemSummary {
  artistName: string;
  albumTitle?: string;
  status: 'queued' | 'listening' | 'completed';
}

export interface AgentPageContext {
  activeView: StudioViewId;
  searchQuery?: string;
  totalArtists: number;
  analyzedCount: number;
  inboxCount: number;
  inboxSampleNames: string[];
  unloggedCount: number;
  sectorCounts: Partial<Record<AcousticSector, number>>;
  selectedArtist?: AgentSelectedArtistContext;
  queueSummary: AgentQueueItemSummary[];
}

export interface AgentQuickChip {
  id: string;
  label: string;
  prompt: string;
  category: 'curation' | 'library';
}

const ALL_SECTORS: AcousticSector[] = [
  'ROCK',
  'METAL',
  'CLASSICAL',
  'JAZZ',
  'AMBIENT',
  'ELECTRONIC',
  'GROOVE',
  'WORLD'
];

function hasArtistLog(artist: ArtistEntry): boolean {
  const hasNotes = typeof artist.personalNotes === 'string' && artist.personalNotes.trim().length > 0;
  const hasAlbums = (artist.listeningContext?.pickedAlbums?.length ?? 0) > 0;
  const hasTracks = (artist.listeningContext?.favoriteTracks?.length ?? 0) > 0;
  const hasMoods = (artist.listeningContext?.moodTags?.length ?? 0) > 0;
  return hasNotes || hasAlbums || hasTracks || hasMoods;
}

/**
 * 彙整當前工作台與曲庫狀態為輕量快照（純本地運算，零 Token 消耗）
 */
export function buildAgentPageContext(params: {
  activeView: StudioViewId;
  artists: ArtistEntry[];
  selectedArtistId: string | null;
  searchQuery?: string;
  queueItems?: ListeningQueueItem[];
}): AgentPageContext {
  const { activeView, artists, selectedArtistId, searchQuery, queueItems = [] } = params;

  const inboxArtists = artists.filter((a) => a.status === 'inbox');
  const analyzedCount = artists.length - inboxArtists.length;
  const unloggedCount = artists.filter((a) => !hasArtistLog(a)).length;

  const sectorCounts: Partial<Record<AcousticSector, number>> = {};
  for (const artist of artists) {
    const sec = artist.analysis?.sector;
    if (sec) {
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    }
  }

  const targetArtist = selectedArtistId
    ? artists.find((a) => a.id === selectedArtistId)
    : undefined;

  const selectedArtist: AgentSelectedArtistContext | undefined = targetArtist
    ? {
        id: targetArtist.id,
        name: targetArtist.name,
        status: targetArtist.status,
        sector: targetArtist.analysis?.sector,
        subGenre: targetArtist.analysis?.subGenre,
        weight: targetArtist.weight ?? 20,
        hasNotes: hasArtistLog(targetArtist),
        notableAlbumTitles: (targetArtist.analysis?.notableAlbums || [])
          .slice(0, 3)
          .map((alb) => alb.title)
          .filter(Boolean),
        moodTags: (targetArtist.listeningContext?.moodTags || []).slice(0, 5),
        personalNotesExcerpt: targetArtist.personalNotes
          ? sanitizePromptInput(targetArtist.personalNotes, 140, false)
          : undefined
      }
    : undefined;

  const activeQueue = queueItems
    .filter((q) => q.status !== 'completed')
    .slice(0, 6)
    .map((q) => ({
      artistName: q.artistName,
      albumTitle: q.albumTitle,
      status: q.status
    }));

  return {
    activeView,
    searchQuery: searchQuery?.trim() ? sanitizePromptInput(searchQuery, 60) : undefined,
    totalArtists: artists.length,
    analyzedCount,
    inboxCount: inboxArtists.length,
    inboxSampleNames: inboxArtists.slice(0, 5).map((a) => a.name),
    unloggedCount,
    sectorCounts,
    selectedArtist,
    queueSummary: activeQueue
  };
}

/**
 * 將頁面快照精簡序列化為 Prompt 脈絡文字（嚴控於 ~200 Tokens 內）
 */
export function formatAgentContextForPrompt(ctx: AgentPageContext): string {
  const lines: string[] = [];
  lines.push(`Active View: ${ctx.activeView}`);
  lines.push(
    `Library Stats: total=${ctx.totalArtists}, analyzed=${ctx.analyzedCount}, inbox=${ctx.inboxCount}, unlogged=${ctx.unloggedCount}`
  );

  if (ctx.inboxSampleNames.length > 0) {
    lines.push(`Inbox Artists Sample: ${ctx.inboxSampleNames.join(', ')}`);
  }

  const sectorParts = ALL_SECTORS.map((sec) => `${sec}:${ctx.sectorCounts[sec] || 0}`);
  lines.push(`Sector Distribution: ${sectorParts.join(' | ')}`);

  if (ctx.searchQuery) {
    lines.push(`Active Search Filter: "${ctx.searchQuery}"`);
  }

  if (ctx.selectedArtist) {
    const sa = ctx.selectedArtist;
    const details = [
      `name="${sanitizePromptInput(sa.name, 60)}"`,
      `status=${sa.status}`,
      sa.sector ? `sector=${sa.sector}` : '',
      sa.subGenre ? `subGenre=${sanitizePromptInput(sa.subGenre, 40)}` : '',
      `weight=${sa.weight ?? 20}`,
      `hasLog=${sa.hasNotes}`
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`Focused Artist: ${details}`);
    if (sa.notableAlbumTitles.length > 0) {
      lines.push(`Focused Artist Albums: ${sa.notableAlbumTitles.join(' / ')}`);
    }
    if (sa.moodTags.length > 0) {
      lines.push(`Focused Artist Moods: ${sa.moodTags.join(', ')}`);
    }
    if (sa.personalNotesExcerpt) {
      lines.push(`Focused Artist Notes: ${sa.personalNotesExcerpt}`);
    }
  }

  if (ctx.queueSummary.length > 0) {
    const qStr = ctx.queueSummary
      .map((q) => `${q.artistName}${q.albumTitle ? `《${q.albumTitle}》` : ''}[${q.status}]`)
      .join(', ');
    lines.push(`Listening Queue: ${qStr}`);
  }

  return lines.join('\n');
}

/**
 * 依當前視圖與曲庫狀態產生零 Token 快捷提問按鈕
 */
export function getQuickChipsForContext(
  ctx: AgentPageContext,
  locale: SupportedLocale = 'zh-TW'
): AgentQuickChip[] {
  const chips: AgentQuickChip[] = [];

  if (locale === 'zh-TW') {
    if (ctx.selectedArtist && (ctx.activeView === 'crate-digger' || ctx.activeView === 'honeycomb-cluster')) {
      chips.push({
        id: 'focused-deep-dive',
        label: `延伸探索「${ctx.selectedArtist.name}」`,
        prompt: `請結合我目前聚焦的音樂人「${ctx.selectedArtist.name}」，解析其聲學特色並推薦關聯的庫內與庫外音樂人。`,
        category: 'curation'
      });
    }

    if (ctx.activeView === 'honeycomb-cluster') {
      chips.push({
        id: 'galaxy-blindspots',
        label: '診斷星系板塊盲區',
        prompt: '請根據我目前的 8 軸板塊分布統計，指出收藏較稀缺的聲學板塊與風格盲區，並推薦適合作為橋接的音樂人。',
        category: 'library'
      });
    } else if (ctx.activeView === 'acoustic-matrix') {
      chips.push({
        id: 'matrix-playlist',
        label: ctx.searchQuery ? `依「${ctx.searchQuery}」組建主題聆賞` : '跨流派混搭提案',
        prompt: ctx.searchQuery
          ? `請針對我目前篩選的關鍵字「${ctx.searchQuery}」，從曲庫挑出適配藝人並推薦庫外延伸名單，協助排入聆賞隊列。`
          : '請依我曲庫中的風格分布，提案一組兼具層次對比的跨流派聆賞組合。',
        category: 'curation'
      });
    } else if (ctx.activeView === 'listening-queue') {
      chips.push({
        id: 'queue-flow',
        label: '編排與補齊聆賞隊列',
        prompt: '請檢視我目前的聆賞隊列順序，建議聆聽動線或補入能承接氛圍的庫內盤片。',
        category: 'curation'
      });
    } else if (ctx.activeView === 'listening-log') {
      chips.push({
        id: 'log-resonance',
        label: '整理日誌與延伸共鳴',
        prompt: ctx.selectedArtist
          ? `請根據「${ctx.selectedArtist.name}」的現有狀態與我的聆賞脈絡，建議可補充的筆記方向或氛圍標籤，並推薦風格共鳴的音樂人。`
          : '請盤點曲庫中尚未撰寫聆賞筆記的項目，協助規劃優先品鑑與補記順序。',
        category: 'library'
      });
    }

    if (ctx.inboxCount > 0) {
      chips.push({
        id: 'library-inbox-triage',
        label: `整理 ${ctx.inboxCount} 筆待解剖藝人`,
        prompt: `我目前有 ${ctx.inboxCount} 筆尚未進行 AI 解剖的 inbox 藝人，請協助評估整理策略並提案批次解剖或優先處理項目。`,
        category: 'library'
      });
    } else if (chips.length < 2) {
      chips.push({
        id: 'library-health-check',
        label: '健檢曲庫與權重建議',
        prompt: '請檢視我目前的曲庫統計與板塊分布，給予資料庫整理、權重調整或下一步拾音的建議。',
        category: 'library'
      });
    }

    return chips.slice(0, 3);
  }

  if (locale === 'ja') {
    if (ctx.selectedArtist && (ctx.activeView === 'crate-digger' || ctx.activeView === 'honeycomb-cluster')) {
      chips.push({
        id: 'focused-deep-dive',
        label: `「${ctx.selectedArtist.name}」を深掘り`,
        prompt: `現在フォーカス中の「${ctx.selectedArtist.name}」の音響的特徴を踏まえ、ライブラリ内外の関連アーティストを提案してください。`,
        category: 'curation'
      });
    }

    if (ctx.activeView === 'honeycomb-cluster') {
      chips.push({
        id: 'galaxy-blindspots',
        label: 'セクター分布の空白を診断',
        prompt: '現在の8軸セクター分布に基づき、手薄なジャンル領域を分析し、橋渡しとなるアーティストを提案してください。',
        category: 'library'
      });
    } else if (ctx.activeView === 'listening-queue') {
      chips.push({
        id: 'queue-flow',
        label: 'キューの流れを最適化',
        prompt: '現在のリスニングキューを確認し、流れを補完するライブラリ内の作品や並べ替えを提案してください。',
        category: 'curation'
      });
    }

    if (ctx.inboxCount > 0) {
      chips.push({
        id: 'library-inbox-triage',
        label: `未解析 ${ctx.inboxCount} 件を整理`,
        prompt: `現在 ${ctx.inboxCount} 件の未解析（inbox）アーティストがあります。整理方針と一括解析アクションを提案してください。`,
        category: 'library'
      });
    } else if (chips.length < 2) {
      chips.push({
        id: 'library-health-check',
        label: 'ライブラリ整理の提案',
        prompt: '現在のライブラリ統計とセクター分布を確認し、整理やウェイト調整、新規発掘の提案をしてください。',
        category: 'library'
      });
    }

    return chips.slice(0, 3);
  }

  // English
  if (ctx.selectedArtist && (ctx.activeView === 'crate-digger' || ctx.activeView === 'honeycomb-cluster')) {
    chips.push({
      id: 'focused-deep-dive',
      label: `Explore beyond "${ctx.selectedArtist.name}"`,
      prompt: `Based on my currently focused artist "${ctx.selectedArtist.name}", analyze their sonic lineage and recommend related vault and external artists.`,
      category: 'curation'
    });
  }

  if (ctx.activeView === 'honeycomb-cluster') {
    chips.push({
      id: 'galaxy-blindspots',
      label: 'Diagnose sector blindspots',
      prompt: 'Review my 8-sector distribution, highlight underrepresented sonic territories, and suggest bridging artists.',
      category: 'library'
    });
  } else if (ctx.activeView === 'listening-queue') {
    chips.push({
      id: 'queue-flow',
      label: 'Balance listening queue',
      prompt: 'Inspect my current listening queue and suggest vault additions or pacing adjustments.',
      category: 'curation'
    });
  } else if (ctx.activeView === 'acoustic-matrix') {
    chips.push({
      id: 'matrix-playlist',
      label: ctx.searchQuery ? `Curate around "${ctx.searchQuery}"` : 'Cross-genre curation',
      prompt: ctx.searchQuery
        ? `Using my active filter "${ctx.searchQuery}", curate matching vault artists and external discoveries to queue.`
        : 'Propose a cohesive cross-genre listening session based on my library sectors.',
      category: 'curation'
    });
  }

  if (ctx.inboxCount > 0) {
    chips.push({
      id: 'library-inbox-triage',
      label: `Triage ${ctx.inboxCount} inbox artists`,
      prompt: `I have ${ctx.inboxCount} unanalyzed inbox artists. Suggest a cleanup strategy and propose analysis queue actions.`,
      category: 'library'
    });
  } else if (chips.length < 2) {
    chips.push({
      id: 'library-health-check',
      label: 'Library health & cleanup',
      prompt: 'Review my library stats and sector balance, and propose practical organization or weight-tuning actions.',
      category: 'library'
    });
  }

  return chips.slice(0, 3);
}
