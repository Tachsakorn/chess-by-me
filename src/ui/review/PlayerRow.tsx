import type { Color, PlayerInfo } from '@/contract';
import { useMessages } from '@/ui/i18n/LanguageContext';
import styles from './ReviewScreen.module.css';

interface PlayerRowProps {
  side: Color;
  player: PlayerInfo;
  /** "8:21"; null when the game has no clocks. */
  clock: string | null;
}

/** A side's dot, title, name, rating and the time it had left at this move (BRIEF-UI 6.2). */
export function PlayerRow({ side, player, clock }: PlayerRowProps) {
  const text = useMessages().review;
  return (
    <div className={styles.player}>
      <span className={`${styles.who} t-body w-600`}>
        <span aria-hidden="true" className={side === 'black' ? styles.dotBlack : styles.dotWhite} />
        <span className="visually-hidden">{side === 'black' ? text.black : text.white}</span>
        <span className={styles.name}>
          {player.title && <span className={styles.title}>{player.title} </span>}
          {player.name}
        </span>
        {player.rating !== null && <span className="w-400 c-3 tabular">{player.rating}</span>}
      </span>
      {clock && <span className={`${styles.clock} t-body w-600 tabular`}>{clock}</span>}
    </div>
  );
}
