export type SupportedLocale = 'zh-TW' | 'en' | 'ja';

export const translations = {
  'zh-TW': {
    // 專案品牌與副標
    app_title: '大音悉聲',
    app_subtitle: 'Pickup Artist',
    app_tagline: '在街頭偶遇拾音，於耳畔深入相悉',
    
    // 拾音與快速輸入
    pickup_placeholder: '拾取音樂人、樂團或貼入 Apple Music 連結...',
    pickup_button: '知悉',
    pickup_shortcut_hint: '按 Enter 立即存入本地機架',
    pickup_success_toast: '已存入本地 IndexedDB，等待背景同步',
    pickup_empty_warn: '請輸入音樂人名稱或連結',
    
    // 狀態與過濾
    status_inbox: '待解剖',
    status_analyzed: '已建檔',
    tab_all: '全庫收錄',
    tab_inbox: '知悉收件匣',
    tab_analyzed: '發燒友智庫',
    search_placeholder: '搜尋音樂人、風格流派或別名...',

    // 聲學指標與格式標籤
    spec_hires: 'Hi-Res 24/96',
    spec_lossless: 'Lossless',
    spec_dr: '動態範疇',
    spec_vinyl: '黑膠母帶',
    
    // 操作按鈕
    action_open_apple_music: '在 Apple Music 開啟',
    action_analyze_ai: 'AI 深度解剖',
    action_analyzing: '聲學解剖中...',
    action_delete: '移出機架',
    action_settings: '系統設定',
    action_sync: '雲端同步',
    
    // 詳情抽屜
    dossier_biography: '聲響演進與創作脈絡',
    dossier_albums: '經典代表專輯',
    dossier_acoustics: '配器與錄音室質地',
    dossier_similar: '相似風格系譜',
    dossier_personal_notes: '私藏聆聽筆記',
    dossier_notes_placeholder: '記錄器材搭配、聆聽耳機或當下心境...',
    dossier_not_analyzed: '尚未進行 AI 深度解剖。點擊按鈕探索其創作風格與聲學特徵。',
    
    // 系統狀態
    status_local_first: 'LOCAL-FIRST // 本地運作中',
    status_sync_idle: '雲端待命',
    status_sync_syncing: '同步傳輸中',
    status_sync_success: '同步完成',
    status_storage_quota: '本地快取配額',
    
    // 語言切換
    lang_zh: '繁中',
    lang_en: 'EN',
    lang_ja: '日本語',
    language_select: '切換語言'
  },
  'en': {
    app_title: 'Pickup Artist',
    app_subtitle: 'Acoustic Dossier',
    app_tagline: 'Pick up sound, know the tone.',
    
    pickup_placeholder: 'Pick up artist, band name, or paste Apple Music link...',
    pickup_button: 'Pick Up',
    pickup_shortcut_hint: 'Press Enter to commit to local chassis',
    pickup_success_toast: 'Saved to local IndexedDB, queued for sync',
    pickup_empty_warn: 'Please enter an artist name or link',
    
    status_inbox: 'INBOX',
    status_analyzed: 'ANALYZED',
    tab_all: 'All Crates',
    tab_inbox: 'Fast Inbox',
    tab_analyzed: 'Dossier Vault',
    search_placeholder: 'Search artists, genres, or aliases...',

    spec_hires: 'Hi-Res 24/96',
    spec_lossless: 'Lossless',
    spec_dr: 'Dynamic Range',
    spec_vinyl: 'Vinyl Matrix',
    
    action_open_apple_music: 'Open in Apple Music',
    action_analyze_ai: 'AI Sonic Analysis',
    action_analyzing: 'Dissecting...',
    action_delete: 'Eject Entry',
    action_settings: 'Settings',
    action_sync: 'Sync Vault',
    
    dossier_biography: 'Sound Signature & Evolution',
    dossier_albums: 'Notable Discography',
    dossier_acoustics: 'Instrumentation & Texture',
    dossier_similar: 'Related Lineage',
    dossier_personal_notes: 'Listening Journal',
    dossier_notes_placeholder: 'Log gear pairing, headphone tone, or impressions...',
    dossier_not_analyzed: 'Not analyzed yet. Run AI Sonic Analysis to uncover artistic lineage.',
    
    status_local_first: 'LOCAL-FIRST // STANDALONE',
    status_sync_idle: 'Cloud Standby',
    status_sync_syncing: 'Syncing',
    status_sync_success: 'Vault Synced',
    status_storage_quota: 'Local Quota',
    
    lang_zh: '繁中',
    lang_en: 'EN',
    lang_ja: '日本語',
    language_select: 'Language'
  },
  'ja': {
    app_title: '大音悉聲',
    app_subtitle: 'Pickup Artist',
    app_tagline: '街角で音を拾い、耳元で深く識る。',
    
    pickup_placeholder: 'アーティスト名、バンド名、またはApple Musicリンク...',
    pickup_button: '拾音',
    pickup_shortcut_hint: 'Enterでローカルラックに保存',
    pickup_success_toast: 'IndexedDBに保存完了、同期待ち',
    pickup_empty_warn: 'アーティスト名またはリンクを入力してください',
    
    status_inbox: '未解析',
    status_analyzed: '文書化済',
    tab_all: '全アーカイブ',
    tab_inbox: '受信トレイ',
    tab_analyzed: '音響文書録',
    search_placeholder: 'アーティスト、ジャンル、別名を検索...',

    spec_hires: 'Hi-Res 24/96',
    spec_lossless: 'ロスレス',
    spec_dr: 'ダイナミックレンジ',
    spec_vinyl: 'アナログ原盤',
    
    action_open_apple_music: 'Apple Musicで開く',
    action_analyze_ai: 'AI音響解析',
    action_analyzing: '音響解析中...',
    action_delete: 'ラックから除外',
    action_settings: '環境設定',
    action_sync: 'クラウド同期',
    
    dossier_biography: '音響の変遷と創作の軌跡',
    dossier_albums: '代表的アルバム群',
    dossier_acoustics: '楽器構成とスタジオ質感',
    dossier_similar: '関連アーティスト系譜',
    dossier_personal_notes: '試聴ノート',
    dossier_notes_placeholder: '使用機材、ヘッドホン、試聴時の印象など...',
    dossier_not_analyzed: '未解析です。AI音響解析を実行して音楽的系譜を紐解きます。',
    
    status_local_first: 'LOCAL-FIRST // スタンドアロン',
    status_sync_idle: '待機中',
    status_sync_syncing: '同期通信中',
    status_sync_success: '同期完了',
    status_storage_quota: 'ローカル使用量',
    
    lang_zh: '繁中',
    lang_en: 'EN',
    lang_ja: '日本語',
    language_select: '言語切替'
  }
} as const;

export type TranslationKey = keyof typeof translations['zh-TW'];
