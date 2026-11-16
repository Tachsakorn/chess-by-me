/**
 * The language setting (BRIEF-UI section 7): `auto` follows the device, or the user picks
 * English or Thai in Settings. Kept in localStorage under `cbm.lang`; storage that is blocked
 * or full simply means the setting is not remembered.
 */
import { DEFAULT_LOCALE, LOCALES, pickLocale, type Locale } from '@/i18n';

export type LanguageSetting = 'auto' | Locale;

const KEY = 'cbm.lang';

export function readLanguageSetting(): LanguageSetting {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'auto' || LOCALES.includes(value as Locale)) return value as LanguageSetting;
  } catch {
    // storage blocked: fall through to the default
  }
  return 'auto';
}

export function writeLanguageSetting(setting: LanguageSetting): void {
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}

export function resolveLocale(setting: LanguageSetting, preferred: readonly string[]): Locale {
  return setting === 'auto' ? pickLocale(preferred) : setting;
}

export function deviceLocale(): Locale {
  return typeof navigator === 'undefined' ? DEFAULT_LOCALE : pickLocale(navigator.languages);
}
