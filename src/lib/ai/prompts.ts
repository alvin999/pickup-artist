import type { SupportedLocale } from '$lib/i18n';

export interface DisambiguationContext {
  albumTitle?: string;
  releaseYear?: string;
  genre?: string;
  description?: string;
}

/**
 * 人文音樂學家與藝術評論 Prompt 架構
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 
 * 1. 嚴禁負面約束 (No Negative Constraints)：
 *    - 禁止使用「嚴禁...」、「切勿...」、「不要...」、「避開...」等否定指令。
 *    - 原因：否定指令在 LLM 注意力機制中極易引發逆向聚焦（Pink Elephant Effect）或觸發對抗式過度對齊，
 *      進而破壞結構化輸出引導（Harness）與 JSON 語法約束。一律改用正面、清晰的目標指令。
 * 
 * 2. 嚴禁具體舉例 (No In-Prompt Examples)：
 *    - 禁止在 Prompt 與 Schema 欄位說明中使用具體內容舉例（如「如 Math Rock」、「如 TOKYO_JP」）。
 *    - 原因：具體範例會造成嚴重的「錨定偏誤 (Anchoring Bias / Over-indexing)」，使模型在 Harness 約束下
 *      將範例當成預設值照抄，導致不同藝人輸出多樣性崩潰。必須只提供抽象規則與型別格式定義。
 * 
 * 3. 聚焦人文深度與演奏美學，排除純音響器材指引：
 *    - 全面轉向創作哲學、時代文化隱喻、歌詞詩意與演奏手感質地，排除耳機音響硬體搭配與 DR 分數限制等發燒術語。
 * 
 * 4. 嚴控 Token 預扣以防範 429 TPM 限制：
 *    - 輸入 Context 精準控制在 ~600 Tokens 內，平滑維持 API 吞吐穩定度。
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
      ? `必須使用繁體中文（台灣標準繁體）與具備人文深度之音樂學筆觸，著重創作哲學、歌詞意境、時代隱喻、演奏手感質地、樂思對話與情感張力。稱呼以「音樂人/藝人」為主。`
      : locale === 'ja'
      ? `すべてのテキストを日本語で記述し、文学的・音楽学的な視点（創作哲学、歌詞の含意、演奏のニュアンス、対位法的な対話、精神性）を用いてください。`
      : `Write all text fields in English using profound musicological and humanistic critique, focusing on creative philosophy, lyrical subtext, performative nuance, expressive touch, and cultural resonance.`;

  const systemPrompt = `You are an insightful musicologist, cultural critic, and veteran music essayist for "Pickup Artist".
Dissect the musical artist into an authoritative JSON dossier focusing on artistic philosophy, performative mastery, and humanistic depth.

【語言規範】
${languageRules}

【8 軸大板塊 (sector - 必選其一)】
ROCK, METAL, CLASSICAL, JAZZ, AMBIENT, ELECTRONIC, GROOVE, WORLD.

【核心要求】
1. subGenre: 代表性二級風格子流派。
2. summary: 創作靈魂、精神核心、時代文化背景與生命哲學（約 150-250 字）。
3. instrumentationNotes: 【演奏特色與曲義精神】專注於演奏手感、樂器對位對話、留白美學與歌曲核心曲義哲思。
4. notableAlbums: 推薦 2 張代表性專輯：
   - tier "milestone": 生涯藝術精神巔峰代表作（理解其哲學的基石）。
   - tier "hidden-treasure": 具備深刻人文意境或獨特演奏神采之作（含 rarityReason 藝術堅持與背景、audiophileHighlight 演奏神髓或曲義精華）。
5. aliases: 客觀收錄該音樂人所有正式的多語異名（包含本國母語原生書寫表記、國際通用標準羅馬化表記、官方英文藝名或代表性稱號）。
6. Output MUST be a single strictly valid JSON object matching the requested keys without markdown fences.`;

  // 構造同名消歧義錨點提示
  let disambiguationNotice = '';
  if (context && (context.albumTitle || context.releaseYear || context.genre)) {
    const details = [
      context.albumTitle ? `代表作/專輯：《${context.albumTitle}》` : '',
      context.releaseYear ? `活躍/發行年代：${context.releaseYear}` : '',
      context.genre ? `主要領域/曲風：${context.genre}` : ''
    ].filter(Boolean).join('、');
    
    disambiguationNotice = `\n【同名排歧脈絡錨點】：\n目標藝人帶有以下背景特徵：${details}。\n請依此脈絡專注剖析該特定音樂人。\n`;
  }

  const userPrompt = `請深度剖析音樂人的人文精神與演奏美學：「${artistName}」${disambiguationNotice}
嚴格輸出符合下列結構的單一 JSON：
{
  "name": "${artistName}",
  "aliases": ["本國母語原生表記", "國際標準羅馬化表記", "官方英文藝名或代表性稱號"],
  "sector": "8 軸板塊選一：CLASSICAL | JAZZ | ROCK | METAL | AMBIENT | ELECTRONIC | GROOVE | WORLD",
  "subGenre": "代表性二級風格子流派",
  "originLocation": "發跡城市與國碼（格式：CITY_COUNTRYCODE）",
  "formedYear": "出道或成軍年份（四位數字）",
  "canonTier": "歷史地位選一：PIONEER | VIRTUOSO | CULT_CLASSIC | GENRE_DEFINING | STUDIO_ALCHEMIST | CONTEMPORARY",
  "formation": "實體演奏編制型態代碼",
  "artistRole": "核心角色與專精領域",
  "era": "代表年代或活躍時期",
  "aestheticTags": ["4-6 個英文小寫連字號風格美學標籤"],
  "genres": ["主要風格標籤 1", "風格標籤 2", "風格標籤 3"],
  "entityType": "身分選一：solo | band | side-project | supergroup",
  "lineage": {
    "primaryArtistName": "核心主腦或母團（選填）",
    "memberRoster": ["主要成員與擔當器樂"]
  },
  "summary": "【深度介紹】創作哲學、時代精神隱喻、文學詩性與生命脈絡（150-250 字）。",
  "instrumentationNotes": "【演奏特色與曲義精神】演奏手感質地、樂器對話與意境留白、代表曲目歌詞詩意或核心哲思。",
  "similarArtists": ["精神或美學相通的音樂人 1", "音樂人 2", "音樂人 3", "音樂人 4"],
  "notableAlbums": [
    {
      "title": "里程碑經典專輯名",
      "year": "年份",
      "tier": "milestone",
      "description": "理解其音樂哲學與精神核心的必備基石。"
    },
    {
      "title": "深埋私藏瑰寶專輯名",
      "year": "年份",
      "tier": "hidden-treasure",
      "description": "具備深厚人文意境或演奏神采之深刻作解析。",
      "rarityReason": "創作脈絡與藝術堅持背景說明。",
      "audiophileHighlight": "演奏神髓或曲義精華闡述。"
    }
  ]
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

  const systemPrompt = `You are an elite music curator and cultural soundscape researcher for "Pickup Artist".
Your task is to recommend 4 to 5 strictly distinct musical artists who share high artistic affinity, ethos, or performative texture with the target artist.

【規範要求】
1. ${languageRules}
2. 請推薦排除名單之外的全新音樂人。
3. 優先挖掘深具藝術價值、優質深刻且在相應風格領域中有高度美學共鳴的音樂人。
4. The output must strictly be a single valid JSON object containing only the "similarArtists" array key.`;

  const contextHints = [
    sector ? `核心領域：${sector}` : '',
    subGenre ? `代表子流派：${subGenre}` : ''
  ].filter(Boolean).join('、');

  // 取最多 40 個已存在名字做為排除名單，節省 Prompt Token
  const cleanExclude = Array.from(new Set(excludeList.map((n) => n.trim()).filter(Boolean))).slice(0, 40);
  const excludeText = cleanExclude.length > 0 ? `\n【已收錄或已推薦排除名單】：\n${cleanExclude.join('、')}\n` : '';

  const userPrompt = `Provide 4 to 5 artistic and stylistic kindred artists for "${artistName}"${contextHints ? ` (${contextHints})` : ''}.${excludeText}
Respond in valid JSON format:
{
  "similarArtists": ["Artist 1", "Artist 2", "Artist 3", "Artist 4"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 推薦更多代表盤與深刻寶藏專用 Prompt
 * 
 * 設計意圖與架構決策 (Why & Design Trade-offs)：
 * 1. 注入既有已收錄專輯（excludeAlbums），確保 AI 挖掘該藝人生涯中其他未收錄的藝術精品或私藏代表作。
 * 2. 嚴禁負面約束與具體範例，全數採用正向規則與格式抽象定義，確保 Harness 穩定。
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
      ? `請以繁體中文撰寫說明、創作背景與演奏曲義精華；專輯名稱請維持其官方原始發行名稱。`
      : locale === 'ja'
      ? `解説・創作背景・演奏特性は日本語で記述し、アルバム名は公式表記を維持してください。`
      : `Write descriptions and performance highlights in English; maintain official album titles.`;

  const systemPrompt = `You are an insightful music discography archivist and researcher for "Pickup Artist (大音悉聲)".
Your mission is to explore and recommend 2 to 3 ADDITIONAL standout albums for the artist "${artistName}".

【雙軌唱片推薦標準】
1. 【時代基石 (milestone)】：定義其音樂生涯分水嶺、精神核心或代表性經典之作。
2. 【深埋寶藏 (hidden-treasure)】：挖掘具備深刻人文意境、演奏神采或深刻探索性的代表作。
3. ${languageRules}
4. 請推薦已收錄清單以外的全新作品。
5. 必須嚴格輸出合法的單一 JSON 物件，包含 "notableAlbums" 陣列。`;

  const contextHints = [
    sector ? `核心領域：${sector}` : '',
    subGenre ? `代表子流派：${subGenre}` : ''
  ].filter(Boolean).join('、');

  const cleanExclude = Array.from(new Set(excludeAlbums.map((t) => t.trim()).filter(Boolean))).slice(0, 30);
  const excludeText = cleanExclude.length > 0 ? `\n【已收錄專輯清單】：\n${cleanExclude.join('、')}\n` : '';

  const userPrompt = `Explore 2 to 3 additional notable albums or treasure records for "${artistName}"${contextHints ? ` (${contextHints})` : ''}.${excludeText}
Output format strictly matching:
{
  "notableAlbums": [
    {
      "title": "Album Title",
      "year": "年份",
      "tier": "milestone",
      "description": "簡明評述該作品之藝術成就與精神核心"
    },
    {
      "title": "Hidden Gem Album Title",
      "year": "年份",
      "tier": "hidden-treasure",
      "description": "深刻藝術價值之作品解說",
      "rarityReason": "創作脈絡與藝術堅持背景說明",
      "audiophileHighlight": "演奏神髓或曲義精華闡述"
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 構建「人文聽感共鳴分析 (Listening Resonance)」Prompt
 * 
 * 設計意圖 (Why & Philosophy):
 * 1. 人文感優先：摒除冷硬發燒測試術語，專注於心境共振、時代氛圍與生活情境。
 * 2. 降低手寫負擔：將使用者隨意記下的片語或關鍵字，轉化為具文學質感的短手札。
 * 3. 點選化推薦：自動推薦 1-3 首契合心境的曲目與 2-4 個人文標籤，便於一鍵帶入。
 */
