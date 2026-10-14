import { ArtistAnalysisResponseSchema, type ValidatedArtistAnalysisResponse } from './schema';
import { buildArtistAnalysisPrompt } from './prompts';
import type { SupportedLocale } from '$lib/i18n';
import { loadSecureAISettings } from './vault';

export interface AISettings {
  provider: 'groq' | 'gemini';
  groqKey: string;
  geminiKey: string;
  groqModel: string;
  geminiModel: string;
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
 * 執行音樂學分析（BYOK Client-Side 推論）
 */
export async function analyzeArtistWithAI(
  artistName: string,
  locale: SupportedLocale = 'zh-TW',
  customSettings?: Partial<AISettings>
): Promise<ValidatedArtistAnalysisResponse> {
  const secureLoaded = await loadSecureAISettings();
  if (secureLoaded.isLocked) {
    throw new Error('MASTER_PASSWORD_LOCKED: 主密碼保管庫目前已鎖定，請先解鎖以存取金鑰。');
  }

  const settings = { ...secureLoaded.settings, ...customSettings };
  const { systemPrompt, userPrompt } = buildArtistAnalysisPrompt(artistName, locale);

  let rawJsonText = '';

  if (settings.provider === 'groq') {
    if (!settings.groqKey.trim()) {
      throw new Error('未設定 Groq API Key，請至右上角設定面板輸入。');
    }

    const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

    // 優先以 response_format: { type: 'json_object' } 請求，並給足 4096 tokens 避免中途截斷
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
        max_tokens: 4096
      })
    });

    // 若因特定模型不支援 json_object 或伺服器端驗證器失敗 (Failed to validate JSON)，自動降級為標準文字模式重試
    if (res.status === 400) {
      const errText = await res.text();
      const isJsonValidationError =
        errText.toLowerCase().includes('failed to validate json') ||
        errText.toLowerCase().includes('response_format') ||
        errText.toLowerCase().includes('json_object');

      if (isJsonValidationError) {
        console.warn('[Groq] 伺服器端 JSON 驗證未通過，自動降級為標準對話模式重試');
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            temperature: 0.2,
            max_tokens: 4096
          })
        });
      } else {
        throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, errText)}`);
      }
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq 呼叫失敗: ${parseApiError(res.status, err)}`);
    }

    const data = await res.json();
    rawJsonText = data.choices?.[0]?.message?.content || '';
  } else {
    // Gemini
    if (!settings.geminiKey.trim()) {
      throw new Error('未設定 Gemini API Key，請至右上角設定面板輸入。');
    }

    const rawModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
    const cleanModel = rawModel.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${settings.geminiKey.trim()}`;

    // 優先以 responseMimeType: 'application/json' 請求
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
          maxOutputTokens: 4096
        }
      })
    });

    // 若因特定舊模型不支援 responseMimeType 導致 400，自動降級重試
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
              maxOutputTokens: 4096
            }
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
    rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // 嘗試解析 JSON
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJsonText);
  } catch (e) {
    // 若模型包含 markdown 包裹，先剔除 ```json ... ```
    const match = rawJsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      parsedJson = JSON.parse(match[1]);
    } else {
      throw new Error(`AI 未返回有效的 JSON 格式：${rawJsonText.slice(0, 200)}...`);
    }
  }

  // 使用 Zod 進行嚴格 Schema 檢驗與補齊
  const validationResult = ArtistAnalysisResponseSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    console.error('Schema 驗證錯誤:', validationResult.error.format());
    throw new Error(`AI 資料結構不符合發燒友標準規範: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
  }

  return validationResult.data;
}
