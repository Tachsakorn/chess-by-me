import { useNavigate } from 'react-router';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { Icon } from './Icon';
import styles from './BackButton.module.css';

/**
 * The grey round back button (BRIEF-UI 5.1): goes back in the history, or Home when the page
 * was opened directly.
 */
export function BackButton({ onBack }: { onBack?: () => void } = {}) {
  const navigate = useNavigate();
  const label = useMessages().nav.back;
  const goBack = () => {
    if (onBack) return onBack();
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) void navigate(-1);
    else void navigate('/', { replace: true });
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`${styles.back} pressable`}
      onClick={goBack}
    >
      <Icon name="back" size={18} stroke={2.6} />
    </button>
  );
}
