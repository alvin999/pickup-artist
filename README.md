# 大音悉聲 · Pickup Artist (PUA)

<p align="center">
  <b>繁體中文</b> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <i>"Pick up sound, know the tone."</i><br>
  <b>在街頭偶遇拾音，於耳畔深入相悉。</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square&color=E0A96D" alt="MIT License" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-crimson.svg?style=flat-square&color=FA383E" alt="Local First" />
  <img src="https://img.shields.io/badge/Framework-Svelte_5-orange.svg?style=flat-square" alt="Svelte 5" />
</p>

---

## 專案緣起與初衷

本專案旨在打造一個專屬於個人的音樂人探索與智庫工具：

- **隨心記錄**：隨時記錄在通勤或日常中偶遇、喜愛的歌手與音樂人。
- **快速檢索**：省去繁複操作，日後可直接一鍵點擊快速查找、定位音樂人並跳轉 Apple Music。
- **AI 智慧賦能**：
  - **智慧推薦**：由 AI 根據風格流派與音樂品味，推薦相似氣質的音樂創作者。
  - **深度介紹**：由 AI 梳理歌手背景、創作脈絡、風格流變與經典作品。

### 為什麼需要這套工具？
現有的串流平台（如 Apple Music）雖然具備極佳的高傳真（Lossless / Hi-Fi）音質，但在使用體驗上仍存在痛點：
- 內建推薦演算法長年未見顯著突破，難以精準挖掘符合個人口味的新聲音。
- 官方介面瀏覽與搜尋反應遲緩、操作流程繁瑣，隨手記錄與回溯探索十分不便。

因此，「大音悉聲」作為串流服務的最佳搭檔，專注於輕量、極速的個人音樂探勘與收藏。

---

## 專案命名緣由 (Naming Rationale)

### 中文名稱：大音悉聲

- **典故化用**：改自《老子》「大音希聲」。原意指至美至純的聲音超越繁雜之聲、近乎無聲。
- **以「悉」易「希」**：
  - **熟悉 / 熟知**：不再只是聽過即忘的串流雜音，而是透過深度探索，真正「熟悉」音樂人背後的創作脈絡、風格流變與合作樂手。
  - **悉數 / 盡收**：在通勤或日常中偶遇的好聲音，皆能「悉數收錄」進專屬個人的音樂智庫。
- **氣韻**：保留東方古典審美的沉穩，象徵專注高傳真（Hi-Fi / Lossless）音質時對聲音細節的敬意。

### 英文名稱：Pickup Artist (PUA)

- **硬體雙關**：Pickup（拾音器），是黑膠唱頭、電吉他捕捉純粹聲學振動的核心零件，呼應發燒友對聲音源頭的探求。
- **行為雙關**：Pick up an artist——在手機端隨走隨記、順手「拾起」一位音樂人；回到電腦前戴上耳機，再透過 AI 深度解剖其音樂輪廓。
- **冷幽默解構**：借用當代網路黑話「PUA」的縮寫反差，將其去惡名化為一款專注、極簡且純粹的個人音樂探勘工具。

---

## 核心架構與設計哲學

1. **Acoustic Dossier 聲學設計系統**：
   - 靈感源自錄音室機架器材與黑膠實體唱片。
   - 採用真空管琥珀黃（`#E0A96D`）、母帶緋紅（`#FA383E`）與拉絲鈦灰（`#8E9298`）構成之暗色發燒級視覺。
   - 三合一專業字型：典藏標題 `Noto Serif TC`、主介面 `Plus Jakarta Sans`、儀表數值 `JetBrains Mono`。
2. **Local-First & 零伺服器 (Zero-Backend)**：
   - 使用 IndexedDB (Dexie.js) 本地儲存，讀寫延遲 $<50\text{ms}$，完全離線可用。
   - 雲端同步採用使用者自有的 Google Drive（限定 `drive.appdata` 隱藏目錄，保護隱私）。
3. **純前端攜帶金鑰 (BYOK AI Orchestration)**：
   - 支援 Groq 與 Google Gemini API，動態探勘可用模型，依據語言偏好生成結構化音樂學檔案。

---

## 開發與建置 (Development & Build)

### 本地開發環境
```sh
npm install
npm run dev
```
瀏覽器造訪 `http://localhost:5173/`。

### 靜態生產建置 (Cloudflare Pages)
```sh
npm run build
```

---

## 授權條款 (License)

本專案採用 [MIT License](LICENSE) 條款開源發布。
