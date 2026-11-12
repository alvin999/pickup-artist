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
    Lock,
    Music,
    Radio,
    ExternalLink
  } from 'lucide-svelte';
  import {
    STREAMING_PLATFORMS,
    type StreamingPlatform,
    getPreferredStreamingPlatform,
    setPreferredStreamingPlatform
  } from '$lib/utils/streaming';
  import { t } from '$lib/i18n';
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

  let preferredPlatform = $state<StreamingPlatform>('apple_music');
  let statusMessage = $state<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  let isVaultLocked = $state(false);

  // 自動即時探勘狀態
  let autoExploreStatus = $state<{
    groq: 'idle' | 'exploring' | 'success' | 'error';
    gemini: 'idle' | 'exploring' | 'success' | 'error';
  }>({
    groq: 'idle',
    gemini: 'idle'
  });

  let lastExploredGroqKey = '';
  let lastExploredGeminiKey = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let currentAutoStatus = $derived(provider === 'groq' ? autoExploreStatus.groq : autoExploreStatus.gemini);
  let currentModelsCount = $derived(provider === 'groq' ? groqModelsList.length : geminiModelsList.length);

  $effect(() => {
    if (open) {
      loadInitialData();
    }
  });

  async function loadInitialData() {
    statusMessage = null;
    encryptionMode = getStoredEncryptionMode();
    isVaultLocked = isMasterPasswordLocked();
    preferredPlatform = getPreferredStreamingPlatform();

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

      // 初始化探勘快取標記
      if (groqKey.trim() && groqKey.trim().length >= 15) {
        lastExploredGroqKey = groqKey.trim();
        runAutoExplore('groq', true);
      }
      if (geminiKey.trim() && geminiKey.trim().length >= 15) {
        lastExploredGeminiKey = geminiKey.trim();
        runAutoExplore('gemini', true);
      }
    } catch {
      // 保持預設值
    }
  }

  function triggerAutoExplore(targetProvider: 'groq' | 'gemini') {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runAutoExplore(targetProvider, false);
    }, 600);
  }

  async function runAutoExplore(targetProvider: 'groq' | 'gemini', isSilent = false) {
    const key = targetProvider === 'groq' ? groqKey.trim() : geminiKey.trim();
    if (!key || key.length < 15) {
      autoExploreStatus[targetProvider] = 'idle';
      return;
    }

    if (targetProvider === 'groq' && key === lastExploredGroqKey && autoExploreStatus.groq === 'success') return;
    if (targetProvider === 'gemini' && key === lastExploredGeminiKey && autoExploreStatus.gemini === 'success') return;

    autoExploreStatus[targetProvider] = 'exploring';
    isFetchingModels = true;

    try {
      if (targetProvider === 'groq') {
        const models = await fetchGroqModels(key);
        if (models.length > 0) {
          groqModelsList = models;
          if (!groqModelsList.includes(groqModel)) {
            groqModel = models.includes(DEFAULT_GROQ_MODEL) ? DEFAULT_GROQ_MODEL : models[0];
          }
          lastExploredGroqKey = key;
          autoExploreStatus.groq = 'success';
          if (!isSilent) {
            statusMessage = { text: t('ai_set_synced_models', { provider: 'Groq', count: models.length }), type: 'success' };
          }
        }
      } else {
        const models = await fetchGeminiModels(key);
        if (models.length > 0) {
          geminiModelsList = models;
          if (!geminiModelsList.includes(geminiModel)) {
            geminiModel = models.includes(DEFAULT_GEMINI_MODEL) ? DEFAULT_GEMINI_MODEL : models[0];
          }
          lastExploredGeminiKey = key;
          autoExploreStatus.gemini = 'success';
          if (!isSilent) {
            statusMessage = { text: t('ai_set_synced_models', { provider: 'Gemini', count: models.length }), type: 'success' };
          }
        }
      }
    } catch {
      autoExploreStatus[targetProvider] = 'error';
      // 靜默模式或使用者正在輸入時，不以醒目大紅字打斷
      if (!isSilent && targetProvider === provider) {
        statusMessage = { text: t('ai_set_explore_failed', { provider: targetProvider.toUpperCase() }), type: 'error' };
      }
    } finally {
      isFetchingModels = false;
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
      statusMessage = { text: t('ai_set_unlocked'), type: 'success' };
      if (groqKey.trim()) runAutoExplore('groq', true);
      if (geminiKey.trim()) runAutoExplore('gemini', true);
    } else {
      statusMessage = { text: res.error || t('ai_set_unlock_failed'), type: 'error' };
    }
  }

  async function handleExploreModels() {
    statusMessage = null;
    isFetchingModels = true;
    try {
      if (provider === 'groq') {
        if (!groqKey.trim()) {
          statusMessage = { text: t('ai_set_enter_key_first', { provider: 'Groq' }), type: 'error' };
          return;
        }
        const models = await fetchGroqModels(groqKey);
        groqModelsList = models;
        if (!groqModelsList.includes(groqModel) && models.length > 0) {
          groqModel = models.includes(DEFAULT_GROQ_MODEL) ? DEFAULT_GROQ_MODEL : models[0];
        }
        lastExploredGroqKey = groqKey.trim();
        autoExploreStatus.groq = 'success';
        statusMessage = { text: t('ai_set_found_models', { provider: 'Groq', count: models.length }), type: 'success' };
      } else {
        if (!geminiKey.trim()) {
          statusMessage = { text: t('ai_set_enter_key_first', { provider: 'Gemini' }), type: 'error' };
          return;
        }
        const models = await fetchGeminiModels(geminiKey);
        geminiModelsList = models;
        if (!geminiModelsList.includes(geminiModel) && models.length > 0) {
          geminiModel = models.includes(DEFAULT_GEMINI_MODEL) ? DEFAULT_GEMINI_MODEL : models[0];
        }
        lastExploredGeminiKey = geminiKey.trim();
        autoExploreStatus.gemini = 'success';
        statusMessage = { text: t('ai_set_found_models', { provider: 'Gemini', count: models.length }), type: 'success' };
      }
    } catch (err: any) {
      statusMessage = { text: err?.message || t('ai_set_explore_error'), type: 'error' };
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
      statusMessage = { text: t('ai_set_test_failed', { error: e.message }), type: 'error' };
    } finally {
      isTesting = false;
    }
  }

  async function handleSave() {
    statusMessage = null;
    if (encryptionMode === 'master_password') {
      if (!masterPassword && isVaultLocked) {
        statusMessage = { text: t('ai_set_pw_required'), type: 'error' };
        return;
      }
      if (masterPassword && masterPassword !== masterPasswordConfirm) {
        statusMessage = { text: t('ai_set_pw_mismatch'), type: 'error' };
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
      setPreferredStreamingPlatform(preferredPlatform);
      statusMessage = { text: t('ai_set_saved'), type: 'success' };
      masterPassword = '';
      masterPasswordConfirm = '';
      onsettingsSaved?.();
      setTimeout(() => {
        onclose();
      }, 700);
    } catch (err: any) {
      statusMessage = { text: t('ai_set_save_failed', { error: err?.message || err }), type: 'error' };
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
      aria-label={t('fast_close_aria')}
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
            {t('ai_set_title')}
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
            <span>{t('ai_set_vault_locked_title')}</span>
          </div>
          <p class="font-sans text-xs text-ink-muted leading-relaxed">
            {t('ai_set_vault_locked_desc')}
          </p>
          <div class="flex items-center gap-2 mt-1">
            <input
              type="password"
              bind:value={unlockPassword}
              onkeydown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder={t('ai_set_unlock_placeholder')}
              class="flex-1 bg-[#121318] border border-[#2b2d36] px-3 py-2 text-xs text-ink focus:outline-none focus:border-signal"
            />
            <button
              type="button"
              onclick={handleUnlock}
              class="px-4 py-2 bg-signal text-white text-xs font-bold hover:bg-white hover:text-void transition-colors cursor-pointer"
            >
              {t('ai_set_unlock_btn')}
            </button>
          </div>
        </div>
      {:else}

        <!-- 供應商切換器 (Provider Selector) -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ink-muted uppercase tracking-wider block">{t('ai_set_select_engine')}</span>
            {#if groqKey.trim() && geminiKey.trim()}
              <span class="text-[9px] text-signal font-mono flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-signal animate-pulse"></span>
                {t('ai_set_failover_ready')}
              </span>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => (provider = 'groq')}
              class="p-2.5 border text-left flex items-center justify-between cursor-pointer transition-all rounded-[2px] {provider === 'groq' ? 'bg-[#181922] border-signal text-ink shadow-[inset_0_0_10px_rgba(255,42,60,0.15)]' : 'bg-void border-wire text-ink-muted hover:text-ink'}"
            >
              <div class="flex items-center gap-2">
                <Zap class="w-4 h-4 {provider === 'groq' ? 'text-signal' : 'text-ink-dim'}" />
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-bold font-mono">GROQ LPU™</span>
                    {#if provider === 'groq'}
                      <span class="text-[8px] px-1 py-0.2 bg-signal/20 text-signal border border-signal/40 font-bold">{t('ai_set_badge_primary')}</span>
                    {:else if groqKey.trim()}
                      <span class="text-[8px] px-1 py-0.2 bg-wire text-ink-dim border border-wire">{t('ai_set_badge_backup')}</span>
                    {/if}
                  </div>
                  <div class="text-[9px] text-ink-dim font-sans">{t('ai_set_groq_subtitle')}</div>
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
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-bold font-mono">GOOGLE GEMINI</span>
                    {#if provider === 'gemini'}
                      <span class="text-[8px] px-1 py-0.2 bg-signal/20 text-signal border border-signal/40 font-bold">{t('ai_set_badge_primary')}</span>
                    {:else if geminiKey.trim()}
                      <span class="text-[8px] px-1 py-0.2 bg-wire text-ink-dim border border-wire">{t('ai_set_badge_backup')}</span>
                    {/if}
                  </div>
                  <div class="text-[9px] text-ink-dim font-sans">{t('ai_set_gemini_subtitle')}</div>
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
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-ink-muted uppercase tracking-wider block">
                // {provider.toUpperCase()} API KEY
              </span>
              {#if isFetchingModels}
                <span class="text-[9px] text-signal flex items-center gap-1 animate-pulse">
                  <RefreshCw class="w-2.5 h-2.5 animate-spin" />
                  <span>{t('ai_set_syncing_models')}</span>
                </span>
              {:else if currentAutoStatus === 'success'}
                <span class="text-[9px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 class="w-2.5 h-2.5" />
                  <span>{t('ai_set_updated_models', { count: currentModelsCount })}</span>
                </span>
              {/if}
            </div>
            <button
              type="button"
              onclick={() => (showKeys = !showKeys)}
              class="flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink cursor-pointer"
            >
              {#if showKeys}
                <EyeOff class="w-3 h-3" />
                <span>{t('ai_set_hide')}</span>
              {:else}
                <Eye class="w-3 h-3" />
                <span>{t('ai_set_show')}</span>
              {/if}
            </button>
          </div>

          <div class="flex items-center px-3 py-2 bg-void border border-wire hover:border-[#434755] focus-within:border-signal transition-all">
            <Key class="w-3.5 h-3.5 text-signal mr-2 shrink-0" />
            {#if provider === 'groq'}
              <input
                type={showKeys ? 'text' : 'password'}
                bind:value={groqKey}
                oninput={() => triggerAutoExplore('groq')}
                placeholder="gsk_..."
                class="bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none w-full font-mono"
              />
            {:else}
              <input
                type={showKeys ? 'text' : 'password'}
                bind:value={geminiKey}
                oninput={() => triggerAutoExplore('gemini')}
                placeholder="AIzaSy..."
                class="bg-transparent text-xs text-ink placeholder-ink-dim focus:outline-none w-full font-mono"
              />
            {/if}
          </div>

          <!-- 30 秒免費取得金鑰導引（降低一般使用者門檻） -->
          <div class="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-[#121318] border border-[#21232d] text-[10px] font-sans text-ink-muted rounded-[2px]">
            <span>
              {provider === 'groq' ? t('ai_set_groq_key_hint') : t('ai_set_gemini_key_hint')}
            </span>
            <a
              href={provider === 'groq' ? 'https://console.groq.com/keys' : 'https://aistudio.google.com/apikey'}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-signal hover:text-white font-mono font-bold transition-colors shrink-0"
            >
              <span>{t('ai_set_get_free_key', { provider: provider === 'groq' ? 'Groq' : 'Gemini' })}</span>
              <ExternalLink class="w-3 h-3" />
            </a>
          </div>
        </div>

        <!-- 動態模型探索與選擇 -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ink-muted uppercase tracking-wider block">{t('ai_set_model_matrix')}</span>
            <button
              type="button"
              onclick={handleExploreModels}
              disabled={isFetchingModels}
              class="flex items-center gap-1 text-[10px] text-signal hover:text-white cursor-pointer disabled:opacity-50"
              title={t('ai_set_refresh_models_title')}
            >
              <RefreshCw class="w-3 h-3 {isFetchingModels ? 'animate-spin' : ''}" />
              <span>{t('ai_set_manual_refresh')}</span>
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
              <span>{isTesting ? t('ai_set_testing') : t('ai_set_test_connection')}</span>
            </button>
          </div>
        </div>

        <!-- ================= 三種加密安全模式選取 ================= -->
        <div class="p-3 bg-void/80 border border-wire border-dashed flex flex-col gap-3 rounded-[2px]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs font-bold text-ink">
              <Shield class="w-3.5 h-3.5 text-signal" />
              <span>{t('ai_set_security_level')}</span>
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
                <span>{t('ai_set_sec_none')}</span>
                <span class="text-[8px] px-1 py-0.2 bg-wire">PLAIN</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">{t('ai_set_sec_none_desc')}</span>
            </button>

            <!-- 模式 2: 裝置透明加密 -->
            <button
              type="button"
              onclick={() => (encryptionMode = 'device')}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {encryptionMode === 'device' ? 'border-signal bg-panel text-ink' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between text-[10px] font-bold">
                <span>{t('ai_set_sec_device')}</span>
                <span class="text-[8px] px-1 py-0.2 bg-signal/20 text-signal">{t('ai_set_sec_recommended')}</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">{t('ai_set_sec_device_desc')}</span>
            </button>

            <!-- 模式 3: 主密碼加密 -->
            <button
              type="button"
              onclick={() => (encryptionMode = 'master_password')}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {encryptionMode === 'master_password' ? 'border-signal bg-panel text-ink' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between text-[10px] font-bold">
                <span>{t('ai_set_sec_master')}</span>
                <span class="text-[8px] px-1 py-0.2 bg-amber-500/20 text-amber-400">PBKDF2</span>
              </div>
              <span class="text-[9px] text-ink-muted leading-tight font-sans">{t('ai_set_sec_master_desc')}</span>
            </button>
          </div>

          <!-- 若選取主密碼模式，顯示密碼設定輸入框 -->
          {#if encryptionMode === 'master_password'}
            <div class="pt-2 border-t border-wire flex flex-col gap-2 animate-in fade-in">
              <span class="text-[10px] text-amber-400 font-bold">{t('ai_set_master_pw_header')}</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="password"
                  bind:value={masterPassword}
                  placeholder={t('ai_set_master_pw_placeholder')}
                  class="bg-[#121318] border border-wire px-2.5 py-1.5 text-xs text-ink focus:border-amber-400 focus:outline-none"
                />
                <input
                  type="password"
                  bind:value={masterPasswordConfirm}
                  placeholder={t('ai_set_master_pw_confirm')}
                  class="bg-[#121318] border border-wire px-2.5 py-1.5 text-xs text-ink focus:border-amber-400 focus:outline-none"
                />
              </div>
              <p class="text-[9px] text-ink-dim font-sans leading-tight">
                {t('ai_set_master_pw_note')}
              </p>
            </div>
          {/if}
        </div>

      {/if}

      <!-- 串流播放跳轉偏好 (Default Streaming Target) -->
      <div class="border border-wire bg-surface/40 p-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Radio class="w-4 h-4 text-signal" />
            <span class="text-xs font-bold text-ink uppercase tracking-wider font-mono">{t('ai_set_streaming_target')}</span>
          </div>
          <span class="text-[9px] text-ink-dim font-mono">{t('ai_set_outbound_exit')}</span>
        </div>
        <p class="text-[10px] text-ink-muted leading-relaxed font-sans">
          {t('ai_set_streaming_desc')}
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {#each Object.values(STREAMING_PLATFORMS) as platform}
            <button
              type="button"
              onclick={() => (preferredPlatform = platform.id)}
              class="p-2 border text-left flex flex-col justify-between gap-1 cursor-pointer transition-all {preferredPlatform === platform.id ? 'border-signal bg-panel text-ink shadow-[0_0_10px_rgba(250,56,62,0.2)]' : 'border-wire bg-void text-ink-dim hover:text-ink'}"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold font-mono">{platform.label}</span>
                {#if preferredPlatform === platform.id}
                  <span class="w-1.5 h-1.5 rounded-full bg-signal"></span>
                {/if}
              </div>
              <span class="text-[9px] text-ink-muted truncate font-sans">{t(platform.descKey)}</span>
            </button>
          {/each}
        </div>
      </div>

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
          {t('ai_set_close_esc')}
        </button>

        <div class="flex items-center gap-2">
          {#if encryptionMode === 'master_password' && !isVaultLocked}
            <button
              type="button"
              onclick={() => {
                lockMasterPassword();
                isVaultLocked = true;
                statusMessage = { text: t('ai_set_manual_locked_toast'), type: 'info' };
              }}
              class="px-2.5 py-1.5 text-xs text-amber-400 hover:text-white border border-amber-500/40 bg-amber-500/10 cursor-pointer transition-colors"
            >
              {t('ai_set_manual_lock')}
            </button>
          {/if}

          <button
            type="button"
            onclick={handleSave}
            disabled={isSaving}
            class="corner-cut-sm flex items-center gap-1.5 px-5 py-2 bg-signal hover:bg-white hover:text-void text-white font-mono text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_14px_rgba(255,42,60,0.35)] disabled:opacity-50"
          >
            <span>{isSaving ? t('ai_set_saving') : t('ai_set_save_btn')}</span>
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}
