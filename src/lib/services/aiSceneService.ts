import { z } from 'zod';
import { loadSecureAISettings } from '$lib/ai/vault';
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
  RateLimitError
} from '$lib/ai/client';
import {
  buildSceneAdvisorPrompt,
  type SceneChatMessage,
  type SceneRecommendationResult,
  type AgentActionProposal
} from '$lib/ai/scenePrompts';
import type { AgentPageContext } from '$lib/ai/agentContext';
import { t, type SupportedLocale } from '$lib/i18n';
import type { ArtistEntry } from '$lib/types/artist';

export interface LocalArtistMatch {
  artist: ArtistEntry;
  hitScore: number;
  hitGenres: string[];
}

const ExternalArtistRecommendationSchema = z.object({
  name: z.string().nullish().transform((v) => (v ? v.trim() : '')),
  subGenre: z.string().nullish().transform((v) => (v ? v.trim() : '')),
  recommendReason: z.string().nullish().transform((v) => (v ? v.trim() : '')),
  curationHighlight: z.string().nullish().transform((v) => (v ? v.trim() : undefined))
});

const AgentActionProposalSchema = z.object({
  type: z.enum([
    'navigate_artist',
    'filter_library',
    'add_to_queue',
    'quick_pickup',
    'enqueue_analysis',
    'analyze_all_inbox',
    'update_artist_weight',
    'append_artist_notes'
  ]),
  label: z.string().nullish().transform((v) => (v ? v.trim() : '')),
  description: z.string().nullish().transform((v) => (v ? v.trim() : undefined)),
  artistName: z.string().nullish().transform((v) => (v ? v.trim() : undefined)),
  albumTitle: z.string().nullish().transform((v) => (v ? v.trim() : undefined)),
  targetView: z
    .enum(['crate-digger', 'honeycomb-cluster', 'listening-log'])
    .nullish()
    .transform((v) => v ?? undefined),
  query: z.string().nullish().transform((v) => (v ? v.trim() : undefined)),
  weight: z
    .number()
    .finite()
    .nullish()
    .transform((v) => (typeof v === 'number' ? Math.max(1, Math.min(100, Math.round(v))) : undefined)),
  notes: z.string().nullish().transform((v) => (v ? v.trim() : undefined)),
  moodTags: z
    .array(z.string())
    .nullish()
    .transform((arr) => (arr ? arr.map((s) => s.trim()).filter(Boolean) : undefined))
});

const SceneRecommendationResponseSchema = z.object({
  reply: z.string().nullish().transform((v) => (v ? v.trim() : '')),
  matchedGenres: z
    .array(z.string())
    .nullish()
    .transform((arr) => (arr ? arr.map((g) => g.trim()).filter(Boolean) : [])),
  externalArtists: z
    .array(ExternalArtistRecommendationSchema)
    .nullish()
    .transform((arr) => (arr ? arr.filter((a) => Boolean(a.name)) : [])),
  actions: z
    .array(AgentActionProposalSchema)
    .nullish()
    .transform((arr) => (arr ? arr.filter((act) => Boolean(act.label)) : [])),
  contextMemory: z.string().nullish().transform((v) => (v ? v.trim() : undefined))
});

/**
 * 清理並解析 LLM 傳回之 JSON 字串
 */
function cleanAndParseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  // 去除 Markdown 代碼區塊標記
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // 嘗試擷取最外層大括號
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned) as T;
}

/**
 * 內部呼叫 Groq Chat Completions API
 * 支援 json_object 約束模式與標準對話 Fallback 模式
 */
async function fetchGroqChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  useJsonObject: boolean
): Promise<{ ok: boolean; status: number; text: string; content?: string }> {
  const bodyPayload: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: useJsonObject ? 2800 : 3200
  };
  if (useJsonObject) {
    bodyPayload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(bodyPayload)
  });

  if (res.status === 429) {
    const headerVal = res.headers.get('retry-after');
    const parsed = headerVal ? parseInt(headerVal, 10) : NaN;
    const retrySec = !isNaN(parsed) && parsed > 0 ? parsed + 1 : 30;
    throw new RateLimitError(t('ai_err_rate_limit_scene', { provider: 'Groq' }), retrySec);
  }

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, text: errText };
  }

  const data = await res.json();
  const content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    data.choices?.[0]?.message?.reasoning ||
    '';
  return { ok: true, status: res.status, text: '', content };
}

/**
 * 呼叫 AI 智慧推薦策展服務
 */
