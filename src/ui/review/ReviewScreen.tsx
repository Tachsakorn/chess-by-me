import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { GameRecord } from '@/contract';
import { local } from '@/data/local';
import { readDepth } from '@/ui/app/analysisDepth';
import { useAnalysisQueue } from '@/ui/app/analysisQueue';
import { useApp } from '@/ui/app/appStore';
import { ErrorScreen } from '@/ui/app/ErrorScreen';
import { loadCurrentAnalysis } from '@/ui/app/savedAnalysis';
import { saveOpened, viewedGame } from '@/ui/app/viewedGames';
import { usernameFor } from '@/ui/model/accounts';
import { BackButton } from '@/ui/components/BackButton';
import { ConfirmSheet } from '@/ui/components/ConfirmSheet';
import { Icon } from '@/ui/components/Icon';
import { Page } from '@/ui/components/Page';
import { Segmented } from '@/ui/components/Segmented';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { boardSide, moveLabel } from '@/ui/model/games';
import { initialAnalysisState, stateFromAnalysis, type AnalysisState } from './analysisState';
import { reanalysis, type Reanalysis } from './depthChoice';
import { EvalGraph } from './EvalGraph';
import { clockAt, formatClock } from './model';
import { keyMoments } from './panel';
import { PlayerRow } from './PlayerRow';
import { EvalBar } from './EvalBar';
import { ReviewBoard } from './ReviewBoard';
import {
  AllMovesPanel,
  MovePanel,
  MoveTable,
  SummaryPanel,
  TryPanel,
  tryWords,
} from './ReviewPanels';
import { Stepper } from './Stepper';
import { boardPosition } from './tryLine';
import { tryText } from './tryPanel';
import { useReviewActions, useReviewPosition } from './useReviewNavigation';
import { useTryLine } from './useTryLine';
import { useWide } from './useWide';
import styles from './ReviewScreen.module.css';

type Loaded =
  | { id: string; game: GameRecord | null; saved: AnalysisState | null; failed?: false }
  | { id: string; failed: true }
  | null;

