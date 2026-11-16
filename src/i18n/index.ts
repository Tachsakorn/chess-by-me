import { en, type Messages } from './messages/en';
import { th } from './messages/th';

/**
 * Adding a language: create messages/<code>.ts typed as Messages, then list it
 * here. TypeScript fails the build while any text is missing.
 */
export const LOCALES = ['en', 'th'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const catalog: Record<Locale, Messages> = { en, th };

export function getMessages(locale: Locale): Messages {
  return catalog[locale];
}

/**
 * Picks the first supported language from the browser's ordered preference
 * list (for example ["th-TH", "en-US"]), ignoring region and letter case.
 */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export type { Messages };
