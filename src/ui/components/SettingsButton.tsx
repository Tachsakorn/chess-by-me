import { Link } from 'react-router';
import { Icon } from './Icon';
import styles from './SettingsButton.module.css';

/**
 * The way to Settings at the top right (BRIEF-UI: Home's avatar). With an account it shows the
 * account's first letter; without one (a user who only pastes PGN, Fable review 1.1 B4-03) a
 * person outline, on Connect and Search.
 */
export function SettingsButton({
  initial,
  label,
  className = '',
}: {
  initial?: string;
  label: string;
  className?: string;
}) {
  return (
    <Link to="/settings" aria-label={label} className={`${styles.button} pressable ${className}`}>
      {initial ? initial.slice(0, 1).toUpperCase() : <Icon name="player" size={22} stroke={2} />}
    </Link>
  );
}
