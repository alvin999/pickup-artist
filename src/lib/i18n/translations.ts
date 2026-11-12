import { zhTW, type TranslationKey } from './locales/zh-TW';
import { en } from './locales/en';
import { ja } from './locales/ja';

export type SupportedLocale = 'zh-TW' | 'en' | 'ja';

export const translations = {
  'zh-TW': zhTW,
  en,
  ja
} as const;

export type { TranslationKey };