export function buildListeningResonancePrompt(
  artistName: string,
  userNotes: string,
  availableAlbums: string[] = [],
  locale: SupportedLocale = 'zh-TW'
): { systemPrompt: string; userPrompt: string } {
  const languageRules =
    locale === 'zh-TW'
      ? `請以繁體中文撰寫感言潤飾與推薦理由；歌名請維持原發行名稱。`
      : locale === 'ja'
      ? `日本語で情緒的な所感を記述し、曲名は公式表記を維持してください。`
      : `Write thoughtful reflections in English; maintain official track names.`;

  const systemPrompt = `You are a sensitive and poetic music essayist and curator for "Pickup Artist (大音悉聲)".
Your mission is to help a listener articulate their emotional connection with the music of "${artistName}".

【人文美學與情感共振引領 (Positive Affirmative Guidance)】
1. 深度同理與專屬呼應：將使用者描繪的每一處情緒、感官印記（如雨夜微涼、城市漫步、舊日時光或某段器樂音色）視為手札的靈魂，以真摯細膩的文筆將其昇華，展現專屬而深刻的心靈對話。
2. 純粹文學與生活語境：聚焦於文字的呼吸感、詩意留白、情感撫慰與生活當下的共振。
3. 契合選曲：精選與該心境特質最為呼應相通的代表曲目與氛圍標籤。
4. ${languageRules}
5. 請直接輸出標準結構的單一 JSON 物件。`;

  const albumsHint = availableAlbums.length > 0
    ? `\n該藝人代表專輯參考：${availableAlbums.join('、')}`
    : '';

  const notesHint = userNotes.trim().length > 0
    ? `【使用者真摯寫下的聽感與心境印記】：\n「${userNotes.trim()}」\n請全然融入上述使用者的真實心境，提煉極富共鳴的文學題詞、感言潤飾與心靈契合曲目。`
    : `使用者交由你引領共鳴，請以「${artistName}」最核心的靈魂特質與情感底蘊出發，為深夜或日常聆聽寫下一段優美深邃的導讀手札。`;

  const userPrompt = `請為音樂人「${artistName}」提煉人文聽感共鳴與心境選曲：${albumsHint}
${notesHint}

請輸出符合下列嚴格 JSON 格式：
{
  "userEchoQuote": "提煉使用者心境的簡短共鳴金句（約 15-25 字，例如：雨夜獨處時，被那段延遲吉他切開了思緒）",
  "enhancedNote": "精煉的人文聽感隨筆（約 60-120 字，文字優雅溫潤，深刻呼應並昇華使用者的感觸）",
  "recommendedTracks": ["代表曲1", "代表曲2"],
  "moodTags": ["雨天沉思", "深夜獨處", "詩意吉他"],
  "suggestedScene": "night-solitude"
}
(備註：suggestedScene 僅限從 headphone, speaker, on-the-go, night-solitude 中擇一)`;

  return { systemPrompt, userPrompt };
}

