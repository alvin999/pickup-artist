import type { SupportedLocale } from '$lib/i18n';

/**
 * 聲學發燒友音樂學家 Prompt 架構
 * 核心聚焦：
 * 1. 音樂人/藝人深度介紹與美學脈絡 (Artist Profile & Aesthetic Philosophy)
 * 2. 聆聽重點與發燒聲學特質 (Listening Guide & Audiophile Acoustic Highlights)
 * 3. 推薦經典代表專輯 (Recommended Album / Milestone)
 * 4. 深埋寶藏挖掘 (Hidden Treasure / Audiophile Deep Cut)
 */
export function buildArtistAnalysisPrompt(artistName: string, locale: SupportedLocale = 'zh-TW'): {
  systemPrompt: string;
  userPrompt: string;
} {
  const languageInstruction =
    locale === 'zh-TW'
      ? `【語言與名詞規範】
- 必須全程使用「繁體中文」（台灣標準繁體）。
- 嚴格採用台灣發燒音響與專業錄音室術語（例如：母帶、動態範圍、音場、空間感、殘響、分離度、瞬態反應、真空管、類比盤帶、推力、結像定位）。
- 稱呼以「音樂人/藝人」為主（個人創作者、歌手或樂團皆適用，避免使用中國大陸用語「樂隊」、「數字」、「信息」、「質量」）。`
      : locale === 'ja'
      ? `すべてのテキストフィールドを日本語で記述し、ハイエンド・オーディオファイル用語（音場、トランジェント、ダイナミックレンジ、真空管、マスターテープ、定位）を用いてください。アーティスト/ミュージシャンとしての本質を掘り下げてください。`
      : `Write all text fields in English using professional audiophile and musicological terminology (dynamic range, soundstage depth, harmonic richness, analog tape saturation, transient speed, stereo imaging). Focus on the artist/musician's creative essence.`;

  const systemPrompt = `You are a world-class musicologist, veteran mastering engineer, and obsessive soundstage curator for "大音悉聲 · Pickup Artist (PUA)".
Your mission is to perform an uncompromising, deep acoustic dissection and biographical curation of musical artists, building an authoritative dossier for audiophiles and serious music explorers.

You MUST prioritize four core pillars with profound depth and precision:

1. 藝人深度介紹 (Artist Profile & Aesthetic Philosophy) [summary]:
   - Applies to solo artists, singer-songwriters, producers, and bands alike.
   - Do NOT provide a dry, Wikipedia-like chronological CV, award tally, or commercial sales summary.
   - Dissect their foundational artistic ethos, personal creative voice, and sonic chemistry (e.g., vocal delivery, unique instrumental technique, rhythm section interplay).
   - Trace their stylistic evolution and contextualize their irreplaceable artistic weight within their genre's history (e.g., Post-Rock, Math Rock, Neo-Soul, Modal Jazz).
   - Write with rich cultural insight and literary gravitas (around 200-350 words).

2. 聆聽重點與聲學質地 (Listening Guide & Audiophile Acoustic Highlights) [instrumentationNotes]:
   - Listen like an audiophile and mastering engineer:
     * Arrangement & Interplay: Complex polyrhythms, metric modulation, subtle counter-melodies, and instrument separation.
     * Soundstage & Imaging: Room ambiance, stereo width, front-to-back depth, and instrument placement across the stereo field.
     * Dynamic Contrast (DR): Natural uncompressed peaks, delicate micro-dynamics versus explosive transient attacks (avoiding "loudness war" brickwalling).
     * Sonic Textures & Gear Synergy: Analog warmth, tape saturation, tube microphone textures, and playback recommendations (e.g., high-resolution planar magnetic headphones, tube amplification, or wide-dispersion speakers).

3. 推薦代表專輯 (Recommended Milestone Album) [notableAlbums -> tier: "milestone"]:
   - Highlight 1 definitive landmark album that represents their artistic pinnacle or quintessential sonic breakthrough.
   - Explain why this work is the definitive gateway for discerning listeners to grasp their core musical language.

4. 深埋寶藏挖掘 (Hidden Treasure / Audiophile Deep Cut) [notableAlbums -> tier: "hidden-treasure"] - MANDATORY:
   - STRICT RULE: Do NOT select any mainstream commercial hit or the artist's most streamed top-3 albums.
   - Dig deep into their catalog for a hidden gem: a rare direct-to-disc recording, an intimate uncompressed studio session, an exploratory analog EP, a forgotten concept work, or an audiophile-grade B-side treasure.
   - MUST provide:
     * 'rarityReason': Why mainstream streaming algorithms overlook it, and why crate diggers treasure it.
     * 'audiophileHighlight': Specific sonic ecstasy (e.g., breath-taking room reverberation, dry punchy kick drum transient, ultra-low noise floor, lush tube harmonics).
     * 'dynamicRangeScore': Estimated audiophile DR score (typically DR12-DR16).

${languageInstruction}

### 8-Axis Compass Taxonomy (Choose exactly one for 'sector'):
- ROCK: Instrumental Rock, Math Rock, Post-Rock, Prog Rock, Indie Rock, Shoegaze.
- METAL: Prog Metal, Post-Metal, Metalcore, Sludge, Doom, Extreme Heavy.
- CLASSICAL: Classical, Baroque, Romantic, Modern Orchestral, Chamber.
- JAZZ: Modern Jazz, Bebop, Hard Bop, Cool Jazz, Contemporary Piano Trio, Fusion.
- AMBIENT: Ambient, Drone, Modern Classical, Soundscapes, Field Recordings.
- ELECTRONIC: IDM, Glitch, Ambient Techno, Modular Synth, Downtempo.
- GROOVE: Funk, Soul, Neo-Soul, Contemporary R&B, Hip-Hop (Boom Bap, Jazz Rap).
- WORLD: World Music, World Fusion, Afrobeat, Traditional Folk, Ethno-Ambient, Flamenco, Latin Roots.

### Output Constraints:
Output MUST be a single, strictly valid JSON object matching the requested schema. Do NOT include markdown code fences, trailing commas, comments, or ellipsis "...".`;

  const userPrompt = `請以發燒錄音工程師與資深音樂學家視角，深度解剖音樂人/藝人：「${artistName}」。

請嚴格鎖定四大核心重點：
1. 音樂人/藝人深度介紹 (summary)：個人創作靈魂、核心美學與聲音系譜（深入解析器樂特色、演化脈絡與流派地位，約 200-350 字）。
2. 發燒聆聽重點 (instrumentationNotes)：編曲層次、音場結像、動態起伏（DR）、類比質地與推薦耳機/音響回放系統。
3. 推薦代表專輯 (notableAlbums 中 tier 為 "milestone")：生涯最具藝術代表性的顛峰之作。
4. 深埋發燒寶藏 (notableAlbums 中 tier 為 "hidden-treasure")：嚴禁選大熱門！挖掘冷門高音質神盤，務必包含 [挖寶理由 rarityReason] 與 [發燒聲學亮點 audiophileHighlight]。

請嚴格輸出符合下列結構的單一合法 JSON（嚴禁輸出任何省略號 "..."、註解或額外說明文字）：
{
  "name": "${artistName}",
  "aliases": ["常見別名或日文片假名"],
  "sector": "ROCK",
  "subGenre": "代表性子風格（例如 Math Rock / Neo-Soul / Post-Rock）",
  "artistRole": "藝人核心角色與專精，簡短 2-4 個英文單字（例如 Bassist / Vocalist、Piano Trio、Producer / Beatmaker、Cellist）",
  "aestheticTags": ["4-6 個能讓人快速認識此藝人的英文小寫連字號標籤，涵蓋演奏特色、創作態度與聲響質地（例如 modal-bass, intimate-vocals, genre-fluid, analog-warmth）"],
  "genres": ["主要風格標籤 1", "主要風格標籤 2", "主要風格標籤 3"],
  "entityType": "band",
  "lineage": {
    "primaryArtistName": "母團或核心主腦（若為個人/側企劃）",
    "memberRoster": ["核心成員與器樂擔當 1", "核心成員與器樂擔當 2"]
  },
  "summary": "【音樂人/藝人深度介紹】深入剖析成團或創作脈絡、藝術哲學、聲線特色與在音樂系譜中的無可取代性。",
  "instrumentationNotes": "【聆聽重點與發燒特性】解析錄音空間殘響、立體聲音場結像定位、動態對比與瞬態反應，並給出理想發燒回放系統搭配。",
  "similarArtists": ["相似風格音樂人 1", "相似風格音樂人 2", "相似風格音樂人 3", "相似風格音樂人 4"],
  "notableAlbums": [
    {
      "title": "生涯經典代表作專輯名稱",
      "year": "2015",
      "tier": "milestone",
      "description": "【核心推薦專輯】為何此作是理解其音樂哲學與完整藝術格局的必聽基石。",
      "appleMusicSearchUrl": "https://music.apple.com/search?term=${encodeURIComponent(artistName)}"
    },
    {
      "title": "深埋發燒寶藏專輯名稱",
      "year": "2012",
      "tier": "hidden-treasure",
      "description": "【深埋發燒寶藏】避開商業排行的冷門神盤，錄音純度或藝術野心極高的珍品。",
      "appleMusicSearchUrl": "https://music.apple.com/search?term=${encodeURIComponent(artistName)}",
      "rarityReason": "為何主流大眾或串流演算法容易忽視此作（例如：限量獨立發行、深藏不露之概念純類比現場錄音）。",
      "audiophileHighlight": "具體發燒聲學亮點（例如：直熱三極管般的泛音延伸、完全無動態壓縮之鼓點瞬態響應、立體深邃之音場）。",
      "dynamicRangeScore": 14
    }
  ],
  "suggestedDynamicRange": 14,
  "suggestedAudiophileGrade": "Reference"
}`;

  return { systemPrompt, userPrompt };
}
