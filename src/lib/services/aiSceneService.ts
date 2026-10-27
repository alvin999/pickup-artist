import { loadSecureAISettings } from '$lib/ai/vault';
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
  RateLimitError
} from '$lib/ai/client';
import {
  buildSceneAdvisorPrompt,
  type SceneChatMessage,
  type SceneRecommendationResult
} from '$lib/ai/scenePrompts';
import type { SupportedLocale } from '$lib/i18n';
import type { ArtistEntry } from '$lib/types/artist';

export interface LocalArtistMatch {
  artist: ArtistEntry;
  hitScore: number;
  hitGenres: string[];
}

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
    throw new RateLimitError('Groq API 呼叫頻率超標 (429 Rate Limit)，請稍候重試。', 30);
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
  locale: SupportedLocale = 'zh-TW'
): Promise<SceneRecommendationResult> {
  const secureLoaded = await loadSecureAISettings();
  if (secureLoaded.isLocked) {
    throw new Error('MASTER_PASSWORD_LOCKED: 主密碼保管庫目前已鎖定，請先解鎖以存取金鑰。');
  }

  const settings = secureLoaded.settings;
  const { systemPrompt, userPrompt } = buildSceneAdvisorPrompt(history, locale);
  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('未設定 Groq API Key，請至右上角 AI 設定面板配置。');
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
      throw new Error(`Groq 呼叫異常: ${errText}`);
    }

    rawJsonText = groqRes.content || '';
  } else {
    // Gemini
    if (!settings.geminiKey.trim()) {
      throw new Error('未設定 Gemini API Key，請至右上角 AI 設定面板配置。');
    }

    const rawModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
    const cleanModel = rawModel.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.geminiKey.trim()}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
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
      throw new RateLimitError('Gemini API 呼叫頻率超標 (429 Rate Limit)，請稍候重試。', 30);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini 呼叫異常: ${errText}`);
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
        throw new Error(`AI 回傳內容無法解析為有效 JSON 格式 (${parseErr?.message || parseErr})`);
      }
    } else {
      throw new Error(`AI 回傳內容無法解析為有效 JSON 格式 (${parseErr?.message || parseErr})`);
    }
  }
  return {
    reply: parsed.reply || '已為您調配此情境的聲學風格。',
    matchedGenres: Array.isArray(parsed.matchedGenres) ? parsed.matchedGenres : [],
    externalArtists: Array.isArray(parsed.externalArtists) ? parsed.externalArtists : []
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
