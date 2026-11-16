import { Page } from '@/ui/components/Page';
import { TabBar } from '@/ui/components/TabBar';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { PHASE_COURSES, START_COURSE, type Course } from './courses';
import styles from './CoursesScreen.module.css';

/** The only screen that scrolls as a whole (BRIEF-UI 6.4). No course can be opened yet. */
export function CoursesScreen() {
  const text = useMessages().courses;
  return (
    <Page mode="scroll">
      <header className={styles.header}>
        <h1 className="t-large-title">{text.title}</h1>
        <p className={`${styles.intro} t-body c-2`}>{text.intro}</p>
      </header>
      <section className={styles.start}>
        <Cover course={START_COURSE} hero />
        <p className={`${styles.name} t-body w-600`}>{text.startHere}</p>
        <p className="t-caption c-3">{text.comingSoon}</p>
      </section>
      <section className={styles.phases}>
        <h2 className={`${styles.sectionTitle} t-section`}>{text.byPhase}</h2>
        <div className={styles.grid}>
          {PHASE_COURSES.map((course) => (
            <div key={course.id}>
              <Cover course={course} />
              <p className={`${styles.name} t-body w-600`}>{text.names[course.name]}</p>
              <p className="t-caption c-3">{text.comingSoon}</p>
            </div>
          ))}
        </div>
      </section>
      <TabBar />
    </Page>
  );
}

function Cover({ course, hero = false }: { course: Course; hero?: boolean }) {
  const messages = useMessages();
  const text = messages.courses;
  const tone = course.color ? styles[course.color] : '';
  return (
    <div
      aria-disabled="true"
      aria-label={`${text.names[course.name]}, ${text.comingSoon}`}
      role="group"
      className={`${hero ? styles.hero : styles.cover} ${tone} squircle`}
    >
      <span
        aria-hidden="true"
        className={`${styles.coverWord} ${hero ? 't-course-hero' : 't-course-title'}`}
      >
        <span>
          {course.cover.map((line, i) => (
            <span key={i} className={styles.coverLine}>
              {line}
            </span>
          ))}
        </span>
      </span>
      <span aria-hidden="true" className={styles.signature}>
        {messages.app.signature.name}
        <span className={styles.me}>{messages.app.signature.domain}</span>
      </span>
    </div>
  );
}
