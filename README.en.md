# Pickup Artist (PUA) · 大音悉聲

<p align="center">
  <a href="README.md">繁體中文</a> | <b>English</b> | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <i>"Pick up sound, know the tone."</i><br>
  <b>Encounter in the streets, resonate in the ears.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square&color=E0A96D" alt="MIT License" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-crimson.svg?style=flat-square&color=FA383E" alt="Local First" />
  <img src="https://img.shields.io/badge/Framework-Svelte_5-orange.svg?style=flat-square" alt="Svelte 5" />
</p>

---

## Motivation & Vision

Pickup Artist (PUA) is an asymmetric, zero-backend personal music discovery and dossier tool engineered for audiophiles:

- **Effortless Capture**: Rapidly note down artists and bands encountered during daily life or street listening.
- **Instant Handoff**: Single-click search and jump straight into Apple Music without tedious manual navigation.
- **AI-Powered Discovery & Dossier**:
  - **Sonic Recommendations**: Surface stylistic lineages and hidden gems when streaming algorithms fall short.
  - **In-Depth Profiles**: Dissect artistic trajectories, signature gear, dynamic range (DR), and essential discography.

### Why Pickup Artist?
While streaming platforms such as Apple Music offer pristine Hi-Res Lossless quality, user experience friction remains:
- Algorithmic discovery often repeats familiar tracks and struggles to pinpoint niche personal tastes.
- Clunky navigation makes quick archival notes and retrospective crate-digging inconvenient.

"大音悉聲" serves as a dedicated companion—lightweight, instantaneous, and laser-focused on personal musical archiving.

---

## Naming Rationale

### Chinese: 大音悉聲 (Dà Yīn Xī Shēng)
- **Classical Reference**: Derived from Laozi's Daoist aphorism *"大音希聲"* (the greatest sound is subtle/silent).
- **Transformation to 悉 (Know / Comprehend)**:
  - *Familiarity*: Move beyond passive streaming background noise to truly understand an artist's context, personnel, and gear.
  - *Comprehensive*: Thoroughly collect and archive gems encountered along the journey.
- **Aesthetic Tone**: Retains classical dignity while paying homage to the sonic subtleties of Hi-Fi and master audio.

### English: Pickup Artist (PUA)
- **Hardware Metaphor**: *Pickup*, the magnetic cartridge of a turntable or electric guitar that converts physical vibration into pure signal.
- **Action Metaphor**: *Pick up an artist* on the fly with ultra-low latency; explore their dossier in detail back at your desk.
- **Playful Reclamation**: Reclaims the contemporary internet slang "PUA" into a focused, tranquil, and pure music exploration utility.

---

## Architectural Principles & Design System

1. **Acoustic Dossier Design System**:
   - Inspired by professional studio rack hardware and tactile vinyl pressings.
   - Studio dark palette: Vacuum Tube Amber (`#E0A96D`), Master Crimson (`#FA383E`), and Brushed Titanium (`#8E9298`).
   - Audiophile typography: `Noto Serif` (archival titles), `Plus Jakarta Sans` (interface), and `JetBrains Mono` (telemetry with tabular figures `tnum`).
2. **Local-First & Zero-Backend**:
   - Powered by IndexedDB via Dexie.js for sub-50ms writes with 100% offline capability.
   - Distributed cross-device sync operates via the user's personal Google Drive using the sandboxed `drive.appdata` scope.
3. **Client-Side BYOK AI Engine**:
   - Supports Groq and Google Gemini API keys stored strictly in local storage.
   - Dynamic model discovery fetching active models on key validation.

---

## Getting Started

### Local Development
```sh
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Static Production Build
```sh
npm run build
```

---

## License

This project is open-source under the [MIT License](LICENSE).
