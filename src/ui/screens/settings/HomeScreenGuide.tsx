import { BackButton } from '@/ui/components/BackButton';
import { Page } from '@/ui/components/Page';
import { useMessages } from '@/ui/i18n/LanguageContext';
import styles from './SettingsScreen.module.css';

/**
 * Settings › Add to Home Screen (1.2): how to put the app on an iPhone's Home Screen, where
 * Safari offers no install button of its own. Laid out like Privacy: grey text boxes under small
 * headings. The words of Safari's own buttons are written as Safari shows them in that language.
 */
export function HomeScreenGuide() {
  const text = useMessages().homeScreen;
  return (
    <Page mode="scroll" className={styles.page}>
      <header className={styles.header}>
        <BackButton />
        <h1 className={`${styles.title} t-large-title`}>{text.title}</h1>
      </header>
      <section className={styles.group}>
        <p className={`${styles.textBox} t-body squircle`}>{text.why}</p>
      </section>
      <section className={styles.group}>
        <h2 className={`${styles.textTitle} t-caption w-600 c-3`}>{text.stepsTitle}</h2>
        <ol className={`${styles.textBox} ${styles.steps} t-body squircle`}>
          {text.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className={styles.group}>
        <h2 className={`${styles.textTitle} t-caption w-600 c-3`}>{text.otherTitle}</h2>
        <p className={`${styles.textBox} t-body squircle`}>{text.other}</p>
      </section>
    </Page>
  );
}
