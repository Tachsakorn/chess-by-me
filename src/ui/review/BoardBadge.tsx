import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Color, MoveCategory } from '@/contract';
import { getMessages } from '@/i18n';
import { badgeFor, badgeSpot, calloutPlace } from './badge';
import styles from './ReviewBoard.module.css';

/** The open book of the Book badge: our own drawing (owner, 2026-11-15), not Chess.com's icon. */
const BOOK_PATH =
  'M12 6.5C10.5 5.3 8.2 4.8 5 5v12.5c3.2-.2 5.5.3 7 1.5 1.5-1.2 3.8-1.7 7-1.5V5c-3.2-.2-5.5.3-7 1.5zM12 6.5V19';

// The timing the owner approved (2026-11-15, third version), in milliseconds.
/** Every category but Brilliant: the badge pops up, nothing else. */
const POP = 160;
/** Brilliant: the callout first, alone; the badge pops up only as the callout fades. */
const CALLOUT_IN = 160;
const CALLOUT_HOLD = 1100;
const CALLOUT_OUT = 1250;
const EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
const EASE_SOFT = 'cubic-bezier(.2,.8,.2,1)';

interface BoardBadgeProps {
  category: MoveCategory;
  /** Where the move landed ("e4"). */
  square: string;
  bottom: Color;
  /** Play the animation: only on a single step forward, never with reduced motion. */
  animate: boolean;
}

/**
 * The quality badge in the top right corner of the square a move landed on (owner, 2026-11-15).
 * On a step forward it pops up; a Brilliant move first raises a white callout with its name, and
 * its badge pops up only as the callout fades. Mounted again for every move, so a new move cuts the animation off at once.
 */
export function BoardBadge({ category, square, bottom, animate }: BoardBadgeProps) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const calloutRef = useRef<HTMLSpanElement>(null);
  const badge = badgeFor(category);
  const spot = badgeSpot(square, bottom);
  const play =
    animate && badge !== null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    const circle = badgeRef.current;
    if (!play || !circle) return;
    const callout = calloutRef.current;
    const board = callout?.parentElement;
    const pop = [{ scale: 0 }, { scale: 1.3, offset: 0.6 }, { scale: 1 }];
    const animations: Animation[] = [];
    if (!callout || !board) {
      animations.push(circle.animate(pop, { duration: POP, easing: EASE_POP }));
    } else {
      const { left, top } = calloutPlace(
        spot,
        { width: callout.offsetWidth, height: callout.offsetHeight },
        board.clientWidth,
      );
      callout.style.left = `${left}px`;
      callout.style.top = `${top}px`;
      // The callout rises at once, holds, then shrinks and fades; as it fades, the small badge
      // pops up in the corner of the square, so the two are never seen on top of each other.
      const at = (ms: number) => ms / CALLOUT_OUT;
      animations.push(
        callout.animate(
          [
            { scale: 0.55, opacity: 0, easing: EASE_SOFT },
            { scale: 1.06, opacity: 1, offset: at(CALLOUT_IN * 0.6), easing: EASE_SOFT },
            { scale: 1, opacity: 1, offset: at(CALLOUT_IN) },
            { scale: 1, opacity: 1, offset: at(CALLOUT_HOLD), easing: EASE_SOFT },
            { scale: 0.9, opacity: 0 },
          ],
          { duration: CALLOUT_OUT },
        ),
        circle.animate(pop, {
          delay: CALLOUT_HOLD,
          duration: CALLOUT_OUT - CALLOUT_HOLD,
          easing: EASE_POP,
          fill: 'backwards',
        }),
      );
    }
    return () => {
      for (const animation of animations) animation.cancel();
    };
    // Mounted once per move: the move, the board's side and `animate` never change in its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!badge) return null;
  const name = getMessages('en').category[category]; // the names are never translated (BRIEF-UI 7)

  return (
    <>
      <span
        ref={badgeRef}
        className={`${styles.badge} ${styles[`tone-${badge.tone}`] ?? ''}`}
        style={{ '--col': spot.column, '--row': spot.row } as CSSProperties}
      >
        <BadgeMark mark={badge.mark} iconClassName={styles.icon} />
      </span>
      {play && badge.callout && (
        <span ref={calloutRef} className={styles.callout}>
          <span className={styles.calloutMark}>{badge.mark}</span>
          <span className={styles.calloutName}>{name}</span>
        </span>
      )}
    </>
  );
}

/** Best's five-pointed star and the tick of Excellent and Good: our own drawings (owner,
 *  2026-11-15), not Chess.com's icons. */
const STAR_PATH =
  'M12 4.2l2.35 4.9 5.35.7-3.9 3.7.98 5.3L12 16.2l-4.78 2.6.98-5.3-3.9-3.7 5.35-.7z';
const CHECK_PATH = 'M5.5 12.5l4.2 4.2 8.8-9';

/** What a quality badge shows: its mark, or an icon. Also used by the move lists. */
export function BadgeMark({ mark, iconClassName }: { mark: string; iconClassName?: string }) {
  const icon = (d: string, look: { fill: string; strokeWidth: number }) => (
    <svg
      viewBox="0 0 24 24"
      className={iconClassName}
      fill={look.fill}
      stroke="currentColor"
      strokeWidth={look.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
  if (mark === 'book') return icon(BOOK_PATH, { fill: 'none', strokeWidth: 2.6 });
  if (mark === 'star') return icon(STAR_PATH, { fill: 'currentColor', strokeWidth: 1.6 });
  if (mark === 'check') return icon(CHECK_PATH, { fill: 'none', strokeWidth: 3 });
  return <>{mark}</>;
}
