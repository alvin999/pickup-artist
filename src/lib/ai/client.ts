import { ArtistAnalysisResponseSchema, sanitizeAnalysisPayload, NotableAlbumSchema, type ValidatedArtistAnalysisResponse } from './schema';
import {
  buildArtistAnalysisPrompt,
  buildMoreSimilarArtistsPrompt,
  buildMoreNotableAlbumsPrompt,
  buildListeningResonancePrompt,
  type DisambiguationContext
} from './prompts';
import type { SupportedLocale } from '$lib/i18n';
import { loadSecureAISettings } from './vault';
import type { NotableAlbum } from '$lib/types/artist';
import { buildAppleMusicSearchUrl } from '$lib/utils/appleMusic';

export interface AISettings {
  provider: 'groq' | 'gemini';
  groqKey: string;
  geminiKey: string;
  groqModel: string;
  geminiModel: string;
}

/**
 * 自訂 429 Rate Limit 錯誤型別
 * 攜帶 API 指定之冷卻秒數 (Retry-After)，供背景批次佇列無感排程與自動重試
 */
export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 從 HTTP 回應標頭或錯誤內容中擷取 429 冷卻重試秒數
 */
function extractRetrySeconds(res: Response, rawText: string): number {
  const headerVal = res.headers.get('retry-after');
  if (headerVal) {
    const sec = parseInt(headerVal, 10);
    if (!isNaN(sec) && sec > 0) return sec + 1;
  }

  // 嘗試從文字中解析，例如 "Please try again in 36.637s"
  const match = rawText.match(/try again in ([\d.]+)s/i);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.ceil(parsed) + 1; // 預留 1 秒緩衝保護
    }
  }

  return 35; // 預設 35 秒安全冷卻期
}

const STORAGE_KEYS = {
  PROVIDER: 'pua_ai_provider',
  GROQ_KEY: 'pua_groq_api_key',
  GEMINI_KEY: 'pua_gemini_api_key',
  GROQ_MODEL: 'pua_groq_selected_model',
  GEMINI_MODEL: 'pua_gemini_selected_model'
};

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

// 取得本機儲存之 AI 設定（純文字 fallback）
export function getStoredAISettings(): AISettings {
  if (typeof window === 'undefined') {
    return {
      provider: 'groq',
      groqKey: '',
      geminiKey: '',
      groqModel: DEFAULT_GROQ_MODEL,
      geminiModel: DEFAULT_GEMINI_MODEL
    };
  }

  return {
    provider: (localStorage.getItem(STORAGE_KEYS.PROVIDER) as 'groq' | 'gemini') || 'groq',
    groqKey: localStorage.getItem(STORAGE_KEYS.GROQ_KEY) || '',
    geminiKey: localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) || '',
    groqModel: localStorage.getItem(STORAGE_KEYS.GROQ_MODEL) || DEFAULT_GROQ_MODEL,
    geminiModel: localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL
  };
}

// 儲存 AI 設定（純文字）
export function saveAISettings(settings: Partial<AISettings>): void {
  if (typeof window === 'undefined') return;

  if (settings.provider) localStorage.setItem(STORAGE_KEYS.PROVIDER, settings.provider);
  if (settings.groqKey !== undefined) localStorage.setItem(STORAGE_KEYS.GROQ_KEY, settings.groqKey);
  if (settings.geminiKey !== undefined) localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, settings.geminiKey);
  if (settings.groqModel) localStorage.setItem(STORAGE_KEYS.GROQ_MODEL, settings.groqModel);
  if (settings.geminiModel) localStorage.setItem(STORAGE_KEYS.GEMINI_MODEL, settings.geminiModel);
}

