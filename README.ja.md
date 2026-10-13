# 大音悉聲 · Pickup Artist (PUA)

<p align="center">
  <a href="README.md">繁體中文</a> | <a href="README.en.md">English</a> | <b>日本語</b>
</p>

<p align="center">
  <i>"Pick up sound, know the tone."</i><br>
  <b>街角で音を拾い、耳元で深く識る。</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square&color=E0A96D" alt="MIT License" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-crimson.svg?style=flat-square&color=FA383E" alt="Local First" />
  <img src="https://img.shields.io/badge/Framework-Svelte_5-orange.svg?style=flat-square" alt="Svelte 5" />
</p>

---

## 開発の背景と目的

「大音悉聲 (Pickup Artist)」は、オーディオファイルや音楽愛好家のために設計された、サーバーレス・ローカルファーストの個人向け音楽探信・音響文書（Dossier）作成ツールです。

- **瞬間的な記録**：通勤中や日常の中で偶然耳にした気になるアーティストを即座にメモ。
- **軽快な連携**：煩雑な操作を省き、ワンクリックで Apple Music の検索・再生へジャンプ。
- **AI 音響解析**：
  - **文脈に基づく推薦**：配信プラットフォームの画一的なアルゴリズムを超え、好みに合致する同系統の表現者を提案。
  - **深層プロファイル**：アーティストの軌跡、使用機材、音響質感、代表作を構造化して整理。

### 本ツールの存在意義
Apple Music などのストリーミングサービスは優れたハイレゾ・ロスレス音質を備えていますが、依然として課題があります：
- 推薦アルゴリズムが個々の細やかな音楽的嗜好に届きにくい。
- アプリの挙動が重く、気になった瞬間にすぐ記録・整理するのが難しい。

「大音悉聲」はストリーミングサービスの最高の相棒として、高速かつ純粋な個人向けアーカイブ体験を提供します。

---

## 命名の由来 (Naming Rationale)

### 中国語名：大音悉聲 (Dà Yīn Xī Shēng)
- **古典からの着想**：老子の「大音希聲（真に偉大なる音は静寂に近い）」から引用。
- **「希」から「悉（識る・尽くす）」へ**：
  - *深く識る*：聞き流すだけのストリーミングから一歩踏み込み、その制作背景や楽器構成を深く理解する。
  - *悉く集める*：街で出会った素晴らしい音を漏れなく個人アーカイブに収める。
- **気品**：東洋の静謐な美意識を宿し、高忠実度（Hi-Fi）な原音への敬意を表しています。

### 英語名：Pickup Artist (PUA)
- **ハードウェアのダブルミーニング**：Pickup（ピックアップ）はレコードのカートリッジやギターの弦振動を拾い上げる最重要部品。
- **行動のダブルミーニング**：街中でアーティストを「拾い（Pick up）」、机に戻ってからじっくりと深掘りする。
- **スラングの再解釈**：ネットスラング「PUA」を逆手に取り、純粋で静謐な音楽探求ツールとしてユーモラスに再定義。

---

## 設計思想とデザインシステム

1. **Acoustic Dossier デザインシステム**：
   - スタジオラック機材とアナログレコード盤から着想を得た漆黒テーマ。
   - 真空管アンバーゴールド (`#E0A96D`)、マスタークリムゾン (`#FA383E`)、チタングレー (`#8E9298`)。
   - オーディオ用フォント設計：`Noto Serif`、`Plus Jakarta Sans`、`JetBrains Mono`（等幅数字 `tnum`）。
2. **Local-First & サーバーレス**：
   - IndexedDB (Dexie.js) による高速読み書き（遅延 50ms 未満、完全オフライン対応）。
   - Google Drive の隠しアプリ専用領域 (`drive.appdata`) を用いた安全な複数端末同期。
3. **クライアントサイド BYOK AI エンジン**：
   - Groq および Google Gemini API Key をローカルにのみ保存。
   - モデル一覧を動的に取得し、言語環境に応じた詳細プロファイルを生成。

---

## 導入手順 (Getting Started)

### ローカル開発
```sh
npm install
npm run dev
```
ブラウザで `http://localhost:5173/` を開きます。

### 静的ビルド (Cloudflare Pages 等)
```sh
npm run build
```

---

## ライセンス (License)

本プロジェクトは [MIT License](LICENSE) のもとで公開されています。
