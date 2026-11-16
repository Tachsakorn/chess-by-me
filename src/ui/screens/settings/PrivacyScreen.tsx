import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { local } from '@/data/local';
import { useApp } from '@/ui/app/appStore';
import { CONTACT_EMAIL } from '@/ui/app/config';
import { BackButton } from '@/ui/components/BackButton';
import { ConfirmSheet } from '@/ui/components/ConfirmSheet';
import { Group, Row } from '@/ui/components/GroupedList';
import { Page } from '@/ui/components/Page';
import { useMessages } from '@/ui/i18n/LanguageContext';
import styles from './SettingsScreen.module.css';

/**
 * Settings › Privacy (Fable review A2-04): what stays on the device, what goes to Lichess and
 * Chess.com, what the app does not have, and where to write. Short on purpose. It also shows the
 * space the app uses on the device and clears everything it keeps, after asking (A6-02); here
 * rather than on Settings itself, which then still fits one phone screen.
 */
export function PrivacyScreen() {
  const messages = useMessages();
  const text = messages.privacy;
  const t = messages.settings;
  const navigate = useNavigate();
  const setAccounts = useApp((s) => s.setAccounts);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  // What the site keeps on this device, app files included. undefined while asking, null when
  // the browser does not say.
  const [usedMb, setUsedMb] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void (async () => {
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const usage = estimate?.usage;
      if (current) setUsedMb(typeof usage === 'number' ? usage / 1024 / 1024 : null);
    })();
    return () => {
      current = false;
    };
  }, []);

  const clearAll = async () => {
    setBusy(true);
    await local.clearAll().catch(() => {});
    try {
      localStorage.removeItem('cbm.ratingsSite');
    } catch {
      // storage blocked: nothing kept there either
    }
    await setAccounts(null).catch(() => {});
    void navigate('/connect', { replace: true });
  };

  return (
    <Page mode="scroll" className={styles.page}>
      <header className={styles.header}>
        <BackButton />
        <h1 className={`${styles.title} t-large-title`}>{text.title}</h1>
      </header>
      {text.sections.map((section) => (
        <section key={section.title} className={styles.group}>
          <h2 className={`${styles.textTitle} t-caption w-600 c-3`}>{section.title}</h2>
          <p className={`${styles.textBox} t-body squircle`}>{section.body}</p>
        </section>
      ))}
      <Group title={t.groups.storage} className={styles.group}>
        <Row
          label={t.storageUsed}
          value={
            usedMb === undefined ? '' : usedMb === null ? t.storageUnknown : t.megabytes(usedMb)
          }
        />
        <Row
          label={<span className={styles.danger}>{t.clearData}</span>}
          onClick={() => setClearing(true)}
        />
      </Group>
      <section className={styles.group}>
        <h2 className={`${styles.textTitle} t-caption w-600 c-3`}>{text.contactTitle}</h2>
        <p className={`${styles.textBox} t-body squircle`}>
          {text.contactBody}{' '}
          <a className={styles.mail} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
      <ConfirmSheet
        open={clearing}
        title={t.clearTitle}
        body={t.clearBody}
        confirmLabel={t.clearConfirm}
        cancelLabel={t.clearCancel}
        busy={busy}
        onConfirm={() => void clearAll()}
        onCancel={() => setClearing(false)}
      />
    </Page>
  );
}
