import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Color, GameRecord } from '@/contract';
import type { EngineLoad, Failure } from '@/ui/app/analysisQueue';
import { reloadApp, useAppUpdate } from '@/ui/app/appUpdate';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { sideAccuracy } from '@/ui/model/games';
import type { AnalysisState } from './analysisState';
import { bookRange, listBadge, type Badge } from './badge';
import { BadgeMark } from './BoardBadge';
import { moveRows, moveText, qualityTone, type KeyMoment, type SecondLine } from './panel';
import type { TryText } from './tryPanel';
import styles from './ReviewScreen.module.css';

export const toneClass = (category: Parameters<typeof qualityTone>[0], prefix: 'fill' | 'text') => {
  const tone = qualityTone(category);
  // Book has a dot colour but no text colour (owner, 2026-11-15): no `text-book` class.
  return tone
    ? (styles[`${prefix}-${tone}`] ?? '')
    : prefix === 'fill'
      ? styles['fill-neutral']
      : '';
};

/**
 * On a narrow board the evaluation at the end of the Move panel's first line gives way rather
 * than spill out of the panel. `key` names what the line shows; the ref goes on the line.
 */
function useEvalFit(key: string) {
  const head = useRef<HTMLDivElement>(null);
  const [evalFit, setEvalFit] = useState({ key, hide: false });
  const hide = evalFit.key === key && evalFit.hide;
  useLayoutEffect(() => {
    const element = head.current;
    if (element && !hide && element.scrollWidth > element.clientWidth + 1) {
      setEvalFit({ key, hide: true });
    }
  }, [key, hide]);
  return [head, hide] as const;
}

/**
 * "Analysis didn't finish. Tap to try again.", with the reason's code under it (Fable review 1.1
 * B8-01). When a newer build is on the server (B1-02) a retry would fail the same way: the line
 * says "A new version is ready. Tap to reload" instead.
 */
function RetryLine({ onRetry, failure }: { onRetry(): void; failure?: Failure | null }) {
  const text = useMessages();
  const ready = useAppUpdate((s) => s.ready);
  if (ready) {
    return (
      <button type="button" className={`${styles.retry} t-body pressable`} onClick={reloadApp}>
        {text.update.ready}
      </button>
    );
  }
  return (
    <>
      <button type="button" className={`${styles.retry} t-body pressable`} onClick={onRetry}>
        {text.review.stopped}
      </button>
      {failure && (
        <p className={`${styles.details} t-caption c-2`}>{text.review.details(failure.code)}</p>
      )}
    </>
  );
}

interface MovePanelProps {
  game: GameRecord;
  state: AnalysisState;
  ply: number;
  /** 0..100 while this game is being analysed. */
  percent: number;
  /** The engine being made ready for this game (A8-01, 1.1.1); null otherwise. */
  download: EngineLoad;
  stopped: boolean;
  /** Why the last run failed, when it did. */
  failure?: Failure | null;
  onRetry(): void;
}

/** The move on the board: its category, the evaluation, and what was better (BRIEF-UI 6.2). */
export function MovePanel({
  game,
  state,
  ply,
  percent,
  download,
  stopped,
  failure = null,
  onRetry,
}: MovePanelProps) {
  const text = useMessages();
  const progress =
    download === 'device'
      ? text.review.loadingEngine
      : download !== null
        ? text.review.downloading(download)
        : text.review.analyzing(percent);
  const shown = moveText(game, state, ply);
  const [head, hideEval] = useEvalFit(
    shown.kind === 'move' ? `${shown.label}|${shown.evalText}` : '',
  );

  if (shown.kind === 'start') {
    // The start position says how the analysis is doing too, so a stopped one is seen at once
    // (Fable review A6-03).
    const unfinished = state.phase !== 'done';
    return (
      <>
        <p className="t-body">{text.review.start}</p>
        {unfinished && stopped ? (
          <RetryLine onRetry={onRetry} failure={failure} />
        ) : unfinished ? (
          <p className={`${styles.line2} t-body tabular`}>{progress}</p>
        ) : (
          <>
            <p className={`${styles.line3} t-body c-2`}>{text.review.startHint}</p>
            {/* Analysed: the pieces can be moved (owner, 2026-11-16). */}
            <p className={`${styles.line3} t-body c-2`}>{text.review.tryLine.startHint}</p>
          </>
        )}
      </>
    );
  }
  if (shown.kind === 'analyzing') {
    const move = game.moves[ply - 1]!;
    const label = `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`;
    return (
      <>
        <div className={styles.moveHead}>
          <span className="t-move-title">{label}</span>
        </div>
        {stopped ? (
          <RetryLine onRetry={onRetry} failure={failure} />
        ) : (
          <p className={`${styles.line2} t-body tabular`}>{progress}</p>
        )}
      </>
    );
  }

  const { line2, line3 } = shown;
  return (
    <>
      <div ref={head} className={styles.moveHead}>
        <span className="t-move-title">{shown.label}</span>
        <span className={`${styles.badge} t-caption w-600`}>
          <span
            aria-hidden="true"
            className={`${styles.qdot} ${toneClass(shown.category, 'fill')}`}
          />
          {text.category[shown.category]}
        </span>
        {shown.evalText && !hideEval && (
          <span className={`${styles.eval} t-body w-600 c-3 tabular`}>{shown.evalText}</span>
        )}
      </div>
      {/* No room beside the move (a short screen, where the panel is as narrow as the board):
          the figures take a line of their own, where "Win chance dropped" is left out (1.1.1,
          Fable review 1.1 B6-02). */}
      {shown.evalText && hideEval && (
        <p className={`${styles.evalLine} t-body w-600 c-3 tabular`}>{shown.evalText}</p>
      )}
      <p className={`${styles.line2} ${styles.chance} t-body`}>{secondLine(text.review, line2)}</p>
      {line3 && (
        <p className={`${styles.line3} ${styles.ellipsis} t-body c-2`}>
          {line3.kind === 'better' ? text.review.betterWas : text.review.bestWas}{' '}
          <b className={styles.best}>{line3.best}</b>
          {line3.rest && ` ${line3.rest}`}
        </p>
      )}
    </>
  );
}

