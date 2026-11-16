import { NavLink } from 'react-router';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { Icon } from './Icon';
import type { IconName } from './icons';
import styles from './TabBar.module.css';

const TABS: { to: string; icon: IconName; key: 'home' | 'games' | 'courses' | 'search' }[] = [
  { to: '/', icon: 'home', key: 'home' },
  { to: '/games', icon: 'games', key: 'games' },
  { to: '/courses', icon: 'courses', key: 'courses' },
  { to: '/search', icon: 'search', key: 'search' },
];

/** The floating glass menu (BRIEF-UI 5.2). Only the Home icon fills when chosen, as drawn. */
export function TabBar() {
  const text = useMessages().nav;
  return (
    <nav aria-label={text.mainMenu} className={styles.bar}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => `${styles.tab} pressable${isActive ? ` ${styles.on}` : ''}`}
        >
          {({ isActive }) => (
            <>
              <Icon name={tab.icon} size={22} stroke={2} filled={isActive && tab.icon === 'home'} />
              <span className="t-tab">{text[tab.key]}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
