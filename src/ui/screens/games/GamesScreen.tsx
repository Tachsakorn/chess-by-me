import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Color, GameRecord } from '@/contract';
import { useAnalysisQueue } from '@/ui/app/analysisQueue';
import { primaryAccount, useApp } from '@/ui/app/appStore';
import { reviewPath } from '@/ui/app/paths';
import { MiniBoard } from '@/ui/board/MiniBoard';
import { paletteFor } from '@/ui/board/board';
import { Page } from '@/ui/components/Page';
import { Segmented } from '@/ui/components/Segmented';
import { TabBar } from '@/ui/components/TabBar';
import { useLanguage } from '@/ui/i18n/LanguageContext';
import {
  finalPosition,
  sideAccuracy,
  formatMonth,
  groupByTime,
  timeClassOf,
  userSide,
} from '@/ui/model/games';
import { useGameText } from '@/ui/model/useGameText';
import { connectedAccounts, usernameFor } from '@/ui/model/accounts';
import styles from './GamesScreen.module.css';

/** `others`: games opened from Search, a game link or pasted PGN (Fable review A6-06, owner 2026-11-15). */
type Filter = 'all' | 'analyzed' | 'notYet' | 'others';
const PAGE = 20;

export function GamesScreen() {
  const { messages: text, locale } = useLanguage();
  const { loaded, accounts, games, otherGames, summaries, refresh, failed, busy, refreshFromSite } =
    useApp();
  // Every site that failed asked the app to wait: say "try again in a moment" (HTTP 429).
  const onlyBusy = failed.length > 0 && failed.every((site) => busy.includes(site));
  const account = primaryAccount(accounts);
  const username = account?.username ?? '';
  const site = account?.source ?? 'lichess';
  // Both sites connected (owner, 2026-11-15): one list, each row says its site.
  const connected = connectedAccounts(accounts).map((a) => ({
    site: a.source,
    username: a.username,
  }));
  const both = connected.length > 1;
  // No account (a user who only pastes PGN, Fable review 1.1 B4-03): only the games opened.
  const noAccount = loaded && accounts === null;
  const [chosen, setFilter] = useState<Filter>('all');
  const filter: Filter = noAccount ? 'others' : chosen;
  const [shown, setShown] = useState(PAGE);
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const others = filter === 'others';
  const filtered = others
    ? otherGames
    : games.filter((game) =>
        filter === 'all' ? true : game.id in summaries === (filter === 'analyzed'),
      );
  const visible = filtered.slice(0, shown);
  const groups = groupByTime(visible, new Date());
  // Other games are on the device only: nothing to wait for once storage is read.
  const firstLoad =
    !loaded || (!others && games.length === 0 && refresh !== 'done' && refresh !== 'failed');

  // More rows when the end of the list comes into view (20 at a time).
  useEffect(() => {
    const target = end.current;
    if (!target || shown >= filtered.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((n) => n + PAGE);
      },
      { root: list.current, rootMargin: '200px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [shown, filtered.length]);

  const choose = (next: Filter) => {
    setFilter(next);
    setShown(PAGE);
    list.current?.scrollTo({ top: 0 });
  };

  return (
    <Page mode="fixed">
      <header className={styles.header}>
        <h1 className="t-large-title">{text.games.title}</h1>
        <p className={`${styles.sub} t-caption c-3`}>
          {noAccount ? (
            <Link to="/connect" className="inline-action pressable">
              {text.connect.title}
            </Link>
          ) : onlyBusy ? (
            <>
              {`${both ? text.games.accountsLine(connected) : text.games.accountLine(site, username)} · `}
              {/* A real button (Fable review 1.1 B5-04): the update is asked for again. */}
              <button
                type="button"
                className="inline-action pressable"
                onClick={() => void refreshFromSite()}
              >
                {text.games.tryLater}
              </button>
            </>
          ) : both ? (
            failed.length > 0 ? (
              text.games.accountsLineFailed(connected, failed)
            ) : (
              text.games.accountsLine(connected)
            )
          ) : refresh === 'failed' ? (
            text.games.accountLineFailed(site, username)
          ) : (
            text.games.accountLine(site, username)
          )}
        </p>
      </header>
      {!noAccount && (
        <Segmented
          size="large"
          kind="tabs"
          label={text.games.filterLabel}
          value={filter}
          onChange={choose}
          className={styles.filter}
          options={[
            { value: 'all', label: text.games.filter.all, controls: 'games-list' },
            { value: 'analyzed', label: text.games.filter.analyzed, controls: 'games-list' },
            { value: 'notYet', label: text.games.filter.notYet, controls: 'games-list' },
            { value: 'others', label: text.games.filter.others, controls: 'games-list' },
          ]}
        />
      )}
      <div
        id="games-list"
        role={noAccount ? undefined : 'tabpanel'}
        ref={list}
        className={styles.list}
      >
        {firstLoad ? (
          <Skeleton />
        ) : others ? (
          filtered.length === 0 ? (
            <div className={styles.empty}>
              <p className="t-body w-600">{text.games.noOthers}</p>
              <p className="t-caption c-3">{text.games.noOthersHint}</p>
            </div>
          ) : (
            <section>
              <h2 className={`${styles.groupTitle} t-caption w-600 c-3`}>
                {text.games.recentlyOpened}
              </h2>
              {visible.map((game) => (
                <GameRow key={game.id} game={game} username={null} other />
              ))}
            </section>
          )
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className="t-body w-600">
              {games.length === 0 ? text.games.noGames : text.games.nothingHere}
            </p>
            <p className="t-caption c-3">
              {games.length === 0
                ? both
                  ? text.games.noGamesHintBoth
                  : text.games.noGamesHint(site)
                : text.games.tryAnotherFilter}
            </p>
          </div>
        ) : (
          groups.map((group, index) => (
            <section key={group.id} className={index > 0 ? styles.laterGroup : undefined}>
              <h2 className={`${styles.groupTitle} t-caption w-600 c-3`}>
                {group.key.kind === 'thisWeek'
                  ? text.games.thisWeek
                  : group.key.kind === 'lastWeek'
                    ? text.games.lastWeek
                    : formatMonth(group.key.date, locale)}
              </h2>
              {group.games.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  username={usernameFor(game, accounts)}
                  showSite={both}
                />
              ))}
            </section>
          ))
        )}
        <div ref={end} />
      </div>
      <TabBar />
    </Page>
  );
}

/** One game: its last position, how it went, and its accuracy or the way to analyse it. */
export function GameRow({
  game,
  username,
  showSite = false,
  other = false,
}: {
  game: GameRecord;
  username: string | null;
  /** Name the game's site after the title, in small grey letters (both sites connected). */
  showSite?: boolean;
  /**
   * A game of other players (My Games › Others): the players as the title, where it came from in
   * the line below, and both accuracies, since neither side is the user.
   */
  other?: boolean;
}) {
  const text = useLanguage().messages;
  const gameText = useGameText();
  const summary = useApp((state) => state.summaries[game.id]);
  const running = useAnalysisQueue((state) => state.running === game.id);
  const waiting = useAnalysisQueue((state) => state.waiting.includes(game.id));
  const percent = useAnalysisQueue((state) => (state.running === game.id ? state.percent : 0));
  const enqueue = useAnalysisQueue((state) => state.enqueue);
  const { fen, lastMove } = finalPosition(game);
  const side = username ? userSide(game, username) : null;
  const shown = (value: number, of: Color) => sideAccuracy(value, game, of, text.game.noValue);
  const href = reviewPath(game.id);
  const timeClass = timeClassOf(game);
  const title = other
    ? text.game.players(game.white.name, game.black.name)
    : gameText.outcome(game, username);
  const meta = other
    ? text.games.otherMeta(
        timeClass ? text.timeClass[timeClass] : null,
        text.games.from[game.source],
        gameText.date(game),
      )
    : text.games.meta(gameText.opponent(game, username), gameText.date(game));
  const site =
    showSite && (game.source === 'lichess' || game.source === 'chesscom') ? game.source : null;

  return (
    <div className={styles.row}>
      <Link to={href} aria-hidden="true" tabIndex={-1} className={`${styles.thumb} pressable`}>
        <MiniBoard
          fen={fen}
          lastMove={lastMove}
          palette={paletteFor(game.id)}
          className={styles.thumbBoard}
        />
      </Link>
      <Link to={href} className={`${styles.rowText} pressable`}>
        <p className={`${styles.titleLine} t-row w-600`}>
          <span className={styles.ellipsis}>{title}</span>
          {site && <span className={`${styles.site} t-caption c-3`}>{text.sites[site]}</span>}
        </p>
        <p className={`${styles.ellipsis} t-caption c-3`}>{meta}</p>
      </Link>
      {summary ? (
        <div className={styles.accuracy}>
          <p className="t-headline tabular">
            {other
              ? `${shown(summary.white, 'white')} · ${shown(summary.black, 'black')}`
              : side === 'black'
                ? shown(summary.black, 'black')
                : shown(summary.white, 'white')}
          </p>
          <p className="t-caption c-3">{other ? text.games.whiteBlack : text.games.accuracy}</p>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.analyze} t-body w-600 tabular pressable`}
          disabled={running || waiting}
          aria-label={running || waiting ? undefined : text.games.analyzeGame(other ? title : meta)}
          onClick={() => enqueue(game)}
        >
          {running || waiting ? text.games.analyzing(percent) : text.games.analyze}
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.row}>
          <span className={styles.skelBoard} />
          <span className={styles.skelText}>
            <span className={styles.skelLine} />
            <span className={`${styles.skelLine} ${styles.skelShort}`} />
          </span>
        </div>
      ))}
    </div>
  );
}
