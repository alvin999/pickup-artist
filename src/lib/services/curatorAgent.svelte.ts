import {
  getSceneRecommendation,
  matchLocalArtists,
  type LocalArtistMatch
} from '$lib/services/aiSceneService';
import { RateLimitError } from '$lib/ai/client';
import type {
  SceneChatMessage,
  ExternalArtistRecommendation,
  AgentActionProposal
} from '$lib/ai/scenePrompts';
import type { AgentPageContext } from '$lib/ai/agentContext';
import type { ArtistEntry } from '$lib/types/artist';
import { t, type SupportedLocale } from '$lib/i18n';

const SESSION_KEY = 'pua_scene_chat_session_v1';
const isBrowser = typeof window !== 'undefined';

class CuratorAgentStore {
  isOpen = $state(false);
  messages = $state<SceneChatMessage[]>([]);
  contextMemory = $state('');
  activeMatchedGenres = $state<string[]>([]);
  externalRecommendations = $state<ExternalArtistRecommendation[]>([]);
  localMatches = $state<LocalArtistMatch[]>([]);
  suggestedActions = $state<AgentActionProposal[]>([]);
  executedActionIds = $state<string[]>([]);
  addedExternalNames = $state<string[]>([]);
  isLoading = $state(false);
  errorMessage = $state<string | null>(null);
  cooldownSeconds = $state(0);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  initFromSession(artists: ArtistEntry[] = []): void {
    if (!isBrowser || this.initialized) return;
    this.initialized = true;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.messages = saved.messages || [];
      this.contextMemory = saved.contextMemory || '';
      this.activeMatchedGenres = saved.activeMatchedGenres || [];
      this.externalRecommendations = saved.externalRecommendations || [];
      this.suggestedActions = saved.suggestedActions || [];
      this.executedActionIds = saved.executedActionIds || [];
      if (this.activeMatchedGenres.length > 0 && artists.length > 0) {
        this.localMatches = matchLocalArtists(artists, this.activeMatchedGenres);
      }
    } catch (err) {
      console.warn('[CuratorAgent] 無法讀取對話 session:', err);
    }
  }

  recomputeLocalMatches(artists: ArtistEntry[]): void {
    if (this.activeMatchedGenres.length > 0 && artists.length > 0) {
      this.localMatches = matchLocalArtists(artists, this.activeMatchedGenres);
    } else {
      this.localMatches = [];
    }
  }

  private saveSession(): void {
    if (!isBrowser) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          messages: this.messages,
          contextMemory: this.contextMemory,
          activeMatchedGenres: this.activeMatchedGenres,
          externalRecommendations: this.externalRecommendations,
          suggestedActions: this.suggestedActions,
          executedActionIds: this.executedActionIds
        })
      );
    } catch (err) {
      console.warn('[CuratorAgent] 儲存對話 session 失敗:', err);
    }
  }

  private clearCooldown(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.cooldownSeconds = 0;
  }

  private startCooldown(seconds: number): void {
    this.clearCooldown();
    this.cooldownSeconds = Math.max(1, Math.ceil(seconds));
    this.cooldownTimer = setInterval(() => {
      if (this.cooldownSeconds <= 1) {
        this.clearCooldown();
        this.errorMessage = null;
      } else {
        this.cooldownSeconds -= 1;
      }
    }, 1000);
  }

  openDrawer(): void {
    this.isOpen = true;
  }

  closeDrawer(): void {
    this.isOpen = false;
  }

  toggleDrawer(): void {
    this.isOpen = !this.isOpen;
  }

  markActionExecuted(actionId: string): void {
    if (!this.executedActionIds.includes(actionId)) {
      this.executedActionIds = [...this.executedActionIds, actionId];
      this.saveSession();
    }
  }

  markExternalPicked(name: string): void {
    if (!this.addedExternalNames.includes(name)) {
      this.addedExternalNames = [...this.addedExternalNames, name];
    }
  }

  async sendMessage(
    text: string,
    artists: ArtistEntry[],
    locale: SupportedLocale,
    pageContext?: AgentPageContext,
    onErrorToast?: (msg: string) => void
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || this.isLoading || this.cooldownSeconds > 0) return false;

    this.errorMessage = null;
    const nextHistory: SceneChatMessage[] = [
      ...this.messages,
      { role: 'user', content: trimmed }
    ];
    this.messages = nextHistory;
    this.isLoading = true;

    try {
      const result = await getSceneRecommendation(
        nextHistory,
        locale,
        this.contextMemory || undefined,
        pageContext
      );

      this.messages = [...nextHistory, { role: 'assistant', content: result.reply }];
      if (result.contextMemory) {
        this.contextMemory = result.contextMemory;
      }
      this.activeMatchedGenres = result.matchedGenres;
      this.externalRecommendations = result.externalArtists;
      this.suggestedActions = result.actions || [];
      this.localMatches = matchLocalArtists(artists, result.matchedGenres);
      this.saveSession();
      return true;
    } catch (err: any) {
      console.error('[CuratorAgent] 推論失敗:', err);
      if (err instanceof RateLimitError || err?.name === 'RateLimitError') {
        this.startCooldown(err.retryAfterSeconds || 30);
      }
      const msg = err?.message || t('radio_inference_failed');
      this.errorMessage = msg;
      onErrorToast?.(msg || t('radio_error_fallback'));
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  reset(onToast?: (msg: string) => void): void {
    this.messages = [];
    this.contextMemory = '';
    this.activeMatchedGenres = [];
    this.externalRecommendations = [];
    this.localMatches = [];
    this.suggestedActions = [];
    this.executedActionIds = [];
    this.addedExternalNames = [];
    this.errorMessage = null;
    this.clearCooldown();
    if (isBrowser) {
      sessionStorage.removeItem(SESSION_KEY);
    }
    onToast?.(t('radio_new_session_toast'));
  }
}

export const curatorAgent = new CuratorAgentStore();