/** What the Move panel says of a move of the reader's own line, in words. */
export function tryWords(
  text: ReturnType<typeof useMessages>,
  shown: TryText,
): { second: string | null; third: string | null } {
  const words = text.review.tryLine;
  if (shown.kind === 'failed') return { second: null, third: null };
  if (shown.kind === 'checking') {
    return {
      second: words.checkingMove,
      third: shown.gameMove ? words.gameMoveWas(shown.gameMove) : null,
    };
  }
  const { compare } = shown;
  return {
    second: !compare
      ? null
      : compare.kind === 'same'
        ? words.same
        : compare.kind === 'better'
          ? words.better(compare.gameMove)
          : words.worse(compare.gameMove),
    third: shown.reply ? `${words.bestReply} ${shown.reply}` : null,
  };
}

/**
 * The Move panel for a move of the reader's own line (owner, 2026-11-16): the move with
 * "Checking" while the engine thinks, then its category, the evaluation before and after, how it
 * did against the game move (the first move of the line only) and the engine's best reply.
 */
export function TryPanel({ shown, onRetry }: { shown: TryText; onRetry(): void }) {
  const text = useMessages();
  const { second, third } = tryWords(text, shown);
  const [head, hideEval] = useEvalFit(
    shown.kind === 'result' ? `${shown.label}|${shown.category}|${shown.evalText}` : shown.kind,
  );
  return (
    <>
      <div ref={head} className={styles.moveHead}>
        <span className="t-move-title">{shown.label}</span>
        {shown.kind !== 'failed' && (
          <span className={`${styles.badge} t-caption w-600`}>
            <span
              aria-hidden="true"
              className={`${styles.qdot} ${
                shown.kind === 'result'
                  ? toneClass(shown.category, 'fill')
                  : styles['fill-checking']
              }`}
            />
            {shown.kind === 'result' ? text.category[shown.category] : text.review.tryLine.checking}
          </span>
        )}
        {shown.kind === 'result' && shown.evalText && !hideEval && (
          <span className={`${styles.eval} t-body w-600 c-3 tabular`}>{shown.evalText}</span>
        )}
      </div>
      {shown.kind === 'failed' && <RetryLine onRetry={onRetry} />}
      {second && <p className={`${styles.line2} ${styles.ellipsis} t-body`}>{second}</p>}
      {third && (
        <p
          className={`${second ? styles.line3 : styles.line2} ${styles.tryExtra} ${styles.ellipsis} t-body c-2`}
        >
          {third}
        </p>
      )}
    </>
  );
}

/** The second line of the Move panel, in words. */
export function secondLine(text: ReturnType<typeof useMessages>['review'], line: SecondLine): string {
  switch (line.kind) {
    case 'dropped':
      return text.winDropped(line.percent);
    case 'held':
      return text.winHeld;
    case 'best':
      return text.bestMove;
    case 'book':
      return text.bookMove;
    case 'lost':
      return text.alreadyLost;
    case 'winning':
      return text.stillWinning;
    case 'missedMate':
      return text.missedMate(line.moves);
  }
}

interface SummaryPanelProps {
  game: GameRecord;
  state: AnalysisState;
  moments: readonly KeyMoment[];
  onPick(ply: number): void;
}

