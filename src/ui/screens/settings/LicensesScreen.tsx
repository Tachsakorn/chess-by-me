import { BackButton } from '@/ui/components/BackButton';
import { Group, Row } from '@/ui/components/GroupedList';
import { Page } from '@/ui/components/Page';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { SOURCE_CODE_URL } from '@/ui/app/config';
import { LICENSES } from './licenses';
import styles from './SettingsScreen.module.css';

/** Settings › Open-source licenses: package and licence, in the grey group of Settings. */
export function LicensesScreen() {
  const text = useMessages().licenses;
  return (
    <Page mode="scrollWhenShort" floatingBar={false} className={styles.page}>
      <header className={styles.header}>
        <BackButton />
        <h1 className={`${styles.title} t-large-title`}>{text.title}</h1>
      </header>
      <Group note={text.note} className={styles.group}>
        {LICENSES.map((item) => (
          <Row key={item.name} label={item.name} value={item.license} />
        ))}
      </Group>
      <Group className={styles.group}>
        <Row label={text.notices} href="/THIRD-PARTY-NOTICES.txt" />
        {SOURCE_CODE_URL && <Row label={text.source} href={SOURCE_CODE_URL} />}
      </Group>
    </Page>
  );
}
