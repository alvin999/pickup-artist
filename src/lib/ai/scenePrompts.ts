import type { SupportedLocale } from '$lib/i18n';
import { sanitizePromptInput } from './prompts';

export interface SceneChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExternalArtistRecommendation {
  name: string;
  subGenre: string;
  recommendReason: string;
  curationHighlight?: string;
}

export interface SceneRecommendationResult {
  reply: string;
  matchedGenres: string[];
  externalArtists: ExternalArtistRecommendation[];
  contextMemory?: string;
}

/**
 * 智慧推薦情境對話 Prompt 生成器
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 
 * 1. 嚴禁具體舉例 (No In-Prompt Examples)：
 *    - 嚴禁在 System Prompt 與 Schema 中出現具體的藝人、曲名、或生活情境舉例。
 *    - 原因：具體範例會直接觸發 LLM 的「錨定偏誤 (Anchoring Bias)」，導致模型無法客觀廣泛地理解使用者的冷門小眾需求。
 * 
 * 2. 嚴禁負面約束 (No Negative Constraints)：
 *    - 採用正面引導指令，維持 Attention 分布對稱，防止 JSON 結構破碎。
 * 
 * 3. 雙軌輸出：
 *    - matchedGenres: 提供標準化風格標籤供本地庫比對。
 *    - externalArtists: 自主聯想推薦庫外優質音樂人。
 */
export function buildSceneAdvisorPrompt(
  conversationHistory: SceneChatMessage[],
  locale: SupportedLocale = 'zh-TW',
  existingMemory?: string
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const languageRule =
    locale === 'zh-TW'
      ? '全部使用正體/繁體中文（台灣習慣用語）輸出，音樂評論筆觸需具備人文關懷與聲學理解。稱呼一律使用「音樂人/藝人」。'
      : locale === 'ja'
      ? 'すべての解説テキストを日本語で記述してください。'
      : 'Write all explanatory critique in English with artistic precision.';

  const safeExistingMemory = sanitizePromptInput(existingMemory, 600, true);
  // 第 3 輪起（含 5 則以上訊息）或已有濃縮記憶時，引導模型同步維護滾動記憶，使長對話 Token 維持在安全上限內
  const shouldMaintainMemory = Boolean(safeExistingMemory) || conversationHistory.length >= 5;

  const memoryTaskRule = shouldMaintainMemory
    ? `\n5. 同步精煉更新 "contextMemory"（約 80 至 150 字）：將先前的脈絡記憶與近期對話的重點（使用者偏好的聆聽情境、節奏動態、情感基調與已推薦過的音樂人方向）濃縮為簡潔客觀的摘要，供後續輪次延續使用。`
    : '';

  const memoryJsonField = shouldMaintainMemory
    ? `,\n  "contextMemory": "濃縮歸納目前所有對話脈絡與聆聽偏好的精簡摘要"`
    : '';

  const systemPrompt = `You are an expert musicologist and acoustic curator for "Pickup Artist".
Your mission is to understand the user's ongoing listening state, physiological context, or acoustic atmosphere from the conversational dialogue, and curate a refined musical response.

【語言規範】
${languageRule}

【任務要求】
1. 分析使用者描述的當前聆聽意圖、節奏動態需求、心智專注度或情感氛圍。
2. 提煉出 3 至 6 個國際通用標準音樂風格或子流派英文標籤（用於資料庫檢索比對）。
3. 推薦 3 至 5 位契合該情境的代表性音樂人（不限於主流，注重藝術精神與聲學質地）。
4. 以人文音樂學筆調撰寫一段親切、簡練的對話回覆（約 60 至 120 字）。${memoryTaskRule}

【嚴格輸出格式 (Strict JSON Object Only)】
請直接輸出合法的 JSON 物件，不包含 Markdown 標記或額外閒聊，結構如下：
{
  "reply": "對話回覆文字",
  "matchedGenres": ["風格標籤1", "風格標籤2", "風格標籤3"],
  "externalArtists": [
    {
      "name": "音樂人正式名稱",
      "subGenre": "核心代表子流派",
      "recommendReason": "推薦原因與適配此情境之理由",
      "curationHighlight": "特色樂器配置或聲學聽感亮點"
    }
  ]${memoryJsonField}
}`;

  // 若已有濃縮記憶，僅需攜帶最近 4 則原文（約 2 輪），將總輸入 Token 穩定收斂；初期則保留最近 6 則
  const windowSize = safeExistingMemory ? 4 : 6;
  const recentHistory = conversationHistory.slice(-windowSize);
  const historyText = recentHistory
    .map((msg) => {
      const safeContent = sanitizePromptInput(msg.content, 800, true);
      return `${msg.role === 'user' ? 'User' : 'Curator'}: ${safeContent}`;
    })
    .join('\n\n');

  const memoryBlock = safeExistingMemory
    ? `【先前對話脈絡記憶】：\n${safeExistingMemory}\n\n`
    : '';

  const userPrompt = `${memoryBlock}以下是我們近期的對話脈絡：\n\n${historyText}\n\n請以音樂策展人身分，結合上述脈絡給出最新一輪的分析與推薦結果 (JSON)。`;

  return { systemPrompt, userPrompt };
}