/** Both accuracies and up to three turning points (BRIEF-UI 6.2, Summary). */
export function SummaryPanel({ game, state, moments, onPick }: SummaryPanelProps) {
  const text = useMessages();
  const row = useRef<HTMLDivElement>(null);
  const key = moments.map((m) => m.ply).join(',');
  // Fewer chips rather than a second line when they do not fit; counted again for new chips.
  const [fit, setFit] = useState({ key, count: moments.length });
  const count = fit.key === key ? fit.count : moments.length;
  useLayoutEffect(() => {
    const element = row.current;
    if (element && count > 0 && element.scrollWidth > element.clientWidth + 1) {
      setFit({ key, count: count - 1 });
    }
  }, [count, key]);

  const accuracy = (value: number | undefined, side: Color) =>
    sideAccuracy(value, game, side, text.game.noValue);

  return (
    <>
      <div className={styles.accuracies}>
        <div>
          <p className={`${styles.ellipsis} t-caption w-600 c-3`}>
            {text.review.accuracyOf(game.white.name)}
          </p>
          <p className="t-stat">{accuracy(state.white?.accuracy, 'white')}</p>
        </div>
        <div className={styles.accuracyRight}>
          <p className={`${styles.ellipsis} t-caption w-600 c-3`}>
            {text.review.accuracyOf(game.black.name)}
          </p>
          <p className="t-stat">{accuracy(state.black?.accuracy, 'black')}</p>
        </div>
      </div>
      <div ref={row} className={styles.chips}>
        {moments.slice(0, count).map((moment) => (
          <button
            key={moment.ply}
            type="button"
            className={`${styles.chip} t-caption w-700 pressable tap-area`}
            onClick={() => onPick(moment.ply)}
          >
            <span
              aria-hidden="true"
              className={`${styles.qdot} ${toneClass(moment.category, 'fill')}`}
            />
            {moment.label}
          </button>
        ))}
      </div>
    </>
  );
}

interface AllMovesPanelProps {
  game: GameRecord;
  state: AnalysisState;
  ply: number;
  onGoTo(ply: number): void;
}

/** A badge in a move list: the circle with its mark, hidden from screen readers. */
function ListBadge({ badge, className = '' }: { badge: Badge; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.tableBadge} ${styles[`fill-${badge.tone}`] ?? ''} ${className}`}
    >
      <BadgeMark mark={badge.mark} iconClassName={styles.tableIcon} />
    </span>
  );
}

/**
 * Every move, coloured by category; the one on the board stands out (BRIEF-UI 6.2). The notable
 * moves carry their badge in front instead of a mark after (owner, 2026-11-15).
 */
export function AllMovesPanel({ game, state, ply, onGoTo }: AllMovesPanelProps) {
  const text = useMessages();
  const list = useRef<HTMLDivElement>(null);
  const book = bookRange(state.reviews.map((review) => review?.category));

  useEffect(() => {
    const current = list.current?.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  return (
    <div ref={list} className={`${styles.allMoves} t-body tabular`}>
      {game.moves.map((move) => {
        const review = state.reviews[move.ply - 1];
        const badge = review ? listBadge(review.category, move.ply, book) : null;
        const on = move.ply === ply;
        return (
          <Fragment key={move.ply}>
            {move.color === 'white' && (
              <span className={`${styles.moveNumber} c-3`}>{move.moveNumber}.</span>
            )}
            <button
              type="button"
              aria-current={on ? 'true' : undefined}
              className={`${styles.moveItem} ${on ? styles.moveOn : ''} ${review ? toneClass(review.category, 'text') : ''}`}
              onClick={() => onGoTo(move.ply)}
            >
              {badge && <ListBadge badge={badge} className={styles.movesBadge} />}
              {move.san}
              {badge && review && (
                <span className="visually-hidden">, {text.category[review.category]}</span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

interface MoveTableProps {
  game: GameRecord;
  state: AnalysisState;
  ply: number;
  onGoTo(ply: number): void;
}

/**
 * Every move as a table, one full move per row (owner, 2026-11-15): iPad in landscape only, under
 * the Move / Summary panel, always shown. The move on the board stands out and stays in view.
 */
export function MoveTable({ game, state, ply, onGoTo }: MoveTableProps) {
  const text = useMessages();
  const list = useRef<HTMLOListElement>(null);
  const rows = useMemo(() => moveRows(game), [game]);
  const book = bookRange(state.reviews.map((review) => review?.category));

  useEffect(() => {
    const current = list.current?.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const cell = (at: number | null) => {
    if (at === null) return <span />;
    const move = game.moves[at - 1]!;
    const category = state.reviews[at - 1]?.category;
    const badge = category ? listBadge(category, at, book) : null;
    const on = at === ply;
    return (
      <button
        type="button"
        aria-current={on ? 'true' : undefined}
        className={`${styles.tableMove} ${on ? styles.tableOn : ''} tap-area`}
        onClick={() => onGoTo(at)}
      >
        <span className={styles.tableBadgeSlot} aria-hidden="true">
          {badge && <ListBadge badge={badge} />}
        </span>
        {move.san}
        {category && <span className="visually-hidden">, {text.category[category]}</span>}
      </button>
    );
  };

  return (
    <ol
      ref={list}
      aria-label={text.review.tabs.moves}
      className={`${styles.moveTable} squircle t-body-lg tabular`}
    >
      {rows.map((row) => (
        <li key={row.number} className={styles.tableRow}>
          <span className="c-3">{row.number}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </li>
      ))}
    </ol>
  );
}
