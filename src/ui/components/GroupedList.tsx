import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import styles from './GroupedList.module.css';

/** A grey group of rows with an optional heading and note under it (BRIEF-UI 5.5). */
export function Group({
  title,
  note,
  children,
  className,
  noteClassName,
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  className?: string;
  /** The note sits 16px in under Settings groups and flush under Search's (as drawn). */
  noteClassName?: string;
}) {
  return (
    <section className={className}>
      {title && <h2 className={`${styles.title} t-caption w-600 c-3`}>{title}</h2>}
      <div className={`${styles.group} squircle`}>{children}</div>
      {note && <p className={`${noteClassName ?? styles.note} t-caption c-3`}>{note}</p>}
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  value?: ReactNode;
  /** A green dot before the value: the account is connected. */
  dot?: boolean;
  /** Where the row leads; a row without `to` or `onClick` only shows information (no chevron). */
  to?: string;
  state?: unknown;
  onClick?: () => void;
  href?: string;
  /** Something laid over the whole row, such as a real <select>. */
  overlay?: ReactNode;
  dotLabel?: string;
}

/**
 * A 48px row with an on/off switch (owner, 2026-11-16: Sound). The whole row is the label, so a
 * tap anywhere on it flips the switch; the switch is a real checkbox, read out as a switch.
 */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className={`${styles.row} ${styles.leads} pressable`}>
      <span className={`${styles.label} t-row`}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={styles.switch}
      />
    </label>
  );
}

/** One 48px row: label, value, chevron when it leads somewhere. */
export function Row({ label, value, dot, to, state, onClick, href, overlay, dotLabel }: RowProps) {
  const leads = Boolean(to || onClick || href || overlay);
  const body = (
    <>
      <span className={`${styles.label} t-row`}>{label}</span>
      {dot && (
        <span className={styles.dot} role="img" aria-label={dotLabel} aria-hidden={!dotLabel} />
      )}
      {value !== undefined && <span className={`${styles.value} t-row c-3 tabular`}>{value}</span>}
      {leads && <Icon name="chevron" size={14} stroke={3} className={styles.chevron} />}
      {overlay}
    </>
  );
  const className = `${styles.row}${leads ? ` ${styles.leads} pressable` : ''}`;
  if (to) {
    return (
      <Link to={to} state={state} className={className}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
