import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, getMessages, type Locale, type Messages } from '@/i18n';
import {
  deviceLocale,
  readLanguageSetting,
  resolveLocale,
  writeLanguageSetting,
  type LanguageSetting,
} from './language';

interface LanguageValue {
  locale: Locale;
  messages: Messages;
  setting: LanguageSetting;
  setSetting(setting: LanguageSetting): void;
}

const LanguageContext = createContext<LanguageValue>({
  locale: DEFAULT_LOCALE,
  messages: getMessages(DEFAULT_LOCALE),
  setting: 'auto',
  setSetting: () => {},
});

/**
 * Holds the language in use. `fixed` pins a language without touching the stored setting (the
 * development pages use it to show either language).
 */
export function LanguageProvider({ children, fixed }: { children: ReactNode; fixed?: Locale }) {
  const [setting, setStored] = useState<LanguageSetting>(() => fixed ?? readLanguageSetting());
  const locale = resolveLocale(
    setting,
    typeof navigator === 'undefined' ? [] : navigator.languages,
  );

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setSetting = useCallback(
    (next: LanguageSetting) => {
      if (!fixed) writeLanguageSetting(next);
      setStored(next);
    },
    [fixed],
  );

  const value = useMemo(
    () => ({ locale, messages: getMessages(locale), setting, setSetting }),
    [locale, setting, setSetting],
  );
  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}

/** The text of the language in use. Components never hold wording of their own. */
export function useMessages(): Messages {
  return useContext(LanguageContext).messages;
}

export { deviceLocale };
