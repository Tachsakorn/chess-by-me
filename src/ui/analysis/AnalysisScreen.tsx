import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Chess } from 'chess.js';
import type { Color } from '@/contract';
import { readDepth } from '@/ui/app/analysisDepth';
import { BackButton } from '@/ui/components/BackButton';
import { Icon } from '@/ui/components/Icon';
import { Page } from '@/ui/components/Page';
import { Segmented } from '@/ui/components/Segmented';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { EvalBar } from '@/ui/review/EvalBar';
import { formatScore } from '@/ui/review/model';
import { moveText, numberedLine } from '@/ui/review/panel';
import { ReviewBoard } from '@/ui/review/ReviewBoard';
import { AllMovesPanel, MoveTable, secondLine, toneClass } from '@/ui/review/ReviewPanels';
import { Stepper } from '@/ui/review/Stepper';
import { useWide } from '@/ui/review/useWide';
import { moveSoundKind } from '@/ui/sound/moveSound';
import { playMoveSound } from '@/ui/sound/player';
import review from '@/ui/review/ReviewScreen.module.css';
import { BoardSettingsSheet } from './BoardSettingsSheet';
import {
  boardReducer,
  fenAt,
  movesFromParam,
  movesToParam,
  type Board,
  type BoardAction,
} from './boardLine';
import { useBoardSettings } from './boardSettings';
import { useAnalysisBoard, type BoardView } from './useAnalysisBoard';
import styles from './AnalysisScreen.module.css';

type Tab = 'move' | 'lines' | 'moves';

const KEY_ACTIONS: Record<string, BoardAction> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  Home: 'first',
  End: 'last',
  f: 'flip',
  F: 'flip',
};