// 動態探勘 Groq 模型列表
export async function fetchGroqModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('Groq API Key 為空');

  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`無法取得 Groq 模型列表 (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const models: string[] = (data.data || [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => !id.includes('whisper') && !id.includes('guard'));

  return models.sort();
}

// 動態探勘 Google Gemini 模型列表
export async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('Gemini API Key 為空');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`無法取得 Gemini 模型列表 (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const models: string[] = (data.models || [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent')
    )
    .map((m: { name: string }) => m.name.replace('models/', ''));

  return models.sort();
}

function parseApiError(status: number, rawText: string): string {
  try {
    const json = JSON.parse(rawText);
    if (json.error?.message) return `[${status}] ${json.error.message}`;
    if (json.error?.status) return `[${status}] ${json.error.status}: ${json.error.message || ''}`;
    if (json.message) return `[${status}] ${json.message}`;
  } catch {}
  return `[${status}] ${rawText.slice(0, 200)}`;
}

/**
 * 健壯型 JSON 提取與截斷修復器
 * 1. 支援標準 JSON 直接解析
 * 2. 支援去除 ```json 或 ``` 代碼區塊（即使結尾被截斷未閉合也能提取）
 * 3. 支援首尾雜質剝離（以首個 '{' 與最後一個 '}' 為有效邊界）
 * 4. 具備截斷自動閉合修復（Auto-closing Repair）：若末尾因 token 上限缺少閉合引號或括號，自動補齊以保證可解析性
 */
function extractAndParseJson(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('AI 返回內容為空');
  }

  // 1. 嘗試直接解析
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. 嘗試剝離 Markdown 代碼塊（支援 ```json, ```JSON, 或單純 ```，且允許末尾無閉合反引號的容錯）
  const codeBlockMatch = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/);
  if (codeBlockMatch && codeBlockMatch[1].trim()) {
    const candidate = codeBlockMatch[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 3. 嘗試以首個 '{' 與最後一個 '}' 提取有效 JSON 子字串
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 4. 自動補全修復（處理末尾被截斷的狀況）
  if (firstBrace !== -1) {
    let candidate = trimmed.substring(firstBrace);
    // 檢查引號是否成對，若不成對補上結束引號
    const quoteCount = (candidate.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      candidate += '"';
    }
    // 檢查方括號與大括號未閉合數量並補全
    const openBrackets = (candidate.match(/\[/g) || []).length;
    const closeBrackets = (candidate.match(/\]/g) || []).length;
    for (let i = 0; i < (openBrackets - closeBrackets); i++) {
      candidate += ']';
    }
    const openBraces = (candidate.match(/\{/g) || []).length;
    const closeBraces = (candidate.match(/\}/g) || []).length;
    for (let i = 0; i < (openBraces - closeBraces); i++) {
      candidate += '}';
    }
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  console.error('[AI Output Parse Error] 完整原始輸出:', rawText);
  throw new Error(`AI 未返回有效的 JSON 格式：${rawText.slice(0, 200)}...`);
}

/**
 * 快速測試 API Key 是否有效
 */
export async function testAIConnection(
  provider: 'groq' | 'gemini',
  apiKey: string,
  modelName: string
): Promise<{ success: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { success: false, message: 'API Key 不可為空' };
  }

  try {
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: modelName || DEFAULT_GROQ_MODEL,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5
        })
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, message: `Groq 驗證失敗: ${parseApiError(res.status, text)}` };
      }
      return { success: true, message: 'Groq API 連線驗證成功！' };
    } else {
      const rawModel = modelName || DEFAULT_GEMINI_MODEL;
      const cleanModel = rawModel.replace(/^models\//, '');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, message: `Gemini 驗證失敗: ${parseApiError(res.status, text)}` };
      }
      return { success: true, message: 'Gemini API 連線驗證成功！' };
    }
  } catch (err: any) {
    return { success: false, message: `連線異常: ${err?.message || err}` };
  }
}

/**
 * Groq 標準對話降級呼叫（不含 response_format json_object 約束）
 * 解決部分模型在強制 json_object 時回傳空字串或報 400 validation error
 */
async function callGroqStandardFallback(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2400
    })
  });

  if (res.status === 429) {
    const errText = await res.text();
    const retrySec = extractRetrySeconds(res, errText);
    throw new RateLimitError(
      `Groq API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後自動重試。`,
      retrySec
    );
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq 降級呼叫失敗: ${parseApiError(res.status, err)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  return (
    choice?.message?.content ||
    choice?.text ||
    choice?.message?.reasoning ||
    (choice?.message as any)?.reasoning_content ||
    ''
  );
}

/**
 * 執行音樂學分析（BYOK Client-Side 推論）
 */
export async function analyzeArtistWithAI(
  artistName: string,
  locale: SupportedLocale = 'zh-TW',
  customSettings?: Partial<AISettings>,
  context?: DisambiguationContext
): Promise<ValidatedArtistAnalysisResponse> {
  const secureLoaded = await loadSecureAISettings();
  if (secureLoaded.isLocked) {
    throw new Error('MASTER_PASSWORD_LOCKED: 主密碼保管庫目前已鎖定，請先解鎖以存取金鑰。');
  }

  const settings = { ...secureLoaded.settings, ...customSettings };
  const { systemPrompt, userPrompt } = buildArtistAnalysisPrompt(artistName, locale, context);

  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('未設定 Groq API Key，請至右上角設定面板輸入。');
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

    // 將 max_tokens 設為 2400：既能充分容納繁體中文長評述，又將預扣限制在 ~3,000 Tokens（遠低於 8,000 TPM 限額）
    let res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.groqKey.trim()}`
      },
      body: JSON.stringify({
        model: groqModel,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 2400
      })
    });

    // 攔截 429 Rate Limit：提取冷卻時間供呼叫端無感自動排程重試
    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Groq API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後自動重試。`,
        retrySec
      );
    }

    // 若因特定模型不支援 json_object 或伺服器端驗證器失敗，降級為標準對話模式重試
    if (res.status === 400) {
      const errText = await res.text();
      const isJsonValidationError =
        errText.toLowerCase().includes('failed to validate json') ||
        errText.toLowerCase().includes('response_format') ||
        errText.toLowerCase().includes('json_object');

      if (isJsonValidationError) {
        console.warn('[Groq] 伺服器端 JSON 約束未通過，自動降級為標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      } else {
        throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    } else if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, err)}`);
    } else {
      const data = await res.json();
      const choice = data.choices?.[0];
      rawJsonText =
        choice?.message?.content ||
        choice?.text ||
        choice?.message?.reasoning ||
        (choice?.message as any)?.reasoning_content ||
        '';

      // 若 json_object 約束模式回傳空字串（常見於特定模型在約束文法下的行為），以標準對話模式重試
      if (!rawJsonText.trim()) {
        console.warn('[Groq] json_object 約束模式回傳空字串，自動以標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      }
    }
  } else {
    // Gemini
    if (!settings.geminiKey.trim()) {
      throw new Error('未設定 Gemini API Key，請至右上角設定面板輸入。');
    }

    const rawModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
    const cleanModel = rawModel.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.geminiKey.trim()}`;

    // 優先以 responseMimeType: 'application/json' 請求，maxOutputTokens 調整為 2400
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 2400
        }
      })
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Gemini API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後自動重試。`,
        retrySec
      );
    }

    // 若因特定舊模型不支援 responseMimeType 導致 400，降級重試
    if (res.status === 400) {
      const errText = await res.text();
      if (errText.toLowerCase().includes('response_mime_type') || errText.toLowerCase().includes('application/json')) {
        console.warn('[Gemini] 模型不支援 responseMimeType，自動降級為標準模式');
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2400
            }
          })
        });

        if (res.status === 429) {
          const retryErrText = await res.text();
          const retrySec = extractRetrySeconds(res, retryErrText);
          throw new RateLimitError(
            `Gemini API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後自動重試。`,
            retrySec
          );
        }
      } else {
        throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, err)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    rawJsonText = parts.map((p: any) => p.text).filter(Boolean).join('\n');
  }

  // 使用堅固型提取器進行容錯解析（支援代碼塊剝離、頭尾邊界截取與截斷補齊修復）
  const parsedJson = extractAndParseJson(rawJsonText);

  // 先進行資料預清洗（去除 null 污染、補齊預設鍵名別名如 sub_genre/albums）
  const sanitized = sanitizeAnalysisPayload(parsedJson, artistName);

  // 使用寬容 Zod 進行 Schema 檢驗與補齊
  const validationResult = ArtistAnalysisResponseSchema.safeParse(sanitized);
  if (!validationResult.success) {
    console.error('Schema 驗證錯誤:', validationResult.error.format());
    throw new Error(`AI 資料結構不符合發燒友標準規範: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
  }

  // 自動補齊推薦專輯的 Apple Music 搜尋 URL（前端自動合成，不浪費 LLM 生成 Token）
  if (validationResult.data.notableAlbums) {
    validationResult.data.notableAlbums = validationResult.data.notableAlbums.map((alb) => ({
      ...alb,
      appleMusicSearchUrl:
        alb.appleMusicSearchUrl ||
        `https://music.apple.com/search?term=${encodeURIComponent(artistName + ' ' + alb.title)}`
    }));
  }

  return validationResult.data;
}

