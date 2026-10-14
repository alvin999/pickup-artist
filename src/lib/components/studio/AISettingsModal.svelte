<script lang="ts">
  import {
    X,
    Key,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Cpu,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Eye,
    EyeOff,
    Zap,
    Lock
  } from 'lucide-svelte';
  import {
    type AISettings,
    DEFAULT_GROQ_MODEL,
    DEFAULT_GEMINI_MODEL,
    fetchGroqModels,
    fetchGeminiModels,
    testAIConnection
  } from '$lib/ai/client';
  import {
    type EncryptionMode,
    getStoredEncryptionMode,
    loadSecureAISettings,
    saveSecureAISettings,
    isMasterPasswordLocked,
    unlockWithMasterPassword,
    lockMasterPassword
  } from '$lib/ai/vault';

  interface Props {
    open: boolean;
    onclose: () => void;
    onsettingsSaved?: () => void;
  }

  let { open = false, onclose, onsettingsSaved }: Props = $props();

  // 狀態
  let provider = $state<'groq' | 'gemini'>('groq');
  let groqKey = $state('');
  let geminiKey = $state('');
  let groqModel = $state(DEFAULT_GROQ_MODEL);
  let geminiModel = $state(DEFAULT_GEMINI_MODEL);

  let encryptionMode = $state<EncryptionMode>('none');
  let masterPassword = $state('');
  let masterPasswordConfirm = $state('');
  let unlockPassword = $state('');

  let showKeys = $state(false);
  let isFetchingModels = $state(false);
  let isTesting = $state(false);
  let isSaving = $state(false);

  let groqModelsList = $state<string[]>([DEFAULT_GROQ_MODEL]);
  let geminiModelsList = $state<string[]>([DEFAULT_GEMINI_MODEL]);

  let statusMessage = $state<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  let isVaultLocked = $state(false);

  $effect(() => {
    if (open) {
      loadInitialData();
    }
  });

  async function loadInitialData() {
    statusMessage = null;
    encryptionMode = getStoredEncryptionMode();
    isVaultLocked = isMasterPasswordLocked();

    try {
      const secure = await loadSecureAISettings();
      provider = secure.settings.provider || 'groq';
      groqKey = secure.settings.groqKey || '';
      geminiKey = secure.settings.geminiKey || '';
      groqModel = secure.settings.groqModel || DEFAULT_GROQ_MODEL;
      geminiModel = secure.settings.geminiModel || DEFAULT_GEMINI_MODEL;
      isVaultLocked = secure.isLocked;

      if (!groqModelsList.includes(groqModel)) groqModelsList.push(groqModel);
      if (!geminiModelsList.includes(geminiModel)) geminiModelsList.push(geminiModel);
    } catch {
      // 保持預設值
    }
  }

  async function handleUnlock() {
    if (!unlockPassword) return;
    const res = await unlockWithMasterPassword(unlockPassword);
    if (res.success && res.settings) {
      isVaultLocked = false;
      provider = res.settings.provider;
      groqKey = res.settings.groqKey;
      geminiKey = res.settings.geminiKey;
      groqModel = res.settings.groqModel;
      geminiModel = res.settings.geminiModel;
      unlockPassword = '';
      statusMessage = { text: '保管庫已成功解鎖', type: 'success' };
    } else {
      statusMessage = { text: res.error || '解鎖失敗，密碼錯誤', type: 'error' };
    }
  }

  async function handleExploreModels() {
    statusMessage = null;
    isFetchingModels = true;
    try {
      if (provider === 'groq') {
        if (!groqKey.trim()) {
          statusMessage = { text: '請先輸入 Groq API Key', type: 'error' };
          return;
        }
        const models = await fetchGroqModels(groqKey);
        groqModelsList = models;
        if (!groqModelsList.includes(groqModel) && models.length > 0) {
          groqModel = models.includes(DEFAULT_GROQ_MODEL) ? DEFAULT_GROQ_MODEL : models[0];
        }
        statusMessage = { text: `成功探勘到 ${models.length} 個 Groq 可用模型`, type: 'success' };
      } else {
        if (!geminiKey.trim()) {
          statusMessage = { text: '請先輸入 Gemini API Key', type: 'error' };
          return;
        }
        const models = await fetchGeminiModels(geminiKey);
        geminiModelsList = models;
        if (!geminiModelsList.includes(geminiModel) && models.length > 0) {
          geminiModel = models.includes(DEFAULT_GEMINI_MODEL) ? DEFAULT_GEMINI_MODEL : models[0];
        }
        statusMessage = { text: `成功探勘到 ${models.length} 個 Gemini 可用模型`, type: 'success' };
      }
    } catch (err: any) {
      statusMessage = { text: err?.message || '模型探勘失敗', type: 'error' };
    } finally {
      isFetchingModels = false;
    }
  }

  async function handleTestConnection() {
    statusMessage = null;
    isTesting = true;
    const currentKey = provider === 'groq' ? groqKey : geminiKey;
    const currentModel = provider === 'groq' ? groqModel : geminiModel;

    try {
      const res = await testAIConnection(provider, currentKey, currentModel);
      statusMessage = { text: res.message, type: res.success ? 'success' : 'error' };
    } catch (e: any) {
      statusMessage = { text: `測試失敗: ${e.message}`, type: 'error' };
    } finally {
      isTesting = false;
    }
  }

  async function handleSave() {
    statusMessage = null;
    if (encryptionMode === 'master_password') {
      if (!masterPassword && isVaultLocked) {
        statusMessage = { text: '主密碼模式需設定密碼或先行解鎖', type: 'error' };
        return;
      }
      if (masterPassword && masterPassword !== masterPasswordConfirm) {
        statusMessage = { text: '兩次輸入的主密碼不一致', type: 'error' };
        return;
      }
    }

    isSaving = true;
    try {
      const settingsPayload: AISettings = {
        provider,
        groqKey: groqKey.trim(),
        geminiKey: geminiKey.trim(),
        groqModel: groqModel || DEFAULT_GROQ_MODEL,
        geminiModel: geminiModel || DEFAULT_GEMINI_MODEL
      };

      await saveSecureAISettings(settingsPayload, encryptionMode, masterPassword || undefined);
      statusMessage = { text: '發燒友金鑰與安全保管庫設定已成功儲存！', type: 'success' };
      masterPassword = '';
      masterPasswordConfirm = '';
      onsettingsSaved?.();
      setTimeout(() => {
        onclose();
      }, 700);
    } catch (err: any) {
      statusMessage = { text: `儲存失敗: ${err?.message || err}`, type: 'error' };
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-mono select-none">
    <!-- 黑色毛玻璃背景遮罩 -->
    <button
      type="button"
      aria-label="關閉視窗"
      onclick={onclose}
      class="absolute inset-0 w-full h-full bg-void/85 backdrop-blur-md cursor-default border-0"
    ></button>

    <!-- 主面板 -->
    <div
      role="dialog"
      aria-modal="true"
      class="crosshair-box bg-[#0c0d11] border border-[#262832] p-5 sm:p-6 max-w-xl w-full shadow-[0_0_40px_rgba(255,42,60,0.22)] flex flex-col gap-4 relative z-10 rounded-[3px] max-h-[92vh] overflow-y-auto"
    >
      <!-- 關閉按鈕 -->
      <button
        type="button"
        onclick={onclose}
        class="absolute top-4 right-4 text-ink-muted hover:text-signal cursor-pointer transition-colors"
      >
        <X class="w-4 h-4" />
      </button>

      <!-- 頂部標題與狀態 -->
      <div class="flex items-center justify-between border-b border-[#21232d] pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-signal animate-pulse"></span>
          <span class="font-dot text-sm font-bold text-signal tracking-widest uppercase">
            BYOK AI VAULT // 聲學金鑰保管庫
          </span>
        </div>
        <span class="text-[10px] text-ink-dim border border-wire px-1.5 py-0.5 bg-void">
          CLIENT-SIDE ZERO SERVER
        </span>
      </div>

      {#if isVaultLocked}
        <!-- 主密碼鎖定解鎖視窗 -->
        <div class="p-4 bg-void border border-signal/50 flex flex-col gap-3 rounded-[2px]">
          <div class="flex items-center gap-2 text-xs text-signal font-bold">
            <Lock class="w-4 h-4" />
            <span>主密碼保管庫已鎖定 (VAULT LOCKED)</span>
          </div>
          <p class="font-sans text-xs text-ink-muted leading-relaxed">
            您已啟動發燒友主密碼高規格加密，金鑰於記憶體中處於鎖定狀態。請輸入主密碼以解密存取。
          </p>
          <div class="flex items-center gap-2 mt-1">
            <input
              type="password"
              bind:value={unlockPassword}
              onkeydown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="輸入主密碼解鎖..."
              class="flex-1 bg-[#121318] border border-[#2b2d36] px-3 py-2 text-xs text-ink focus:outline-none focus:border-signal"
            />
            <button
              type="button"
              onclick={handleUnlock}
              class="px-4 py-2 bg-signal text-white text-xs font-bold hover:bg-white hover:text-void transition-colors cursor-pointer"
            >
              解鎖
            </button>
          </div>
        </div>
      {:else}

        <!-- 供應商切換器 (Provider Selector) -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-ink-muted uppercase tracking-wider block">// 選擇推論引擎供應商</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => (provider = 'groq')}
              class="p-2.5 border text-left flex items-center justify-between cursor-pointer transition-all rounded-[2px] {provider === 'groq' ? 'bg-[#181922] border-signal text-ink shadow-[inset_0_0_10px_rgba(255,42,60,0.15)]' : 'bg-void border-wire text-ink-muted hover:text-ink'}"
            >
              <div class="flex items-center gap-2">
                <Zap class="w-4 h-4 {provider === 'groq' ? 'text-signal' : 'text-ink-dim'}" />
                <div>
                  <div class="text-xs font-bold font-mono">GROQ LPU™</div>
                  <div class="text-[9px] text-ink-dim font-sans">超低延遲 · Llama 3.3 70B</div>
                </div>
              </div>
              {#if provider === 'groq'}
                <span class="w-1.5 h-1.5 rounded-full bg-signal"></span>
              {/if}
            </button>

            <button
              type="button"
              onclick={() => (provider = 'gemini')}
              class="p-2.5 border text-left flex items-center justify-between cursor-pointer transition-all rounded-[2px] {provider === 'gemini' ? 'bg-[#181922] border-signal text-ink shadow-[inset_0_0_10px_rgba(255,42,60,0.15)]' : 'bg-void border-wire text-ink-muted hover:text-ink'}"
            >
              <div class="flex items-center gap-2">
                <Cpu class="w-4 h-4 {provider === 'gemini' ? 'text-signal' : 'text-ink-dim'}" />
                <div>
                  <div class="text-xs font-bold font-mono">GOOGLE GEMINI</div>
                  <div class="text-[9px] text-ink-dim font-sans">多模態智庫 · Flash 2.0</div>
                </div>
              </div>
              {#if provider === 'gemini'}
                <span class="w-1.5 h-1.5 rounded-full bg-signal"></span>
              {/if}
            </button>
          </div>
        </div>

        <!-- 金鑰輸入區 -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ink-muted uppercase tracking-wider block">
              // {provider.toUpperCase()} API KEY
            </span>
            <button
              type="button"
              onclick={() => (showKeys = !showKeys)}
              class="flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink cursor-pointer"
            >
              {#if showKeys}
                <EyeOff class="w-3 h-3" />
                <span>隱藏</span>
              {:else}
                <Eye class="w-3 h-3" />
                <span>顯示</span>
              {/if}
            </button>
          </div>

          <div class="flex items-center px-3 py-2 bg-void border border-wire hover:border-[#434755] focus-within:border-signal transition-all">
            <Key class="w-3.5 h-3.5 text-signal mr-2 shrink-0" />
            {#if provider === 'groq'}
              <input
                type={showKeys ? 'text' : 'password'}
                bind:value={groqKey}
                placeholder="gsk_..."
                class="bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none w-full font-mono"
              />
            {:else}
              <input
                type={showKeys ? 'text' : 'password'}
                bind:value={geminiKey}
                placeholder="AIzaSy..."
                class="bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none w-full font-mono"
              />
            {/if}
          </div>
        </div>

        <!-- 動態模型探索與選擇 -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ink-muted uppercase tracking-wider block">// 動態模型矩陣 (MODEL)</span>
            <button
              type="button"
              onclick={handleExploreModels}
              disabled={isFetchingModels}
              class="flex items-center gap-1 text-[10px] text-signal hover:text-white cursor-pointer disabled:opacity-50"
            >
              <RefreshCw class="w-3 h-3 {isFetchingModels ? 'animate-spin' : ''}" />
              <span>探勘即時可用模型</span>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {#if provider === 'groq'}
              <select
                bind:value={groqModel}
                class="sm:col-span-2 bg-void border border-wire px-3 py-2 text-xs text-ink focus:outline-none focus:border-signal cursor-pointer"
              >
                {#each groqModelsList as m}
                  <option value={m} class="bg-[#121318] text-ink">{m}</option>
                {/each}
              </select>
            {:else}
              <select
                bind:value={geminiModel}
                class="sm:col-span-2 bg-void border border-wire px-3 py-2 text-xs text-ink focus:outline-none focus:border-signal cursor-pointer"
              >
                {#each geminiModelsList as m}
                  <option value={m} class="bg-[#121318] text-ink">{m}</option>
                {/each}
              </select>
            {/if}

            <button
              type="button"
              onclick={handleTestConnection}
              disabled={isTesting}
              class="px-3 py-2 bg-panel hover:bg-wire border border-wire text-ink text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
            >
              <Zap class="w-3 h-3 text-signal" />
              <span>{isTesting ? '測試中...' : '測試連線'}</span>
            </button>
          </div>
        </div>

        <!-- ================= 三種加密安全模式選取 ================= -->
        <div class="p-3 bg-void/80 border border-wire border-dashed flex flex-col gap-3 rounded-[2px]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs font-bold text-ink">
              <Shield class="w-3.5 h-3.5 text-signal" />
              <span>保管庫加密規格 (SECURITY LEVEL)</span>
            </div>
            <span class="text-[9px] text-ink-dim">WEB CRYPTO API</span>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <!-- 模式 1: 無加密 -->
            <button
              type="button"
              onclick={() => (encryptionMode = 'none')}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {encryptionMode === 'none' ? 'border-signal bg-panel text-ink' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between text-[10px] font-bold">
                <span>無加密</span>
                <span class="text-[8px] px-1 py-0.2 bg-wire">PLAIN</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">直接讀取，無運算負擔</span>
            </button>

            <!-- 模式 2: 裝置透明加密 -->
            <button
              type="button"
              onclick={() => (encryptionMode = 'device')}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {encryptionMode === 'device' ? 'border-signal bg-panel text-ink' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between text-[10px] font-bold">
                <span>裝置透明加密</span>
                <span class="text-[8px] px-1 py-0.2 bg-signal/20 text-signal">AES-GCM</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">本機硬體鎖，自動加解密</span>
            </button>

            <!-- 模式 3: 主密碼加密 -->
            <button
              type="button"
              onclick={() => (encryptionMode = 'master_password')}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {encryptionMode === 'master_password' ? 'border-signal bg-panel text-ink' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between text-[10px] font-bold">
                <span>主密碼加密</span>
                <span class="text-[8px] px-1 py-0.2 bg-amber-500/20 text-amber-400">PBKDF2</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">高規格防護，需密碼解鎖</span>
            </button>
          </div>

          <!-- 若選取主密碼模式，顯示密碼設定輸入框 -->
          {#if encryptionMode === 'master_password'}
            <div class="pt-2 border-t border-wire flex flex-col gap-2 animate-in fade-in">
              <span class="text-[10px] text-amber-400 font-bold">// 設定發燒友保管庫主密碼</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  bind:value={masterPassword}
                  placeholder="輸入主密碼 (Master Password)"
                  class="bg-[#121318] border border-wire px-2.5 py-1.5 text-xs text-ink focus:border-amber-400 focus:outline-none"
                />
                <input
                  type="password"
                  bind:value={masterPasswordConfirm}
                  placeholder="確認主密碼"
                  class="bg-[#121318] border border-wire px-2.5 py-1.5 text-xs text-ink focus:border-amber-400 focus:outline-none"
                />
              </div>
              <p class="text-[9px] text-ink-dim font-sans leading-tight">
                ＊主密碼將以 PBKDF2 (100,000 次反覆雜湊) 衍生密鑰。若遺失主密碼，本機儲存的金鑰將無法還原。
              </p>
            </div>
          {/if}
        </div>

      {/if}

      <!-- 狀態提示列 -->
      {#if statusMessage}
        <div class="p-2.5 text-xs flex items-center gap-2 border {statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : statusMessage.type === 'error' ? 'bg-red-950/40 border-red-500/50 text-red-300' : 'bg-blue-950/40 border-blue-500/50 text-blue-300'} rounded-[2px]">
          {#if statusMessage.type === 'success'}
            <CheckCircle2 class="w-4 h-4 shrink-0" />
          {:else}
            <AlertCircle class="w-4 h-4 shrink-0" />
          {/if}
          <span class="truncate">{statusMessage.text}</span>
        </div>
      {/if}

      <!-- 底部動作按鈕 -->
      <div class="flex items-center justify-between pt-2 border-t border-[#21232d]">
        <button
          type="button"
          onclick={onclose}
          class="px-3 py-1.5 text-xs text-ink-muted hover:text-ink font-mono cursor-pointer transition-colors"
        >
          [ESC] 關閉
        </button>

        <div class="flex items-center gap-2">
          {#if encryptionMode === 'master_password' && !isVaultLocked}
            <button
              type="button"
              onclick={() => {
                lockMasterPassword();
                isVaultLocked = true;
                statusMessage = { text: '已手動鎖定主密碼保管庫', type: 'info' };
              }}
              class="px-2.5 py-1.5 text-xs text-amber-400 hover:text-white border border-amber-500/40 bg-amber-500/10 cursor-pointer transition-colors"
            >
              手動鎖定
            </button>
          {/if}

          <button
            type="button"
            onclick={handleSave}
            disabled={isSaving}
            class="corner-cut-sm flex items-center gap-1.5 px-5 py-2 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_14px_rgba(255,42,60,0.35)] disabled:opacity-50"
          >
            <span>{isSaving ? '寫入保管庫中...' : '儲存保管庫設定'}</span>
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}
