// Dashboard locale detection module
// Maps navigator.language to supported locales (en / zh-CN / zh-TW)
// Used in Dashboard pages where HTML lang attribute is not available

import { Locale } from '../shared/i18n';

/**
 * Detect the Dashboard locale from a given language string.
 * Accepts an optional parameter for testability; defaults to navigator.language.
 *
 * Mapping rules:
 * - Starts with 'zh-cn', 'zh-hans', or equals 'zh' → 'zh-CN'
 * - Starts with 'zh-tw', 'zh-hant', 'zh-hk' → 'zh-TW'
 * - Everything else → 'en'
 */
export function detectLocaleFromNavigator(langValue?: string): Locale {
  const raw = langValue ?? (typeof navigator !== 'undefined' ? navigator.language : '');
  const lang = raw.toLowerCase().trim();

  if (lang === 'zh' || lang.startsWith('zh-cn') || lang.startsWith('zh-hans')) {
    return 'zh-CN';
  }

  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant') || lang.startsWith('zh-hk')) {
    return 'zh-TW';
  }

  return 'en';
}
