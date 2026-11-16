import type { GameRecord } from '@/contract';
import { useLanguage } from '@/ui/i18n/LanguageContext';
import { formatShortDate, opponentOf, outcomeFor, timeClassOf } from './games';

/** The words the lists use for a game, in the language in use. */
export function useGameText() {
  const { messages: text, locale } = useLanguage();
  return {
    /** "Win · Blitz"; either half alone when the other is unknown. */
    outcome(game: GameRecord, username: string | null): string {
      const outcome = username ? outcomeFor(game, username) : null;
      const timeClass = timeClassOf(game);
      const left = outcome ? text.game.outcome[outcome] : null;
      const right = timeClass ? text.timeClass[timeClass] : null;
      if (left && right) return text.game.outcomeAndClass(left, right);
      return left ?? right ?? text.game.players(game.white.name, game.black.name);
    },
    opponent(game: GameRecord, username: string | null): string {
      return username
        ? opponentOf(game, username)
        : text.game.players(game.white.name, game.black.name);
    },
    date(game: GameRecord): string {
      return formatShortDate(game.playedAt, locale);
    },
    ending(game: GameRecord): string {
      return text.game.ending(game.result, game.termination);
    },
  };
}
