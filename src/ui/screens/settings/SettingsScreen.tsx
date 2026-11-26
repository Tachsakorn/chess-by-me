import { APP_ANALYSIS_OPTIONS, ENGINE_VERSION } from '@/analysis';
import { LOCALES, type Locale } from '@/i18n';
import {
  DEFAULT_DEPTH,
  DEPTH_CHOICES,
  parseDepth,
  readDepth,
  saveDepth,
  type DepthChoice,
} from '@/ui/app/analysisDepth';
import { useApp } from '@/ui/app/appStore';
import { offerHomeScreen, thisDevice } from '@/ui/app/homeScreen';
import { isSlowDepth } from '@/ui/review/depthChoice';
import { useId, useState } from 'react';
import { BUY_ME_A_COFFEE_URL } from '@/ui/app/config';
import { contactMailto } from '@/ui/app/contact';
import { lastAnalysisFailure } from '@/ui/app/analysisQueue';
import { BackButton } from '@/ui/components/BackButton';
import { Group, Row, SwitchRow } from '@/ui/components/GroupedList';
import { Page } from '@/ui/components/Page';
import { useLanguage } from '@/ui/i18n/LanguageContext';
import type { LanguageSetting } from '@/ui/i18n/language';
import { setSoundEnabled, soundEnabled } from '@/ui/sound/player';
import styles from './SettingsScreen.module.css';

/** Settings (BRIEF-UI 6.6). The whole page scrolls at every screen height (owner, 1.1 round 2:
 *  the Depth row made it taller than a 390x844 screen). Rows that only inform have no chevron. Appearance is hidden until
 *  there is a dark mode (BRIEF-UI 9, item 1); the Sound switch takes its place (owner,
 *  2026-11-16). */
export function SettingsScreen() {
  const { messages: text, locale, setting, setSetting } = useLanguage();
  const accounts = useApp((s) => s.accounts);
  const [sound, setSound] = useState(soundEnabled);
  const [depth, setDepth] = useState(readDepth);
  const languageNoteId = useId();
  const [homeScreen] = useState(() => offerHomeScreen(thisDevice()));
  const depthNoteId = useId();
  const t = text.settings;
  const depthName = (choice: DepthChoice) =>
    choice === DEFAULT_DEPTH ? t.depthDefault(choice) : String(choice);
  const languageName = (code: Locale) => t.languageNames[code];
  const languageValue =
    setting === 'auto' ? t.languageAuto(languageName(locale)) : languageName(setting);

  const account = (site: 'lichess' | 'chesscom') => {
    const name = accounts?.[site] ?? null;
    return (
      <Row
        label={text.sites[site]}
        value={name ?? t.connect}
        dot={name !== null}
        dotLabel={name !== null ? t.connected : undefined}
        to={`/connect?site=${site}`}
        state={{ from: 'settings' }}
      />
    );
  };

  return (
    <Page mode="scroll" className={styles.page}>
      <header className={styles.header}>
        <BackButton />
        <h1 className={`${styles.title} t-large-title`}>{t.title}</h1>
      </header>
      <Group title={t.groups.accounts} note={t.accountsNote} className={styles.group}>
        {account('lichess')}
        {account('chesscom')}
      </Group>
      {/* The language note belongs to the Language row alone, so it sits inside that row (1.2). */}
      <Group title={t.groups.general} className={styles.group}>
        <SwitchRow
          label={t.sound}
          checked={sound}
          onChange={(on) => {
            setSoundEnabled(on);
            setSound(on);
          }}
        />
        <Row
          label={t.language}
          value={languageValue}
          note={t.languageNote}
          noteId={languageNoteId}
          overlay={
            <select
              aria-label={t.language}
              aria-describedby={languageNoteId}
              className={styles.select}
              value={setting}
              onChange={(event) => setSetting(event.target.value as LanguageSetting)}
            >
              <option value="auto">{t.automatic}</option>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          }
        />
      </Group>
      <Group title={t.groups.analysis} note={t.analysisNote} className={styles.group}>
        <Row label={t.engine} value={t.engineValue(ENGINE_VERSION, APP_ANALYSIS_OPTIONS.engine)} />
        {/* Read when each game's analysis starts (src/ui/app/analysisDepth.ts). */}
        <Row
          label={t.depth}
          value={depthName(depth)}
          // 20 and 22 take much longer: said under the row (1.2).
          note={isSlowDepth(depth) ? t.depthSlow(depth) : undefined}
          noteId={depthNoteId}
          overlay={
            <select
              aria-label={t.depth}
              aria-describedby={isSlowDepth(depth) ? depthNoteId : undefined}
              className={styles.select}
              value={depth}
              onChange={(event) => {
                const picked = parseDepth(event.target.value);
                saveDepth(picked);
                setDepth(picked);
              }}
            >
              {DEPTH_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {depthName(choice)}
                </option>
              ))}
            </select>
          }
        />
      </Group>
      <Group title={t.groups.about} className={styles.group}>
        {homeScreen && <Row label={t.homeScreen} to="/settings/home-screen" />}
        {BUY_ME_A_COFFEE_URL && <Row label={t.buyCoffee} href={BUY_ME_A_COFFEE_URL} />}
        <Row label={t.version} value={__APP_VERSION__} />
        <Row
          label={t.contact}
          // Built at the tap, so the language and the window size are the ones of that moment.
          onClick={() => {
            window.location.href = contactMailto(text, locale, {
              version: __APP_VERSION__,
              screen: { width: window.innerWidth, height: window.innerHeight },
              lastError: lastAnalysisFailure(),
            });
          }}
        />
        <Row label={t.privacy} to="/settings/privacy" />
        <Row label={t.licenses} to="/settings/licenses" />
      </Group>
    </Page>
  );
}
