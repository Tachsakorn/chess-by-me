import type { Color, PositionEval } from '@/contract';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { evalBar } from './evalBarState';
import styles from './EvalBar.module.css';

interface EvalBarProps {
  /** The evaluation of the position on the board; undefined until it is analysed. */
  position: PositionEval | undefined;
  /** The side at the bottom of the board: White's part of the bar is on White's side. */
  bottom: Color;
}

/** The evaluation bar to the left of the review board (owner, 2026-11-15). */
export function EvalBar({ position, bottom }: EvalBarProps) {
  const text = useMessages().review;
  const bar = evalBar(position);
  const label =
    bar.ready && bar.text && bar.leader ? text.evalLabel(bar.text, bar.leader) : text.evalPending;
  // The figure sits at the better side's end: on White's part in dark letters, else on Black's.
  const figureOnWhite = bar.leader !== 'black';
  const whiteEnd = bottom === 'white' ? 'bottom' : 'top';
  const figureEnd = figureOnWhite ? whiteEnd : whiteEnd === 'bottom' ? 'top' : 'bottom';

  return (
    <div
      role="img"
      aria-label={label}
      className={`${styles.bar} ${bar.ready ? '' : styles.pending}`}
      data-white={whiteEnd}
    >
      <span className={styles.white} style={{ height: `${bar.white * 100}%` }} />
      <span className={styles.middle} />
      {/* Shown on an iPad only (EvalBar.module.css). */}
      {bar.text && (
        <span
          aria-hidden="true"
          className={`${styles.figure} ${figureOnWhite ? styles.onWhite : styles.onBlack}`}
          data-end={figureEnd}
          // "−#13" is wider than the bar at 10px: a smaller size for the long ones.
          data-long={bar.text.includes('#') && bar.text.length >= 4 ? '' : undefined}
        >
          {bar.text}
        </span>
      )}
    </div>
  );
}
