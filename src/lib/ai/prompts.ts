import type { SupportedLocale } from '$lib/i18n';

export interface DisambiguationContext {
  albumTitle?: string;
  releaseYear?: string;
  genre?: string;
  description?: string;
}

/**
 * 聲學發燒友音樂學家 Prompt 架構（精簡去重版）
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 嚴控 Token 預扣以根絕 Groq / OpenAI 的 429 TPM（Tokens Per Minute）限額報錯：
 *    原先 Prompt 中英雙語繁複贅述，使單次 Requested Tokens 飆破 6,200（直逼 8,000 TPM 限額）。
 *    此版本將重複規則合而為一，消除三度重複的欄位說明，將輸入 Context 壓降至 ~600 Tokens。
 * 2. 注入「同名藝人消歧義錨點 (Disambiguation Context)」：
 *    讓 AI 精確鎖定特定世代、領域或代表作的藝人，徹底解決同名盲猜誤判問題。
 * 3. 完整保留星系二級晶片所依賴之 'sector' 與 'subGenre'，確保蜂巢星系圖拓撲聚類不受影響。
 * 4. 移除由前端自行生成即可之 'appleMusicSearchUrl'，避免消耗生成 Token。
 */
export function buildArtistAnalysisPrompt(
  artistName: string,
  locale: SupportedLocale = 'zh-TW',
  context?: DisambiguationContext
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const languageRules =
    locale === 'zh-TW'
      ? `必須使用繁體中文（台灣標準繁體）與專業發燒音響術語（母帶、動態範圍、音場、空間感、殘響、分離度、瞬態反應、真空管、類比盤帶、推力、結像定位）。稱呼以「音樂人/藝人」為主。`
      : locale === 'ja'
      ? `すべてのテキストを日本語で記述し、ハイエンド・オーディオファイル用語（音場、トランジェント、ダイナミックレンジ、真空管、マスターテープ、定位）を用いてください。`
      : `Write all text fields in English using professional audiophile terminology (dynamic range, soundstage depth, harmonic richness, transient speed, stereo imaging).`;

  const systemPrompt = `You are a world-class musicologist and veteran mastering engineer for "Pickup Artist".
Dissect the musical artist into an authoritative JSON dossier for audiophiles and music explorers.

【語言規範】
${languageRules}

【8 軸大板塊 (sector - 必選其一)】
ROCK, METAL, CLASSICAL, JAZZ, AMBIENT, ELECTRONIC, GROOVE, WORLD.

【核心要求】
1. subGenre: 唯一代表性二級子流派（如 Math Rock, Post-Rock, Neo-Soul, Modal Jazz, Ambient Folk，用以聚類星系）。
2. summary: 個人創作靈魂、聲音系譜、演化脈絡與無可取代性（約 150-250 字）。
3. instrumentationNotes: 編曲層次、立體聲音場結像、動態對比（DR）、類比錄音質地與推薦耳機/音響回放系統。
4. notableAlbums: 推薦 2 張專輯：
   - tier "milestone": 生涯藝術顛峰代表作。
   - tier "hidden-treasure": 冷門高音質神盤（嚴禁大熱門，須含 rarityReason 挖寶理由、audiophileHighlight 聲學亮點、dynamicRangeScore 12-16）。
5. Output MUST be a single strictly valid JSON object matching the requested keys without markdown fences.`;

  // 構造同名消歧義錨點提示
  let disambiguationNotice = '';
  if (context && (context.albumTitle || context.releaseYear || context.genre)) {
    const details = [
      context.albumTitle ? `代表作/專輯：《${context.albumTitle}》` : '',
      context.releaseYear ? `活躍/發行年代：${context.releaseYear}` : '',
      context.genre ? `主要領域/曲風：${context.genre}` : ''
    ].filter(Boolean).join('、');
    
    disambiguationNotice = `\n【同名排歧脈絡錨點（極重要）】：\n目標藝人帶有以下背景特徵：${details}。\n請嚴格鎖定此特定音樂人進行分析，切勿混淆為其他同名藝人！\n`;
  }

  const userPrompt = `請深度解剖音樂人：「${artistName}」${disambiguationNotice}
嚴格輸出符合下列結構的單一 JSON：
{
  "name": "${artistName}",
  "aliases": [],
  "sector": "ROCK",
  "subGenre": "代表性二級子流派",
  "artistRole": "核心角色與專精（如 Bassist / Vocalist、Piano Trio、Producer）",
  "aestheticTags": ["4-6 個英文小寫連字號美學標籤，如 analog-warmth, lo-fi, math-groove"],
  "genres": ["主要風格標籤 1", "風格標籤 2", "風格標籤 3"],
  "entityType": "band",
  "lineage": {
    "primaryArtistName": "核心主腦或母團（選填）",
    "memberRoster": ["主要成員與擔當器樂"]
  },
  "summary": "【深度介紹】創作靈魂、聲線與器樂特質、系譜演進（150-250 字）。",
  "instrumentationNotes": "【聆聽重點】音場深度、結像定位、動態對比（DR）與推薦音響設備搭配。",
  "similarArtists": ["相似風格音樂人 1", "相似音樂人 2", "相似音樂人 3", "相似音樂人 4"],
  "notableAlbums": [
    {
      "title": "里程碑經典專輯名",
      "year": "年份",
      "tier": "milestone",
      "description": "為何此作是理解其音樂哲學的必聽基石。"
    },
    {
      "title": "深埋發燒寶藏專輯名",
      "year": "年份",
      "tier": "hidden-treasure",
      "description": "避開商業排行的冷門神盤解析。",
      "rarityReason": "為何主流演算法忽視（如獨立限量盤、概念現場錄音）。",
      "audiophileHighlight": "具體聲學亮點（如無壓縮自然動態、原木共振、真空管泛音）。",
      "dynamicRangeScore": 14
    }
  ],
  "suggestedDynamicRange": 14,
  "suggestedAudiophileGrade": "Reference"
}`;

  return { systemPrompt, userPrompt };
}