/** Loads the game of the address (and its saved analysis), then shows it. */
export function ReviewScreen() {
  // The router has already decoded the id (decoding it twice broke /review/%25, A3-02).
  const { gameId: id = '' } = useParams();
  const [loaded, setLoaded] = useState<Loaded>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      let game = useApp.getState().games.find((g) => g.id === id) ?? (await local.getGame(id));
      // A game of another player listed in Search is saved now that it is opened (A6-02).
      const listed = game ? null : viewedGame(id);
      if (listed) {
        await saveOpened(listed);
        game = listed;
      }
      // An analysis made under older labelling rules is rebuilt from its own evaluations (1.1.1,
      // Fable review 1.1 B2-01); one that cannot be rebuilt is analysed again, at once.
      const analysis = game ? await loadCurrentAnalysis(game) : null;
      const saved = game && analysis ? stateFromAnalysis(game, analysis) : null;
      if (current) setLoaded({ id, game, saved });
    })().catch(() => {
      // Storage that cannot be read even when opened again: the normal error state, never a
      // blank page (Fable review 1.1 B4-05).
      if (current) setLoaded({ id, failed: true });
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (!loaded || loaded.id !== id) return null;
  if (loaded.failed) return <ErrorScreen />;
  if (!loaded.game) return <Navigate to="/" replace />;
  return <ReviewView key={loaded.game.id} game={loaded.game} saved={loaded.saved} />;
}

type Panel = 'move' | 'summary' | 'moves';

function ReviewView({ game, saved }: { game: GameRecord; saved: AnalysisState | null }) {
  const text = useMessages();
  const location = useLocation();
  const navigate = useNavigate();
  // The user's name in this game: the account of the site it came from (owner, 2026-11-15).
  const username = usernameFor(
    game,
    useApp((s) => s.accounts),
  );
  const progress = useApp((s) => s.progress[game.id]);
  const saveProgress = useApp((s) => s.saveProgress);
  const live = useAnalysisQueue((s) => s.live[game.id]);
  const running = useAnalysisQueue((s) => s.running === game.id);
  const percent = useAnalysisQueue((s) => (s.running === game.id ? s.percent : 0));
  const download = useAnalysisQueue((s) => (s.running === game.id ? s.download : null));
  // The finished analysis stays on screen even after the queue lets go of it (A8-03).
  const [finished, setFinished] = useState<AnalysisState | null>(null);
  if (live?.phase === 'done' && finished !== live) setFinished(live);
  const failed = useAnalysisQueue((s) => s.failed.includes(game.id));
  const failure = useAnalysisQueue((s) => (s.failed.includes(game.id) ? s.errors[game.id] : null));
  const enqueue = useAnalysisQueue((s) => s.enqueue);
  // Analysing again from the depth pill (1.2): from then on the saved result is not shown, only
  // the new run (then its finished result).
  const [fresh, setFresh] = useState(false);
  const [again, setAgain] = useState<{ open: boolean; plan: Reanalysis | null }>({
    open: false,
    plan: null,
  });
  const lastPly = game.moves.length;
  const wide = useWide();

  const requested = (location.state as { ply?: number } | null)?.ply;
  const [nav, dispatch] = useReviewPosition(game, {
    ply: requested ?? progress?.ply ?? 0,
    flipped: progress?.flipped ?? false,
  });
  const [panel, setPanel] = useState<Panel>('move');

  // Not analysed yet: start at once, ahead of anything else in line (BRIEF-UI 6.2).
  useEffect(() => {
    if (!saved && !failed) enqueue(game, { first: true });
    // Only when the screen opens; a failed run waits for the reader to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, saved]);

  // Where the reader is, kept for the Continue card of Home.
  useEffect(() => {
    saveProgress(game.id, { ply: nav.ply, flipped: nav.flipped, at: Date.now() });
  }, [game.id, nav.ply, nav.flipped, saveProgress]);

  const state = (fresh ? null : saved) ?? finished ?? live ?? initialAnalysisState(game);
  const moments = useMemo(() => keyMoments(game, state, 3), [game, state]);

  // A line of the reader's own (owner, 2026-11-16): only once the whole game is analysed.
  const analysed = state.phase === 'done';
  const line = analysed ? nav.line : null;
  const tried = useTryLine(game, state, line);
  const lineIndex = line ? line.at - 1 : -1;
  const lineMove = line?.moves[lineIndex];
  const lineEval = tried.evals[lineIndex];
  const lineReview = tried.reviews[lineIndex] ?? null;
  const replyUci = lineEval?.lines[0]?.uci[0];
  const go = useReviewActions(
    game,
    nav,
    dispatch,
    lineMove && replyUci ? { uci: replyUci, on: lineMove.fenAfter } : null,
  );
  const lineText = line
    ? tryText({
        game,
        state,
        line,
        evals: tried.evals,
        review: lineReview,
        compare: tried.compare,
        failed: tried.failed,
      })
    : null;
  const userBottom = boardSide(game, username);
  const bottom = nav.flipped ? (userBottom === 'white' ? 'black' : 'white') : userBottom;
  const top = bottom === 'white' ? 'black' : 'white';
  const { fen, lastMove, turn } = boardPosition(game, { ...nav, line });
  const clock = (side: 'white' | 'black') => {
    const seconds = clockAt(game, side, nav.ply);
    return seconds === null ? null : formatClock(seconds);
  };
  const category = lineMove
    ? (lineReview?.category ?? null)
    : nav.ply > 0
      ? (state.reviews[nav.ply - 1]?.category ?? null)
      : null;
  const shownMove = lineMove
    ? `${lineMove.moveNumber}${lineMove.color === 'white' ? '.' : '...'} ${lineMove.san}`
    : moveLabel(game, nav.ply);
  const boardLabel =
    !lineMove && nav.ply === 0
      ? text.review.boardAt
      : category
        ? text.review.boardAfterCategory(shownMove, category)
        : text.review.boardAfter(shownMove);
  const checking = lineText?.kind === 'checking';
  // What a screen reader is told when the line's move is checked and when its result is in.
  const lineWords = lineText ? tryWords(text, lineText) : null;
  const spoken = !lineText
    ? ''
    : lineText.kind === 'failed'
      ? text.review.stopped
      : [
          lineText.label,
          lineText.kind === 'result' ? text.category[lineText.category] : null,
          lineWords?.second,
          lineWords?.third,
        ]
          .filter(Boolean)
          .join('. ');

  const header = (
    <header className={styles.header}>
      <BackButton />
      <h1 className="t-nav-title">{text.review.title}</h1>
      {/* The depth of this analysis (1.2): once it is done, a tap offers to analyse again. */}
      {state.depth === undefined ? (
        <span />
      ) : state.phase === 'done' ? (
        <button
          type="button"
          aria-label={text.review.depth.pillButton(state.depth)}
          className={`${styles.depthPill} t-caption w-600 tabular pressable tap-area`}
          onClick={() => setAgain({ open: true, plan: reanalysis(state.depth!, readDepth()) })}
        >
          {text.review.depth.pill(state.depth)}
        </button>
      ) : (
        <span className={`${styles.depthPill} t-caption w-600 tabular`}>
          {text.review.depth.pill(state.depth)}
        </span>
      )}
    </header>
  );
  const plan = again.plan;
  const sheet = plan && (
    <ConfirmSheet
      open={again.open}
      title={
        plan.kind === 'same'
          ? text.review.depth.sameTitle(plan.depth)
          : text.review.depth.againTitle(plan.to)
      }
      body={
        plan.kind === 'same'
          ? text.review.depth.sameBody
          : [
              text.review.depth.againBody(plan.from),
              plan.slow ? text.settings.depthSlow(plan.to) : '',
            ]
              .filter(Boolean)
              .join(' ')
      }
      confirmLabel={plan.kind === 'same' ? text.review.depth.openSettings : text.review.depth.again}
      cancelLabel={text.review.depth.cancel}
      tone="primary"
      onCancel={() => setAgain({ open: false, plan })}
      onConfirm={() => {
        setAgain({ open: false, plan });
        if (plan.kind === 'same') {
          navigate('/settings');
          return;
        }
        setFresh(true);
        setFinished(null);
        enqueue(game, { first: true });
      }}
    />
  );
  const boardBlock = (
    <>
      <PlayerRow side={top} player={game[top]} clock={clock(top)} />
      <div className={styles.boardRow}>
        <EvalBar position={lineMove ? lineEval : state.positions[nav.ply]} bottom={bottom} />
        <ReviewBoard
          fen={fen}
          lastMove={lastMove}
          orientation={bottom}
          // Always blue on the review screen; only the small boards take the game's colours
          // (owner, 2026-11-15).
          palette="blue"
          label={boardLabel}
          ply={lineMove ? lineMove.ply : nav.ply}
          category={category}
          stepped={nav.stepped ?? false}
          // The side to move can try a move, once the game is analysed.
          movable={analysed ? turn : null}
          onMove={(uci, on) => go({ play: uci, on })}
          checking={checking}
        />
      </div>
      <PlayerRow side={bottom} player={game[bottom]} clock={clock(bottom)} />
    </>
  );
  // iPad in landscape shows the move table all the time, so its tabs are Move and Summary only.
  const shown: Panel = wide && panel === 'moves' ? 'move' : panel;
  const details = (
    <>
      <EvalGraph
        positions={state.positions}
        lastPly={lastPly}
        ply={nav.ply}
        moments={moments}
        onGoTo={(ply) => go({ goTo: ply })}
        faded={line !== null}
      />
      {line ? (
        <div className={styles.tryBar}>
          <span className={`${styles.tryTitle} t-caption w-600 c-2`}>
            {text.review.tryLine.title(line.moves[0]!.moveNumber)}
          </span>
          <button
            type="button"
            className={`${styles.tryBack} t-caption w-600 pressable`}
            onClick={() => go('exit')}
          >
            <Icon name="back" size={13} stroke={2.6} />
            {text.review.tryLine.back}
          </button>
        </div>
      ) : (
        <Segmented
          size="small"
          kind="tabs"
          label={text.review.tabsLabel}
          value={shown}
          onChange={setPanel}
          className={styles.tabs}
          options={[
            { value: 'move', label: text.review.tabs.move, controls: 'review-panel' },
            { value: 'summary', label: text.review.tabs.summary, controls: 'review-panel' },
            ...(wide
              ? []
              : [
                  {
                    value: 'moves' as const,
                    label: text.review.tabs.moves,
                    controls: 'review-panel',
                  },
                ]),
          ]}
        />
      )}
      <section
        id="review-panel"
        role={line ? 'group' : 'tabpanel'}
        aria-label={line ? text.review.tryLine.title(line.moves[0]!.moveNumber) : undefined}
        data-tab={line ? 'try' : shown}
        className={`${styles.panel} squircle`}
      >
        {/* Always here, so that what it comes to say is read out (owner, 2026-11-16). */}
        <p className="visually-hidden" aria-live="polite" data-try-result="">
          {spoken}
        </p>
        {lineText && <TryPanel shown={lineText} onRetry={tried.retry} />}
        {!lineText && shown === 'move' && (
          <MovePanel
            game={game}
            state={state}
            ply={nav.ply}
            percent={running ? percent : 0}
            download={download}
            stopped={failed}
            failure={failure}
            onRetry={() => enqueue(game, { first: true })}
          />
        )}
        {!lineText && shown === 'summary' && (
          <SummaryPanel
            game={game}
            state={state}
            moments={moments}
            onPick={(ply) => {
              go({ goTo: ply });
              setPanel('move');
            }}
          />
        )}
        {!lineText && shown === 'moves' && (
          <AllMovesPanel
            game={game}
            state={state}
            ply={nav.ply}
            onGoTo={(ply) => go({ goTo: ply })}
          />
        )}
      </section>
    </>
  );
  const stepper = (
    <Stepper
      // In a line: back always (to the game in the end), on to its next move or the engine's
      // best reply once that is known, and to either end of the game.
      can={
        line
          ? {
              first: true,
              previous: true,
              next: line.at < line.moves.length || replyUci !== undefined,
              last: true,
            }
          : {
              first: nav.ply > 0,
              previous: nav.ply > 0,
              next: nav.ply < lastPly,
              last: nav.ply < lastPly,
            }
      }
      onAction={go}
      docked={wide}
    />
  );

  // iPad in landscape (BRIEF-UI section 4): the board on the left, everything else in a 390px
  // column on the right, the step bar at its foot instead of floating.
  if (wide) {
    return (
      <Page mode="fixed" className={`${styles.screen} ${styles.wide}`}>
        <div className={styles.wideBoard}>{boardBlock}</div>
        <div className={styles.wideSide}>
          {header}
          {sheet}
          {details}
          <MoveTable
            game={game}
            state={state}
            // No move of the game is on the board while a line is.
            ply={line ? -1 : nav.ply}
            onGoTo={(ply) => go({ goTo: ply })}
          />
          {stepper}
        </div>
      </Page>
    );
  }
  return (
    <Page mode="fixed" className={styles.screen}>
      {header}
      {sheet}
      <div className={styles.column}>
        {boardBlock}
        {details}
      </div>
      {stepper}
    </Page>
  );
}
