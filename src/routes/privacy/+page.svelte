<script lang="ts">
  import { ArrowLeft, ShieldCheck, Database, Cloud, FileText, CheckCircle2 } from 'lucide-svelte';
</script>

<svelte:head>
  <title>隱私權政策與服務條款 · Pickup Artist (PUA)</title>
  <meta name="description" content="Pickup Artist 應用程式隱私權政策、資料處理原則與 Google Drive API 使用聲明。" />
</svelte:head>

<div class="min-h-screen bg-[#050505] text-[#f4f4f6] font-sans antialiased selection:bg-[#ff2a3c] selection:text-white">
  <!-- 頂部導覽列 -->
  <header class="sticky top-0 z-50 bg-[#08090a]/90 backdrop-blur border-b border-[#1f2228] px-4 sm:px-8 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <img src="/logo-120x120.png" alt="Pickup Artist Logo" class="w-7 h-7 rounded border border-[#2b2f38]" />
      <div>
        <h1 class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
          <span>大音悉聲 · PICKUP ARTIST</span>
          <span class="text-[10px] font-mono text-[#ff2a3c] px-1.5 py-0.5 rounded bg-[#ff2a3c]/10 border border-[#ff2a3c]/30">LEGAL</span>
        </h1>
        <p class="text-[10px] font-mono text-[#717684]">PRIVACY POLICY & TERMS OF SERVICE</p>
      </div>
    </div>

    <a
      href="/"
      class="flex items-center gap-1.5 px-3 py-1.5 bg-[#14161b] hover:bg-[#ff2a3c] text-[#a0a5b2] hover:text-white border border-[#262a34] hover:border-[#ff2a3c] rounded text-xs font-mono font-medium transition-all cursor-pointer shadow-sm"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      <span>返回音樂工作台</span>
    </a>
  </header>

  <!-- 主文內容 -->
  <main class="max-w-4xl mx-auto px-4 sm:px-8 py-10">
    <div class="mb-8 border-b border-[#1f2228] pb-6">
      <div class="inline-flex items-center gap-1.5 text-xs font-mono text-[#ff2a3c] bg-[#ff2a3c]/10 border border-[#ff2a3c]/20 px-2.5 py-1 rounded mb-3">
        <ShieldCheck class="w-3.5 h-3.5" />
        <span>OFFICIAL COMPLIANCE DOCUMENT</span>
      </div>
      <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">隱私權政策與服務條款 (Privacy Policy & Terms)</h2>
      <p class="text-xs font-mono text-[#717684] mt-2">最後修訂生效日期：2026 年 10 月 24 日 · 版本：2.0</p>
    </div>

    <div class="space-y-8 text-sm leading-relaxed text-[#c4c8d4]">
      <!-- 導言 -->
      <section class="bg-[#0b0d11] border border-[#1b1e25] rounded-lg p-5">
        <p>
          感謝您使用 <strong>Pickup Artist（大音悉聲，以下簡稱「本軟體」或「我們」）</strong>。
          Pickup Artist 是一款專為音樂愛好者、黑膠唱片收藏家與音樂策展人設計的高效能本地優先（Local-first）資料庫管理工具。
          我們深信隱私是基本人權，因此本軟體從底層架構起即採用<strong>「零外部追蹤、純客戶端儲存」</strong>的設計理念。
        </p>
      </section>

      <!-- 核心原則 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <Database class="w-4 h-4 text-[#ff2a3c]" />
          <span>1. 資料儲存與純客戶端運作原則</span>
        </h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 space-y-2">
          <p class="text-xs text-[#9aa0ae]">
            <strong>本地優先儲存：</strong>
            您的藝人收藏庫、黑膠唱片資料、聆賞日誌以及自訂標籤，全數儲存於您目前使用的瀏覽器本地資料庫（IndexedDB）中。
          </p>
          <p class="text-xs text-[#9aa0ae]">
            <strong>無中央伺服器：</strong>
            我們不維護任何儲存使用者資料的中央後端資料庫，也不會主動蒐集、分析、側錄或販售您的個人隱私、聆聽品味或設備識別碼。
          </p>
        </div>
      </section>

      <!-- Google API 與 Google Drive 宣告 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <Cloud class="w-4 h-4 text-[#ff2a3c]" />
          <span>2. Google API 與 Google Drive 權限使用聲明</span>
        </h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 space-y-3">
          <p>
            當您自願在「雲端同步」設定中連結您的 Google 帳戶以啟用跨裝置同步時，我們透過 Google Identity Services (GIS) 與 Google Drive API v3 請求以下授權：
          </p>
          <ul class="list-disc pl-5 space-y-1.5 text-xs text-[#a5abb8]">
            <li>
              <code class="text-[#ff2a3c] bg-[#ff2a3c]/10 px-1.5 py-0.5 rounded font-mono">https://www.googleapis.com/auth/drive.appdata</code>：
              僅存取 Google 雲端硬碟中的「應用程式專屬資料夾 (Application Data Folder)」。
            </li>
            <li>
              <code class="text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">https://www.googleapis.com/auth/userinfo.email</code> 與 <code class="text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">userinfo.profile</code>：
              僅用於在本地端介面顯示您目前連線的 Google 帳戶名稱與頭像，作為身分識別之用。
            </li>
          </ul>

          <div class="border-t border-[#1f2228] pt-3 space-y-2">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
              <span>嚴格沙盒隔離（無權存取您的私人雲端硬碟檔案）</span>
            </h4>
            <p class="text-xs text-[#949ba8]">
              <code>drive.appdata</code> 是一個完全獨立隱藏的沙盒儲存區，本軟體<strong>絕不會、且在技術上也無法</strong>讀取、修改、查看、列出或刪除您 Google Drive 根目錄或個人資料夾中的任何相片、文件或私人檔案。備份檔僅包含壓縮後的音樂資料庫快照。
            </p>
            <p class="text-xs text-[#949ba8]">
              我們承諾嚴格遵循
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[#ff2a3c] hover:underline"
              >
                Google API 服務：使用者資料政策 (Google API Services User Data Policy)
              </a>
              與
              <a
                href="https://developers.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[#ff2a3c] hover:underline"
              >
                Google APIs 服務條款 (Google APIs Terms of Service)
              </a>
              ，絕不將自 Google API 獲取之任何資料用於廣告投放、人工智慧模型訓練或出售給第三方機構。
            </p>
          </div>

          <!-- Google APIs 服務條款與 AI NCII 專項合規聲明 -->
          <div class="border-t border-[#1f2228] pt-3 space-y-2 bg-[#090b0e] p-3 rounded border border-neutral-800/80">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
              <span>Google APIs 服務條款與 AI NCII 合規宣告 (Terms & AI NCII Compliance)</span>
            </h4>
            <p class="text-xs text-[#a0a6b5] leading-relaxed">
              <strong>繁體中文聲明：</strong>
              Pickup Artist（大音悉聲）為一款專為音樂愛好者與黑膠唱片收藏者打造的本地優先音樂資料庫與曲風筆記工具。
              本應用程式<strong>嚴格遵守 Google APIs 服務條款（Google APIs Terms of Service）</strong>。
              我們鄭重聲明：本應用程式<strong>絕不使用、絕不介接、亦絕不調用任何 Google API 用於生成、處理、傳播或託管任何「AI 生成之未經同意私密影像」(AI-generated Non-Consensual Intimate Imagery, AI NCII) 或任何親密違法內容</strong>。
              本軟體使用之 Google Drive API 僅限於 <code class="font-mono text-[#ff2a3c]">drive.appdata</code> 沙盒範圍，完全僅供使用者自願備份與還原純文字格式之音樂唱片目錄（JSON 備份檔）。
            </p>
            <p class="text-xs text-[#8a90a0] leading-relaxed font-mono pt-1 border-t border-neutral-800/60">
              <strong>English Compliance Notice:</strong>
              Pickup Artist is a client-side personal music curation, vinyl record cataloging, and listening log utility.
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
          <span>3. 微軟 OneDrive 與第三方服務</span>
        </h3>
        <p class="text-xs text-[#9aa0ae]">
          若您選擇使用微軟 OneDrive 同步，微軟 Graph API 亦僅會存取使用者專屬的應用程式備份資料夾，本軟體同樣不會掃描或存取使用者之微軟帳戶其他文件。
          若您啟用了外部串流平台快捷跳轉（如 Spotify、Apple Music、YouTube Music 等），所有搜尋請求均由您本機瀏覽器直接導航至相應服務之公開網址。
        </p>
      </section>

      <!-- 資料控制權與撤銷授權 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white">4. 使用者權利與撤銷授權</h3>
        <div class="bg-[#0e1015] border border-[#1f2228] rounded p-4 text-xs text-[#9aa0ae] space-y-2">
          <p>您對自己的資料擁有 100% 的完全控制權：</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>匯出資料：</strong>您可以隨時於側邊欄點選「PUA_LIBRARY.JSON」完整備份匯出全部資料庫。</li>
            <li><strong>一鍵清除：</strong>您可以隨時於瀏覽器設定清除網站資料，徹底抹除本機儲存的所有 IndexedDB 紀錄。</li>
            <li><strong>解除雲端連結：</strong>您可隨時在「雲端即時同步」面板點選「中斷連結」，或至 <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" class="text-[#ff2a3c] hover:underline">Google 帳戶安全性設定</a> 立即撤銷本應用的授權。</li>
          </ul>
        </div>
      </section>

      <!-- 條款與免責聲明 -->
      <section class="space-y-3">
        <h3 class="text-base font-bold text-white">5. 服務條款與免責聲明 (Terms of Service)</h3>
        <p class="text-xs text-[#9aa0ae]">
          本軟體按「現狀 (AS IS)」依開源與自由軟體原則提供，不提供任何明示或暗示的擔保。使用者應自行負責重要資料的定期匯出備份。對於因硬體故障、瀏覽器資料庫損毀或第三方雲端服務中斷所致之資料遺失，本軟體在法律允許的最大範圍內不負損害賠償責任。
        </p>
      </section>

      <!-- 聯絡方式 -->
      <section class="border-t border-[#1f2228] pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono text-[#717684]">
        <div>
          <p>聯絡開發團隊：可透過 GitHub 儲存庫提出 Issue 或發起 Pull Request。</p>
          <p class="mt-0.5">Pickup Artist Project · Crafted for Audiophiles & Crate Diggers</p>
        </div>
        <a
          href="/"
          class="inline-flex items-center gap-1 text-[#ff2a3c] hover:underline font-bold"
        >
          <span>回到主應用程式</span>
          <span>&rarr;</span>
        </a>
      </section>
    </div>
  </main>
</div>