function typingInto(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function over(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
}

/** The sound of an action, as on the review screen: one step or a move, never a jump. */
function soundOf(before: Board, after: Board, action: BoardAction, repeat: boolean) {
  if (repeat || (after.ply === before.ply && after.moves === before.moves)) return null;
  const forward = action === 'next' || (typeof action === 'object' && 'play' in action);
  if (forward && after.ply === before.ply + 1) {
    const played = after.moves[after.ply - 1];
    return played ? moveSoundKind(played, over(played.fenAfter)) : null;
  }
  if (action === 'previous') {
    const taken = before.moves[before.ply - 1];
    return taken ? moveSoundKind(taken, false) : null;
  }
  return null;
}

/**
 * The analysis board (owner, 2026-11-26): any moves from the normal start, the engine's lines
 * live, the move labels of the game review. The moves live in the address
 * (`/analysis?moves=e2e4,e7e5`); nothing is saved on the device.
 */
export function AnalysisScreen() {
  const text = useMessages();
  const t = text.analysis;
  const [params, setParams] = useSearchParams();
  const [board, setBoard] = useState<Board>(() => {
    const moves = movesFromParam(params.get('moves'));
    return { moves, ply: moves.length, flipped: false };
  });
  const settings = useBoardSettings();
  const view = useAnalysisBoard(board, settings);
  const wide = useWide();
  const [tab, setTab] = useState<Tab>('move');
  const [sheetOpen, setSheetOpen] = useState(false);

  // The moves go into the address, replacing it, so Back leaves the board in one step.
  const param = movesToParam(board.moves);
  useEffect(() => {
    if ((params.get('moves') ?? '') === param) return;
    setParams(param ? { moves: param } : {}, { replace: true });
  }, [param, params, setParams]);

  const latest = useRef(board);
  useEffect(() => {
    latest.current = board;
  });
  const go = useCallback((action: BoardAction, repeat = false) => {
    const before = latest.current;
    const after = boardReducer(before, action);
    if (after === before) return;
    latest.current = after;
    setBoard(after);
    const sound = soundOf(before, after, action, repeat);
    if (sound) playMoveSound(sound);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingInto(event.target)) return;
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      go(action, event.repeat);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go]);

  const fen = fenAt(board);
  const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const bottom: Color = board.flipped ? 'black' : 'white';
  const lastMove = board.ply > 0 ? (board.moves[board.ply - 1]?.uci ?? null) : null;
  const category =
    board.ply > 0 && settings.labels ? (view.state.reviews[board.ply - 1]?.category ?? null) : null;
  const shownMove = board.moves[board.ply - 1];
  const boardLabel = !shownMove
    ? text.review.boardAt
    : (() => {
        const label = `${shownMove.moveNumber}${shownMove.color === 'white' ? '.' : '...'} ${shownMove.san}`;
        return category
          ? text.review.boardAfterCategory(label, category)
          : text.review.boardAfter(label);
      })();
  const best = view.lines?.position.lines[0]?.uci[0];
  const lastPly = board.moves.length;

  const header = (
    <header className={review.header}>
      <BackButton />
      <h1 className="t-nav-title">{t.title}</h1>
      <button
        type="button"
        aria-label={t.settingsButton}
        aria-haspopup="dialog"
        className={`${styles.settingsButton} pressable`}
        onClick={() => setSheetOpen(true)}
      >
        <Icon name="sliders" size={20} stroke={2.2} />
      </button>
    </header>
  );

  const boardBlock = (
    <>
      <div className={review.boardRow}>
        {settings.evalBar ? (
          <EvalBar position={view.evaluation} bottom={bottom} />
        ) : (
          <span className={styles.noBar} />
        )}
        <ReviewBoard
          fen={fen}
          lastMove={lastMove}
          orientation={bottom}
          palette="blue"
          label={boardLabel}
          ply={board.ply}
          category={category}
          stepped={board.stepped ?? false}
          movable={over(fen) ? null : turn}
          onMove={(uci, on) => {
            if (on === fenAt(latest.current)) go({ play: uci });
          }}
          checking={false}
          arrows={[
            ...(settings.suggestion && best ? [{ uci: best, kind: 'best' as const }] : []),
            ...(settings.threat && view.threat
              ? [{ uci: view.threat, kind: 'threat' as const }]
              : []),
          ]}
        />
      </div>
      <div className={styles.infoRow}>
        <span className={`${styles.opening} t-body w-600`}>
          {board.ply === 0 ? t.startPosition : (view.opening ?? '')}
        </span>
        {view.evaluation && (
          <span className={`${styles.evaluation} t-body w-600 c-2 tabular`}>
            {formatScore(view.evaluation.score)}
          </span>
        )}
      </div>
    </>
  );

  const shown: Tab = wide && tab === 'moves' ? 'move' : tab;
  const details = (
    <>
      <Segmented
        size="small"
        kind="tabs"
        label={t.tabsLabel}
        value={shown}
        onChange={setTab}
        className={review.tabs}
        options={[
          { value: 'move', label: t.tabs.move, controls: 'analysis-panel' },
          { value: 'lines', label: t.tabs.lines, controls: 'analysis-panel' },
          ...(wide
            ? []
            : [{ value: 'moves' as const, label: t.tabs.moves, controls: 'analysis-panel' }]),
        ]}
      />
      <section
        id="analysis-panel"
        role="tabpanel"
        data-tab={shown}
        className={`${review.panel} ${styles.panelScroll} squircle`}
      >
        {shown === 'move' && <MoveTab view={view} board={board} onRetry={view.retry} />}
        {shown === 'lines' && (
          <LinesTab view={view} board={board} onSettings={() => setSheetOpen(true)} />
        )}
        {shown === 'moves' &&
          (lastPly === 0 ? (
            <p className="t-body-lg c-2">{t.noMoves}</p>
          ) : (
            <AllMovesPanel
              game={view.game}
              state={view.state}
              ply={board.ply}
              onGoTo={(ply) => go({ goTo: ply })}
            />
          ))}
      </section>
    </>
  );

  const stepper = (
    <Stepper
      can={{
        first: board.ply > 0,
        previous: board.ply > 0,
        next: board.ply < lastPly,
        last: board.ply < lastPly,
      }}
      onAction={go}
      docked={wide}
    />
  );
  const sheet = <BoardSettingsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />;

  if (wide) {
    // The sheet sits outside the page, so it keeps the app's own side margin.
    return (
      <>
        <Page
          mode="fixed"
          className={`${review.screen} ${review.wide} ${styles.analysis} ${styles.wide ?? ''}`}
        >
          <div className={review.wideBoard}>{boardBlock}</div>
          <div className={review.wideSide}>
            {header}
            {details}
            <MoveTable
              game={view.game}
              state={view.state}
              ply={board.ply}
              onGoTo={(ply) => go({ goTo: ply })}
            />
            {stepper}
          </div>
        </Page>
        {sheet}
      </>
    );
  }
  return (
    <>
      <Page mode="fixed" className={`${review.screen} ${styles.analysis}`}>
        {header}
        <div className={`${review.column} ${styles.column}`}>
          {boardBlock}
          {details}
        </div>
        {stepper}
      </Page>
      {sheet}
    </>
  );
}

