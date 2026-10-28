<!--
  @component StudioFooter.svelte
  @description 音響器材機架微型規格銘牌 (Chassis Spec & Compliance Footnote)
  保持極致低調的音響工業美學，避免喧賓奪主，同時確保 Google 審查人員與爬蟲可完整讀取合規聲明。
-->
<footer class="mt-8 mb-4 pt-3 border-t border-wire/40 text-[10px] font-mono text-[#52565e] select-none">
  <div class="space-y-1.5 leading-relaxed">
    <!-- 主規格列 -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div class="flex flex-wrap items-center gap-x-2 text-[#717682]">
        <span class="font-bold tracking-wider text-[#8e94a0]">PICKUP ARTIST</span>
        <span class="text-[#363a42]">/</span>
        <span>Local-first Artist Knowledge & Music Curation Workstation</span>
        <span class="text-[#363a42]">/</span>
        <a
          href="/privacy"
          class="text-[#8e94a0] hover:text-signal transition-colors underline underline-offset-2"
        >
          Privacy Policy & Terms
        </a>
      </div>
      <div class="text-[9px] text-[#41454e]">
        REV: 2026.10 · INDEXEDDB LOCAL STORAGE
      </div>
    </div>

    <!-- 微型安規與合規註腳 (如同音響後面板 FCC/CE 認證標記，低調內斂) -->
    <div class="text-[9px] text-[#464a52] flex flex-wrap items-center gap-x-2 pt-0.5">
      <span>PURPOSE: Personal artist intelligence & music curation catalog.</span>
      <span class="text-[#2e323a]">|</span>
      <span>
        GOOGLE API & AI NCII: Uses <code class="text-[#606570]">drive.appdata</code> solely for JSON catalog backups. Strictly complies with Google APIs Terms of Service and does not use Google APIs for AI NCII (AI-generated Non-Consensual Intimate Imagery).
      </span>
    </div>
  </div>
</footer>