export async function getSceneRecommendation(
  history: SceneChatMessage[],
  locale: SupportedLocale = 'zh-TW',
  existingMemory?: string,
  pageContext?: AgentPageContext
): Promise<SceneRecommendationResult> {
  const secureLoaded = await loadSecureAISettings();
  if (secureLoaded.isLocked) {
    throw new Error(t('ai_err_vault_locked'));
  }

  const settings = secureLoaded.settings;
  const { systemPrompt, userPrompt } = buildSceneAdvisorPrompt(
    history,
    locale,
    existingMemory,
    pageContext
  );
  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error(t('ai_err_groq_key_missing_panel'));
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;
    const apiKey = settings.groqKey.trim();

    // 優先嘗試 JSON Object 約束模式
    let groqRes = await fetchGroqChat(apiKey, groqModel, systemPrompt, userPrompt, true);

    // 若伺服器端驗證器失敗 (如 json_validate_failed、failed to generate JSON、max tokens 截斷等) 或回傳空內容，自動降級為標準對話模式重試
    const shouldFallback =
      !groqRes.ok &&
      groqRes.status === 400 &&
      (groqRes.text.toLowerCase().includes('json') ||
        groqRes.text.toLowerCase().includes('validate') ||
        groqRes.text.toLowerCase().includes('generate') ||
        groqRes.text.toLowerCase().includes('token') ||
        groqRes.text.toLowerCase().includes('response_format'));

    if (shouldFallback || (groqRes.ok && !groqRes.content?.trim())) {
      console.warn('[Groq Scene] 觸發 JSON 約束限制或回傳為空，自動降級為標準對話模式重試 (Fallback)');
      groqRes = await fetchGroqChat(apiKey, groqModel, systemPrompt, userPrompt, false);
    }

    if (!groqRes.ok) {
      const errText = groqRes.text;
      throw new Error(t('ai_err_groq_call_failed', { error: errText }));
    }

    rawJsonText = groqRes.content || '';
  } else {
    // Gemini
    if (!settings.geminiKey.trim()) {
      throw new Error(t('ai_err_gemini_key_missing_panel'));
    }

    const rawModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
    const cleanModel = rawModel.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.geminiKey.trim()}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2800,
          responseMimeType: 'application/json'
        }
      })
    });

    if (res.status === 429) {
      const headerVal = res.headers.get('retry-after');
      const parsed = headerVal ? parseInt(headerVal, 10) : NaN;
      const retrySec = !isNaN(parsed) && parsed > 0 ? parsed + 1 : 30;
      throw new RateLimitError(t('ai_err_rate_limit_scene', { provider: 'Gemini' }), retrySec);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(t('ai_err_gemini_call_failed', { error: errText }));
    }

    const data = await res.json();
    rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  let parsed: SceneRecommendationResult;
  try {
    parsed = cleanAndParseJson<SceneRecommendationResult>(rawJsonText);
  } catch (parseErr: any) {
    if (settings.provider === 'groq') {
      console.warn('[Groq Scene] 輸出無法直接解析為 JSON，自動進入標準模式 Fallback 重試:', parseErr);
      const fallbackRes = await fetchGroqChat(
        settings.groqKey.trim(),
        settings.groqModel || DEFAULT_GROQ_MODEL,
        systemPrompt,
        userPrompt,
        false
      );
      if (fallbackRes.ok && fallbackRes.content) {
        parsed = cleanAndParseJson<SceneRecommendationResult>(fallbackRes.content);
      } else {
        throw new Error(t('ai_err_invalid_json_parse', { error: parseErr?.message || parseErr }));
      }
    } else {
      throw new Error(t('ai_err_invalid_json_parse', { error: parseErr?.message || parseErr }));
    }
  }
  const validated = SceneRecommendationResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      reply: t('ai_scene_default_reply'),
      matchedGenres: [],
      externalArtists: [],
      actions: [],
      contextMemory: existingMemory
    };
  }

  const batchTimestamp = Date.now();
  const normalizedActions: AgentActionProposal[] = (validated.data.actions || []).map((act, idx) => ({
    ...act,
    id: `act_${batchTimestamp}_${idx}`
  }));

  return {
    reply: validated.data.reply || t('ai_scene_default_reply'),
    matchedGenres: validated.data.matchedGenres,
    externalArtists: validated.data.externalArtists,
    actions: normalizedActions,
    // 若本輪未產生新記憶（例如前 2 輪或模型略過欄位），保留既有的濃縮記憶避免遺失
    contextMemory: validated.data.contextMemory || existingMemory
  };
}

/**
 * 根據 AI 產出之風格標籤，極速在本地藝人庫進行加權比對
 * （完全本地運算，不耗費額外 Token）
 */
export function matchLocalArtists(
  artists: ArtistEntry[],
  matchedGenres: string[]
): LocalArtistMatch[] {
  if (!matchedGenres || matchedGenres.length === 0 || !artists || artists.length === 0) {
    return [];
  }

  const normalizedTargets = matchedGenres.map((g) => g.trim().toLowerCase());

  const matches: LocalArtistMatch[] = [];

  for (const artist of artists) {
    let hitScore = 0;
    const hitGenresSet = new Set<string>();

    const artistGenres = [
      ...(artist.analysis?.genres || []),
      artist.analysis?.subGenre || '',
      artist.analysis?.sector || '',
      ...(artist.analysis?.aestheticTags || [])
    ]
      .filter(Boolean)
      .map((g) => g.trim().toLowerCase());

    for (const target of normalizedTargets) {
      for (const ag of artistGenres) {
        if (ag === target) {
          hitScore += 3; // 完全命中給最高分
          hitGenresSet.add(target);
        } else if (ag.includes(target) || target.includes(ag)) {
          hitScore += 1; // 部分模糊包含給基礎分
          hitGenresSet.add(target);
        }
      }
    }

    if (hitScore > 0) {
      matches.push({
        artist,
        hitScore,
        hitGenres: Array.from(hitGenresSet)
      });
    }
  }

  // 依照命中分數降序排序
  matches.sort((a, b) => b.hitScore - a.hitScore);

  // 取前 24 位最契合的藝人
  return matches.slice(0, 24);
}
