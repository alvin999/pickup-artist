<script lang="ts">
  import { ArrowLeft, ShieldCheck, Database, Cloud, FileText, CheckCircle2 } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
</script>

<svelte:head>
  <title>{t('privacy_head_title')}</title>
  <meta name="description" content={t('privacy_head_desc')} />
</svelte:head>

<div class="min-h-screen bg-[#050505] text-[#f4f4f6] font-sans antialiased selection:bg-[#ff2a3c] selection:text-white">
  <!-- 頂部導覽列 -->
  <header class="sticky top-0 z-50 bg-[#08090a]/90 backdrop-blur border-b border-[#1f2228] px-4 sm:px-8 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <img src="/logo-120x120.png" alt="Pickup Artist Logo" class="w-7 h-7 rounded border border-[#2b2f38]" />
      <div>
        <h1 class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
          <span>{t('privacy_brand_title')}</span>
          <span class="text-[10px] font-mono text-[#ff2a3c] px-1.5 py-0.5 rounded bg-[#ff2a3c]/10 border border-[#ff2a3c]/30">LEGAL</span>
        </h1>
        <p class="text-[10px] font-mono text-[#717684]">PRIVACY POLICY & TERMS OF SERVICE</p>
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      <LanguageToggle />
      <a
        href="/"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-[#14161b] hover:bg-[#ff2a3c] text-[#a0a5b2] hover:text-white border border-[#262a34] hover:border-[#ff2a3c] rounded text-xs font-mono font-medium transition-all cursor-pointer shadow-sm"
      >
        <ArrowLeft class="w-3.5 h-3.5" />
        <span>{t('privacy_back_studio')}</span>
      </a>
    </div>
  </header>

  <!-- 主文內容 -->
  <main class="max-w-4xl mx-auto px-4 sm:px-8 py-10">
    <div class="mb-8 border-b border-[#1f2228] pb-6">
      <div class="inline-flex items-center gap-1.5 text-xs font-mono text-[#ff2a3c] bg-[#ff2a3c]/10 border border-[#ff2a3c]/20 px-2.5 py-1 rounded mb-3">
        <ShieldCheck class="w-3.5 h-3.5" />
        <span>OFFICIAL COMPLIANCE DOCUMENT</span>
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('privacy_h2')}</h2>
      <p class="text-xs font-mono text-[#717684] mt-2">{t('privacy_effective')}</p>
    </div>

    <div class="space-y-8 text-sm leading-relaxed text-[#c4c8d4]">
      <!-- 導言 -->
      <section class="bg-[#0b0d11] border border-[#1b1e25] rounded-lg p-5">
        <p>
          {t('privacy_intro_pre')} <strong>{t('privacy_intro_brand')}</strong>{t('privacy_intro_mid')}<strong>{t('privacy_intro_strong')}</strong>{t('privacy_intro_post')}
        </p>
      </section>

      <!-- 核心原則 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <Database class="w-4 h-4 text-[#ff2a3c]" />
          <span>{t('privacy_s1_title')}</span>
        </h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 space-y-2">
          <p class="text-xs text-[#9aa0ae]">
            <strong>{t('privacy_s1_p1_label')}</strong>
            {t('privacy_s1_p1_body')}
          </p>
          <p class="text-xs text-[#9aa0ae]">
            <strong>{t('privacy_s1_p2_label')}</strong>
            {t('privacy_s1_p2_body')}
          </p>
        </div>
      </section>

      <!-- Google API 與 Google Drive 宣告 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <Cloud class="w-4 h-4 text-[#ff2a3c]" />
          <span>{t('privacy_s2_title')}</span>
        </h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 space-y-3">
          <p>
            {t('privacy_s2_intro')}
          </p>
          <ul class="list-disc pl-5 space-y-1.5 text-xs text-[#a5abb8]">
            <li>
              <code class="text-[#ff2a3c] bg-[#ff2a3c]/10 px-1.5 py-0.5 rounded font-mono">https://www.googleapis.com/auth/drive.appdata</code>:
              {t('privacy_s2_scope1_desc')}
            </li>
            <li>
              <code class="text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">https://www.googleapis.com/auth/userinfo.email</code> {t('privacy_s2_scope2_and')} <code class="text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">userinfo.profile</code>:
              {t('privacy_s2_scope2_desc')}
            </li>
          </ul>

          <div class="border-t border-[#1f2228] pt-3 space-y-2">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('privacy_s2_sandbox_title')}</span>
            </h4>
            <p class="text-xs text-[#949ba8]">
              <code>drive.appdata</code> {t('privacy_s2_sandbox_p1_pre')}<strong>{t('privacy_s2_sandbox_p1_strong')}</strong>{t('privacy_s2_sandbox_p1_post')}
            </p>
            <p class="text-xs text-[#949ba8]">
              {t('privacy_s2_policy_pre')}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[#ff2a3c] hover:underline"
              >
                {t('privacy_s2_policy_link1')}
              </a>
              {t('privacy_s2_policy_and')}
              <a
                href="https://developers.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[#ff2a3c] hover:underline"
              >
                {t('privacy_s2_policy_link2')}
              </a>
              {t('privacy_s2_policy_post')}
            </p>
          </div>

          <!-- Google APIs 服務條款與 AI NCII 專項合規聲明 -->
          <div class="border-t border-[#1f2228] pt-3 space-y-2 bg-[#090b0e] p-3 rounded border border-neutral-800/80">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('privacy_s2_ncii_title')}</span>
            </h4>
            <p class="text-xs text-[#a0a6b5] leading-relaxed">
              <strong>{t('privacy_s2_ncii_label')}</strong>
              {t('privacy_s2_ncii_p1_a')}<strong>{t('privacy_s2_ncii_p1_s1')}</strong>{t('privacy_s2_ncii_p1_b')}<strong>{t('privacy_s2_ncii_p1_s2')}</strong>{t('privacy_s2_ncii_p1_c')}<code class="font-mono text-[#ff2a3c]">drive.appdata</code>{t('privacy_s2_ncii_p1_d')}
            </p>
            <p class="text-xs text-[#8a90a0] leading-relaxed font-mono pt-1 border-t border-neutral-800/60">
              <strong>English Compliance Notice:</strong>
              Pickup Artist is a client-side personal music artist intelligence, curation, and listening log utility.
              Pickup Artist strictly complies with the Google APIs Terms of Service.
              We explicitly certify and warrant that <strong>this application does not use, integrate, or facilitate any Google APIs for AI-generated Non-Consensual Intimate Imagery (AI NCII)</strong> or any intimate imagery processing.
              Google Drive API access is strictly limited to the private <code class="text-neutral-300">drive.appdata</code> sandbox exclusively for syncing user-owned music metadata backup files (JSON format).
            </p>
          </div>
        </div>
      </section>

      <!-- 微軟 OneDrive 宣告 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <FileText class="w-4 h-4 text-[#ff2a3c]" />
          <span>{t('privacy_s3_title')}</span>
        </h3>
        <p class="text-xs text-[#9aa0ae]">
          {t('privacy_s3_body')}
        </p>
      </section>

      <!-- 資料控制權與撤銷授權 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white">{t('privacy_s4_title')}</h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 text-xs text-[#9aa0ae] space-y-2">
          <p>{t('privacy_s4_intro')}</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>{t('privacy_s4_li1_label')}</strong>{t('privacy_s4_li1_body')}</li>
            <li><strong>{t('privacy_s4_li2_label')}</strong>{t('privacy_s4_li2_body')}</li>
            <li><strong>{t('privacy_s4_li3_label')}</strong>{t('privacy_s4_li3_pre')} <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" class="text-[#ff2a3c] hover:underline">{t('privacy_s4_li3_link')}</a> {t('privacy_s4_li3_post')}</li>
          </ul>
        </div>
      </section>

      <!-- 條款與免責聲明 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white">{t('privacy_s5_title')}</h3>
        <p class="text-xs text-[#9aa0ae]">
          {t('privacy_s5_body')}
        </p>
      </section>

      <!-- 聯絡方式 -->
      <section class="border-t border-[#1f2228] pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono text-[#717684]">
        <div>
          <p>{t('privacy_footer_contact')}</p>
          <p class="mt-0.5">Pickup Artist Project · Crafted for Audiophiles & Crate Diggers</p>
        </div>
        <a
          href="/"
          class="inline-flex items-center gap-1 text-[#ff2a3c] hover:underline font-bold"
        >
          <span>{t('privacy_footer_back')}</span>
          <span>&rarr;</span>
        </a>
      </section>
    </div>
  </main>
</div>
