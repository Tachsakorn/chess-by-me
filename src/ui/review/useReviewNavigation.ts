import { useCallback, useEffect, useReducer, useRef, type Dispatch } from 'react';
import type { GameRecord } from '@/contract';
import { soundFor } from '@/ui/sound/moveSound';
import { playMoveSound } from '@/ui/sound/player';
import type { ReviewNavigation } from './model';
import { reviewNavigate, type ReviewAction, type ReviewPosition } from './tryLine';

const KEY_ACTIONS: Record<string, ReviewAction> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  Home: 'first',
  End: 'last',
  f: 'flip',
  F: 'flip',
  // Out of a line of the reader's own, back to the game (owner, 2026-11-16).
  Escape: 'exit',
};

function typingInto(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Where the reader is: in the game, or in a line of their own that left it. */
export function useReviewPosition(game: GameRecord, initial: Partial<ReviewNavigation> = {}) {
  return useReducer(
    (current: ReviewPosition, action: ReviewAction) => reviewNavigate(current, action, game),
    { ply: initial.ply ?? 0, flipped: initial.flipped ?? false, line: null },
    (start) => reviewNavigate(start, { goTo: start.ply }, game),
  );
}

/** The engine's best reply to the position on the board (`on`, its FEN), when it is known. */
export type BestReply = { uci: string; on: string } | null;

/**
 * What the step bar and the keyboard do, with the keyboard shortcuts of the whole screen: left
 * and right arrows, Home, End, F to flip the board, Escape to leave a line.
 *
 * "Next" at the end of a line plays the engine's best reply; it does nothing while that is not
 * known.
 *
 * Every action goes through here, moves made on the board too, so each one makes its sound
 * (src/ui/sound/moveSound.ts). `repeat`: the action repeats by itself (a held step button or
 * arrow key), which stays silent.
 */
export function useReviewActions(
  game: GameRecord,
  state: ReviewPosition,
  dispatch: Dispatch<ReviewAction>,
  bestReply: BestReply,
) {
  const latest = useRef({ game, state, bestReply });
  useEffect(() => {
    latest.current = { game, state, bestReply };
  });

  const go = useCallback(
    (wanted: ReviewAction, repeat = false) => {
      const { line } = latest.current.state;
      let action = wanted;
      if (action === 'next' && line && line.at >= line.moves.length) {
        const reply = latest.current.bestReply;
        if (!reply) return;
        action = { play: reply.uci, on: reply.on };
      }
      const before = latest.current.state;
      const after = reviewNavigate(before, action, latest.current.game);
      const sound = soundFor(latest.current.game, before, after, action, repeat);
      // Known at once, so a quick second step starts from where the first one went.
      latest.current = { ...latest.current, state: after };
      dispatch(action);
      if (sound) playMoveSound(sound);
    },
    [dispatch],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingInto(event.target)) return;
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      // Escape is the screen's only while a line is on the board.
      if (action === 'exit' && !latest.current.state.line) return;
      event.preventDefault();
      go(action, event.repeat);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go]);

  return go;
}
