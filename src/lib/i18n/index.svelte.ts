import { translations, type SupportedLocale, type TranslationKey } from './translations';

class I18nStore {
  locale = $state<SupportedLocale>('zh-TW');

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pua_locale') as SupportedLocale | null;
      if (saved && (saved === 'zh-TW' || saved === 'en' || saved === 'ja')) {
        this.locale = saved;
      } else {
        const navLang = navigator.language.toLowerCase();
        if (navLang.startsWith('ja')) {
          this.locale = 'ja';
        } else if (navLang.startsWith('zh')) {
          this.locale = 'zh-TW';
        } else {
          this.locale = 'en';
        }
      }
    }
  }

  setLocale(newLocale: SupportedLocale) {
    this.locale = newLocale;
    if (typeof window !== 'undefined') {
      localStorage.setItem('pua_locale', newLocale);
      document.documentElement.lang = newLocale;
    }
  }

  t(key: TranslationKey): string {
    const dict = translations[this.locale] || translations['zh-TW'];
    return (dict as Record<string, string>)[key] || translations['zh-TW'][key] || key;
  }
}

export const i18n = new I18nStore();
export const t = (key: TranslationKey) => i18n.t(key);
export type { SupportedLocale, TranslationKey };
