import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/ui/components/Icon';
import { useMessages } from '@/ui/i18n/LanguageContext';
import type { NavigationAction } from './model';
import floating from '@/ui/components/FloatingBar.module.css';
import styles from './ReviewScreen.module.css';

interface StepperProps {
  /** At the foot of the right-hand column on a wide screen, instead of floating. */
  docked?: boolean;
  /** Which steps there are to take from here. */
  can: { first: boolean; previous: boolean; next: boolean; last: boolean };
  /** `repeat`: a step that repeats while the button is held down (it makes no sound). */
  onAction(action: NavigationAction, repeat?: boolean): void;
}

const HOLD_DELAY = 400;
const HOLD_STEP = 120;

/**
 * Holding a step button keeps stepping every 120ms (BRIEF-UI 6.2, item 9). A tap steps once; a
 * press from the keyboard (Enter, Space) arrives as a click and also steps once.
 */
function HoldButton({
  label,
  disabled,
  className,
  onStep,
  children,
}: {
  label: string;
  disabled: boolean;
  className: string;
  onStep(repeat: boolean): void;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`${className} pressable`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        step.current(false);
        const repeat = () => {
          step.current(true);
          timer.current = window.setTimeout(repeat, HOLD_STEP);
        };
        timer.current = window.setTimeout(repeat, HOLD_DELAY);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.detail === 0) step.current(false); // keyboard
      }}
    >
      {children}
    </button>
  );
}

/** The floating glass bar that steps through the game (BRIEF-UI 6.2, item 9). */
export function Stepper({ can, onAction, docked = false }: StepperProps) {
  const text = useMessages().review.stepper;
  return (
    <nav
      aria-label={text.label}
      className={`${floating.glass} ${styles.stepper}${docked ? ` ${styles.docked}` : ''}`}
    >
      <button
        type="button"
        aria-label={text.start}
        disabled={!can.first}
        className={`${styles.stepButton} pressable`}
        onClick={() => onAction('first')}
      >
        <Icon name="first" size={22} stroke={2.2} />
      </button>
      <HoldButton
        label={text.previous}
        disabled={!can.previous}
        className={styles.stepButton!}
        onStep={(repeat) => onAction('previous', repeat)}
      >
        <Icon name="back" size={24} stroke={2.4} />
      </HoldButton>
      <HoldButton
        label={text.next}
        disabled={!can.next}
        className={styles.stepNext!}
        onStep={(repeat) => onAction('next', repeat)}
      >
        <Icon name="chevron" size={24} stroke={2.4} />
      </HoldButton>
      <button
        type="button"
        aria-label={text.end}
        disabled={!can.last}
        className={`${styles.stepButton} pressable`}
        onClick={() => onAction('last')}
      >
        <Icon name="last" size={22} stroke={2.2} />
      </button>
      <button
        type="button"
        aria-label={text.flip}
        className={`${styles.stepButton} pressable`}
        onClick={() => onAction('flip')}
      >
        <Icon name="flip" size={22} stroke={2.2} />
      </button>
    </nav>
  );
}
