import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import styles from './Segmented.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** id of the panel this tab shows (tabs only). */
  controls?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentOption<NoInfer<T>>[];
  value: T;
  onChange: (value: NoInfer<T>) => void;
  /** `large` on My Games and Connect, `small` on the review screen (BRIEF-UI 5.3). */
  size: 'large' | 'small';
  /** Filters and panels are tabs; choosing a site on Connect is a radio group (as drawn). */
  kind: 'tabs' | 'radio';
  label: string;
  className?: string;
}

/** The grey segmented control; the white thumb slides to the chosen segment. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size,
  kind,
  label,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let next: number | undefined;
    if (step !== undefined) next = (index + step + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    const option = options[next];
    if (option) onChange(option.value);
    refs.current[next]?.focus();
  };

  const style = { '--count': options.length, '--index': index } as CSSProperties;
  return (
    <div
      role={kind === 'tabs' ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={`${styles.track} ${styles[size]} squircle${className ? ` ${className}` : ''}`}
      style={style}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" className={styles.thumb} />
      {options.map((option, i) => {
        const on = i === index;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[i] = element;
            }}
            type="button"
            role={kind === 'tabs' ? 'tab' : 'radio'}
            aria-selected={kind === 'tabs' ? on : undefined}
            aria-checked={kind === 'radio' ? on : undefined}
            aria-controls={option.controls}
            tabIndex={on ? 0 : -1}
            className={`${styles.segment} t-caption w-600`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