/**
 * 請 AI 探索推薦更多相似藝人（極度精簡，極低 Token 消耗）
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 注入在庫藝人與當前已推薦名單作為排除名單（Exclude List），確保 AI 探索全新的音樂面貌。
 * 2. 支援 Groq (Llama 3.3) 與 Gemini 2.0 Flash 雙引擎，具備 429 RateLimit 與自動修復解析能力。
 * 3. 僅解析 similarArtists 字串陣列，過濾空值與排除名單，回傳乾淨的推薦陣列。
 */
export async function fetchMoreSimilarArtists(
  artistName: string,
  sector?: string,
  subGenre?: string,
  excludeList: string[] = [],
  locale: SupportedLocale = 'zh-TW',
  customSettings?: AISettings
): Promise<string[]> {
  let settings: AISettings;

  if (customSettings) {
    settings = customSettings;
  } else {
    const secureLoaded = await loadSecureAISettings();
    settings = secureLoaded.settings;
  }

  const { systemPrompt, userPrompt } = buildMoreSimilarArtistsPrompt(
    artistName,
    sector,
    subGenre,
    excludeList,
    locale
  );

  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('Groq API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.groqKey.trim()}`
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      })
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Groq API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    // 若伺服器端 JSON 約束未通過（400 Failed to validate JSON），自動降級為標準對話模式重試
    if (res.status === 400) {
      const errText = await res.text();
      const isJsonValidationError =
        errText.toLowerCase().includes('failed to validate json') ||
        errText.toLowerCase().includes('response_format') ||
        errText.toLowerCase().includes('json_object');

      if (isJsonValidationError) {
        console.warn('[Groq] 相似藝人 JSON 約束未通過，自動降級為標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      } else {
        throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    } else if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, err)}`);
    } else {
      const data = await res.json();
      const choice = data.choices?.[0];
      rawJsonText =
        choice?.message?.content ||
        choice?.text ||
        choice?.message?.reasoning ||
        (choice?.message as any)?.reasoning_content ||
        '';

      if (!rawJsonText.trim()) {
        console.warn('[Groq] 相似藝人回傳空字串，以標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      }
    }
  } else {
    if (!settings.geminiKey.trim()) {
      throw new Error('Gemini API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${
      settings.geminiModel || DEFAULT_GEMINI_MODEL
    }:generateContent?key=${settings.geminiKey.trim()}`;

    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    if (res.status === 429) {
      const retryErrText = await res.text();
      const retrySec = extractRetrySeconds(res, retryErrText);
      throw new RateLimitError(
        `Gemini API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      if (errText.toLowerCase().includes('response_mime_type') || errText.toLowerCase().includes('application/json')) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3 }
          })
        });
      } else {
        throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, err)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    rawJsonText = parts.map((p: any) => p.text).filter(Boolean).join('\n');
  }

  const parsedJson = extractAndParseJson(rawJsonText) as any;
  const list = Array.isArray(parsedJson?.similarArtists)
    ? parsedJson.similarArtists
    : Array.isArray(parsedJson)
    ? parsedJson
    : [];

  const excludeSet = new Set(excludeList.map((n) => n.trim().toLowerCase()));
  return list
    .filter((name: any) => typeof name === 'string' && name.trim())
    .map((name: string) => name.trim())
    .filter((name: string) => !excludeSet.has(name.toLowerCase()));
}

/**
 * 請 AI 探索推薦更多代表盤與發燒寶藏（擴展藝人之 notableAlbums）
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 注入已收錄專輯排除名單，精準要求 AI 挖掘全新的時代基石 (milestone) 或深埋寶藏 (hidden-treasure)。
 * 2. 嚴格經由 NotableAlbumSchema 驗證，並自動生成 Apple Music 搜尋 URL。
 * 3. 雙引擎 (Groq / Gemini) 支援，具備 429 RateLimit 與自動修復降級解析。
 */
export async function fetchMoreNotableAlbums(
  artistName: string,
  sector?: string,
  subGenre?: string,
  excludeAlbums: string[] = [],
  locale: SupportedLocale = 'zh-TW',
  customSettings?: AISettings
): Promise<NotableAlbum[]> {
  let settings: AISettings;

  if (customSettings) {
    settings = customSettings;
  } else {
    const secureLoaded = await loadSecureAISettings();
    settings = secureLoaded.settings;
  }

  const { systemPrompt, userPrompt } = buildMoreNotableAlbumsPrompt(
    artistName,
    sector,
    subGenre,
    excludeAlbums,
    locale
  );

  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('Groq API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.groqKey.trim()}`
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      })
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Groq API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    if (res.status === 400) {
      const errText = await res.text();
      const isJsonValidationError =
        errText.toLowerCase().includes('failed to validate json') ||
        errText.toLowerCase().includes('response_format') ||
        errText.toLowerCase().includes('json_object');

      if (isJsonValidationError) {
        console.warn('[Groq] 專輯探索 JSON 約束未通過，自動降級為標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      } else {
        throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    } else if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, err)}`);
    } else {
      const data = await res.json();
      const choice = data.choices?.[0];
      rawJsonText =
        choice?.message?.content ||
        choice?.text ||
        choice?.message?.reasoning ||
        (choice?.message as any)?.reasoning_content ||
        '';

      if (!rawJsonText.trim()) {
        console.warn('[Groq] 專輯探索回傳空字串，以標準對話模式重試');
        rawJsonText = await callGroqStandardFallback(settings.groqKey.trim(), groqModel, systemPrompt, userPrompt);
      }
    }
  } else {
    if (!settings.geminiKey.trim()) {
      throw new Error('Gemini API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${
      settings.geminiModel || DEFAULT_GEMINI_MODEL
    }:generateContent?key=${settings.geminiKey.trim()}`;

    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    if (res.status === 429) {
      const retryErrText = await res.text();
      const retrySec = extractRetrySeconds(res, retryErrText);
      throw new RateLimitError(
        `Gemini API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      if (errText.toLowerCase().includes('response_mime_type') || errText.toLowerCase().includes('application/json')) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3 }
          })
        });
      } else {
        throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini 呼叫失敗: ${parseApiError(res.status, err)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    rawJsonText = parts.map((p: any) => p.text).filter(Boolean).join('\n');
  }

  const parsedJson = extractAndParseJson(rawJsonText) as any;
  const albumRawList = Array.isArray(parsedJson?.notableAlbums)
    ? parsedJson.notableAlbums
    : Array.isArray(parsedJson?.albums)
    ? parsedJson.albums
    : Array.isArray(parsedJson)
    ? parsedJson
    : [];

  const excludeSet = new Set(excludeAlbums.map((t) => t.trim().toLowerCase()));

  const validatedAlbums: NotableAlbum[] = [];
  for (const item of albumRawList) {
    const parsed = NotableAlbumSchema.safeParse(item);
    if (parsed.success) {
      const alb = parsed.data;
      if (!alb.title || excludeSet.has(alb.title.trim().toLowerCase())) continue;

      validatedAlbums.push({
        title: alb.title.trim(),
        year: alb.year || '',
        tier: alb.tier,
        description: alb.description || '',
        appleMusicSearchUrl: buildAppleMusicSearchUrl(`${artistName} ${alb.title.trim()}`),
        rarityReason: alb.rarityReason,
        audiophileHighlight: alb.audiophileHighlight,
        dynamicRangeScore: alb.dynamicRangeScore,
        losslessSpec: (item as any)?.losslessSpec || 'Lossless'
      });
    }
  }

  return validatedAlbums;
}

export interface ListeningResonanceResult {
  userEchoQuote?: string;
  enhancedNote: string;
  recommendedTracks: string[];
  moodTags: string[];
  suggestedScene?: 'headphone' | 'speaker' | 'on-the-go' | 'night-solitude';
}

/**
 * 執行「人文聽感共鳴分析」
 * 根據使用者隨手筆記或音樂人底蘊，提煉出詩意感言、推薦契合曲目與情境標籤
 */
export async function analyzeListeningResonance(
  artistName: string,
  userNotes: string,
  availableAlbums: string[] = [],
  locale: SupportedLocale = 'zh-TW',
  overrideSettings?: AISettings
): Promise<ListeningResonanceResult> {
  let settings = overrideSettings;
  if (!settings) {
    const secureLoaded = await loadSecureAISettings();
    settings = secureLoaded.settings;
  }

  const { systemPrompt, userPrompt } = buildListeningResonancePrompt(
    artistName,
    userNotes,
    availableAlbums,
    locale
  );

  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('Groq API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.groqKey.trim()}`
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      })
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Groq API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API 請求失敗 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    rawJsonText = data.choices?.[0]?.message?.content || '{}';
  } else {
    // Gemini
    if (!settings.geminiKey.trim()) {
      throw new Error('Gemini API Key 未設定，請至 AI 引擎設定面板完成配置');
    }

    const geminiModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${settings.geminiKey.trim()}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.5
        }
      })
    });

    if (res.status === 429) {
      const errText = await res.text();
      const retrySec = extractRetrySeconds(res, errText);
      throw new RateLimitError(
        `Gemini API 呼叫頻率超標 (429 Rate Limit)。已啟動冷卻保護，預計於 ${retrySec} 秒後可再次請求。`,
        retrySec
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API 請求失敗 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  }

  try {
    const parsed = JSON.parse(rawJsonText);
    const validScenes: Array<'headphone' | 'speaker' | 'on-the-go' | 'night-solitude'> = [
      'headphone',
      'speaker',
      'on-the-go',
      'night-solitude'
    ];
    const scene = validScenes.includes(parsed.suggestedScene) ? parsed.suggestedScene : undefined;

    return {
      userEchoQuote: typeof parsed.userEchoQuote === 'string' ? parsed.userEchoQuote.trim() : undefined,
      enhancedNote: typeof parsed.enhancedNote === 'string' ? parsed.enhancedNote.trim() : userNotes,
      recommendedTracks: Array.isArray(parsed.recommendedTracks)
        ? parsed.recommendedTracks.map((t: any) => String(t).trim()).filter(Boolean)
        : [],
      moodTags: Array.isArray(parsed.moodTags)
        ? parsed.moodTags.map((t: any) => String(t).trim()).filter(Boolean)
        : [],
      suggestedScene: scene
    };
  } catch (err) {
    console.warn('[AI Listening Resonance Parse Error]:', err, rawJsonText);
    return {
      enhancedNote: userNotes,
      recommendedTracks: [],
      moodTags: []
    };
  }
}

