import { MiniBoard } from '@/ui/board/MiniBoard';
import styles from './MessageScreen.module.css';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * A whole screen that explains why the app cannot go on, with one way forward: the error screen
 * (Fable review A3-02) and the "cannot save" screen (A6-01). Laid out like Connect.
 */
export function MessageScreen({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  /** None while something is under way (opening a game from its address, 1.2). */
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <main className={styles.page}>
      <MiniBoard fen={START} lastMove={null} palette="blue" className={styles.board} />
      <h1 className={`${styles.title} t-large-title`}>{title}</h1>
      <p className={`${styles.body} t-body-lg c-2`}>{body}</p>
      <div className={styles.spacer} />
      {!action ? null : action.href ? (
        <a href={action.href} className={`${styles.primary} t-nav-title pressable`}>
          {action.label}
        </a>
      ) : (
        <button
          type="button"
          onClick={action.onClick}
          className={`${styles.primary} t-nav-title pressable`}
        >
          {action.label}
        </button>
      )}
    </main>
  );
}
