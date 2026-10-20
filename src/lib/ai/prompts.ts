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

/**
 * 推薦更多相似藝人專用 Prompt（極度精簡，極低 Token 消耗）
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 注入排除名單（Exclude List）：包含使用者檔案庫既有藝人與當前已推薦名單，要求 AI 絕不重複推薦。
 * 2. 精準鎖定音樂人聲學特質與子流派（Sector / SubGenre），推薦 4~5 位未被主流演算法淹沒的相似音樂人。
 * 3. 輸出極簡 JSON，僅包含 `similarArtists: string[]`，單次 Prompt + Completion 不超過 150 Tokens，徹底杜絕 429 TPM 限制。
 */
export function buildMoreSimilarArtistsPrompt(
  artistName: string,
  sector?: string,
  subGenre?: string,
  excludeList: string[] = [],
  locale: SupportedLocale = 'zh-TW'
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const languageRules =
    locale === 'zh-TW'
      ? `請以繁體中文或該音樂人的通用官方藝名輸出。`
      : locale === 'ja'
      ? `日本の音楽メディアでの標準的な表記または公式アーティスト名で出力してください。`
      : `Output using official artist names in English or their primary regional name.`;

  const systemPrompt = `You are an elite music curator and acoustic soundscape researcher for "Pickup Artist".
Your task is to recommend 4 to 5 strictly distinct musical artists who share high acoustic affinity, artistic ethos, or sonic texture with the target artist.

【規範與限制】
1. ${languageRules}
2. 絕對禁止推薦「已排除名單」中的任何音樂人。
3. 優先挖掘深具藝術價值、冷門優質或在相同樂派/子流派（如 Post-Rock, Math Rock, Modal Jazz, Neo-Soul）中有高度美學共鳴的音樂人。
4. The output must strictly be a single valid JSON object containing only the "similarArtists" array key. Do not output any preamble, commentary, or markdown text.`;

  const contextHints = [
    sector ? `核心領域：${sector}` : '',
    subGenre ? `代表子流派：${subGenre}` : ''
  ].filter(Boolean).join('、');

  // 取最多 40 個已存在名字做為排除名單，節省 Prompt Token
  const cleanExclude = Array.from(new Set(excludeList.map((n) => n.trim()).filter(Boolean))).slice(0, 40);
  const excludeText = cleanExclude.length > 0 ? `\n【已收錄或已推薦排除名單（嚴禁重複推薦）】：\n${cleanExclude.join('、')}\n` : '';

  const userPrompt = `Provide 4 to 5 acoustic and stylistic kindred artists for "${artistName}"${contextHints ? ` (${contextHints})` : ''}.${excludeText}
Respond in valid JSON format:
{
  "similarArtists": ["Artist 1", "Artist 2", "Artist 3", "Artist 4"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 推薦更多代表盤與深埋寶藏專用 Prompt
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 注入既有已收錄專輯（excludeAlbums），確保 AI 挖掘該藝人生涯中其他未收錄的精品盤、現場名盤或稀有寶藏。
 * 2. 產出 2~3 張具備發燒聲學價值之專輯，嚴格包含 title, year, tier, description, rarityReason, audiophileHighlight, dynamicRangeScore。
 * 3. 純 JSON 輸出，維持低 Token 消耗與高解析穩定性。
 */
export function buildMoreNotableAlbumsPrompt(
  artistName: string,
  sector?: string,
  subGenre?: string,
  excludeAlbums: string[] = [],
  locale: SupportedLocale = 'zh-TW'
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const languageRules =
    locale === 'zh-TW'
      ? `請以繁體中文撰寫說明、挖寶理由與聲學亮點；專輯名稱請維持其官方原始發行名稱（通常為英文、日文或原文）。`
      : locale === 'ja'
      ? `解説・発掘理由・音響特性は日本語で記述し、アルバム名は公式表記を維持してください。`
      : `Write descriptions and audiophile highlights in English; maintain official album titles.`;

  const systemPrompt = `You are a world-class audiophile discography archivist and acoustic researcher for "Pickup Artist (大音悉聲)".
Your mission is to explore and recommend 2 to 3 ADDITIONAL standout albums for the artist "${artistName}".

【發燒友雙軌唱片挖掘標準】
1. 【時代基石 (milestone)】：定義其音樂生涯分水嶺、風格演變核心或代表性經典長篇。
2. 【深埋寶藏 (hidden-treasure)】：避開主流爛大街的商業暢銷曲，挖掘錄音品質極佳、動態範疇廣、不插電原木共振、或冷門精絕的現場/再版盤。
3. ${languageRules}
4. 絕對嚴禁推薦「已收錄排除清單」中的任何專輯名稱！
5. 必須嚴格輸出合法的單一 JSON 物件，包含 "notableAlbums" 陣列。禁止輸出任何 markdown 代碼框外的贅詞。`;

  const contextHints = [
    sector ? `核心領域：${sector}` : '',
    subGenre ? `代表子流派：${subGenre}` : ''
  ].filter(Boolean).join('、');

  const cleanExclude = Array.from(new Set(excludeAlbums.map((t) => t.trim()).filter(Boolean))).slice(0, 30);
  const excludeText = cleanExclude.length > 0 ? `\n【已收錄專輯排除名單（嚴禁重複推薦）】：\n${cleanExclude.join('、')}\n` : '';

  const userPrompt = `Explore 2 to 3 additional notable albums or hidden treasure records for "${artistName}"${contextHints ? ` (${contextHints})` : ''}.${excludeText}
Output format strictly matching:
{
  "notableAlbums": [
    {
      "title": "Album Title",
      "year": "2018",
      "tier": "milestone",
      "losslessSpec": "96kHz 24bit ALAC",
      "description": "簡明評述該作品之藝術成就與聽感特徵",
      "dynamicRangeScore": 13
    },
    {
      "title": "Hidden Gem Album Title",
      "year": "2015",
      "tier": "hidden-treasure",
      "losslessSpec": "192kHz 24bit FLAC",
      "description": "冷門但聲學質地極高之作品解說",
      "rarityReason": "挖寶理由 (如：獨立廠牌限量壓片、罕見現場錄音)",
      "audiophileHighlight": "聲學亮點 (如：鼓擊動態無壓縮、原木微動態透明度高)",
      "dynamicRangeScore": 14
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}