/** The move on the board: its label, the evaluation before and after, and what was better. */
function MoveTab({ view, board, onRetry }: { view: BoardView; board: Board; onRetry(): void }) {
  const text = useMessages();
  const t = text.analysis;
  const shown = moveText(view.game, view.state, board.ply);
  const retry = view.failed && (
    <button type="button" className={`${review.retry} t-body-lg pressable`} onClick={onRetry}>
      {t.stopped}
    </button>
  );

  if (shown.kind === 'start') {
    return (
      <>
        <p className="t-body-lg">{t.start}</p>
        {retry}
      </>
    );
  }
  if (shown.kind === 'analyzing') {
    const move = board.moves[board.ply - 1]!;
    return (
      <>
        <div className={review.moveHead}>
          <span className="t-move-title">
            {`${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`}
          </span>
        </div>
        {retry || <p className={`${review.line2} t-body-lg c-2`}>{t.thinking}</p>}
      </>
    );
  }
  const { line2, line3 } = shown;
  const book = shown.category === 'book';
  const next = view.nextInBook;
  return (
    <>
      <div className={review.moveHead}>
        <span className="t-move-title">{shown.label}</span>
        <span className={`${review.badge} t-caption w-600`}>
          <span
            aria-hidden="true"
            className={`${review.qdot} ${toneClass(shown.category, 'fill')}`}
          />
          {text.category[shown.category]}
        </span>
        {shown.evalText && (
          <span className={`${review.eval} t-body w-600 c-3 tabular`}>{shown.evalText}</span>
        )}
      </div>
      <p className={`${review.line2} t-body-lg`}>
        {book ? t.bookMove : secondLine(text.review, line2)}
      </p>
      {book && next.length > 0 && (
        // One line, cut like "Better was", so the panel keeps its height (owner, 2026-11-26).
        <p className={`${review.line3} ${review.ellipsis} t-body-lg c-2`}>
          {t.nextInBook(next.map((san) => numberedLine(board.ply, [san])).join(', '))}
        </p>
      )}
      {!book && line3 && (
        <p className={`${review.line3} ${review.ellipsis} t-body-lg c-2`}>
          {line3.kind === 'better' ? text.review.betterWas : text.review.bestWas}{' '}
          <b className={review.best}>{line3.best}</b>
          {line3.rest && ` ${line3.rest}`}
        </p>
      )}
      {retry}
    </>
  );
}

/** The engine's three lines of the position on the board, as they deepen. */
function LinesTab({
  view,
  board,
  onSettings,
}: {
  view: BoardView;
  board: Board;
  onSettings(): void;
}) {
  const t = useMessages().analysis;
  const settings = useBoardSettings();

  if (!settings.lines) {
    return (
      <>
        <p className="t-body-lg c-2">{t.linesOff}</p>
        <button type="button" className={`${styles.link} t-body-lg pressable`} onClick={onSettings}>
          {t.turnOnInSettings}
        </button>
      </>
    );
  }
  if (view.failed) {
    return (
      <button type="button" className={`${review.retry} t-body-lg pressable`} onClick={view.retry}>
        {t.stopped}
      </button>
    );
  }
  const position = view.lines?.position;
  if (position && position.lines.length === 0) {
    return <p className="t-body-lg c-2">{t.gameOver}</p>;
  }
  return (
    <div className={styles.lines}>
      {!position && <p className="t-body-lg c-2">{t.thinking}</p>}
      {position?.lines.map((line) => {
        const [first, ...rest] = line.san;
        const head = numberedLine(board.ply, [first!]);
        const tail = rest.length ? numberedLine(board.ply + 1, rest) : '';
        return (
          <p key={line.rank} className={`${styles.line} t-body-lg`}>
            <span className={`${styles.score} t-caption w-600 tabular`}>
              {formatScore(line.score)}
            </span>
            <span className={`${styles.moves} c-2`}>
              <b className={styles.first}>{head}</b>
              {tail && ` ${tail}`}
            </span>
          </p>
        );
      })}
      <p className={`${styles.foot} t-caption c-3`}>
        {t.linesFoot(readDepth(), settings.seconds)}{' '}
        <button
          type="button"
          className={`${styles.linkInline} pressable tap-area`}
          onClick={onSettings}
        >
          {t.changeInSettings}
        </button>
      </p>
    </div>
  );
}
