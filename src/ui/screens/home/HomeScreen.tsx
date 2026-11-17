import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { GameAnalysis } from '@/contract';
import { local } from '@/data/local';
import { RATED_CLASSES } from '@/data/ratings';
import { primaryAccount, useApp } from '@/ui/app/appStore';
import { MiniBoard } from '@/ui/board/MiniBoard';
import { paletteFor } from '@/ui/board/board';
import { Icon } from '@/ui/components/Icon';
import { Page } from '@/ui/components/Page';
import { TabBar } from '@/ui/components/TabBar';
import { useLanguage } from '@/ui/i18n/LanguageContext';
import {
  finalPosition,
  sideAccuracy,
  formatToday,
  moveLabel,
  pickContinue,
  positionAt,
  type ContinueCard,
} from '@/ui/model/games';
import { useGameText } from '@/ui/model/useGameText';
import { connectedAccounts, usernameFor } from '@/ui/model/accounts';
import { reviewPath } from '@/ui/app/paths';
import styles from './HomeScreen.module.css';

export function HomeScreen() {
  const { messages: text, locale } = useLanguage();
  const {
    accounts,
    games,
    summaries,
    progress,
    ratings,
    ratingsSite,
    setRatingsSite,
    failed,
    busy,
  } = useApp();
  const list = connectedAccounts(accounts);
  const avatarName = primaryAccount(accounts)?.username ?? '';
  // Whose ratings are shown; with both sites connected a tap switches (owner, 2026-11-15).
  const site = ratingsSite ?? list[0]?.source ?? 'lichess';
  const username = accounts?.[site] ?? '';
  const other = list.find((a) => a.source !== site)?.source ?? null;
  const shownRatings = ratings[site] ?? null;
  const note = busy.includes(site)
    ? text.home.updateBusy
    : failed.includes(site)
      ? text.home.updateFailed
      : text.home.updates;
  const card = pickContinue(games, new Set(Object.keys(summaries)), progress);
  // Two rows when the screen is tall enough (iPad portrait), one row otherwise: the CSS decides.
  const recent = games.slice(0, 6);
  const gameText = useGameText();

  return (
    <Page mode="scrollWhenShort">
      <header className={styles.header}>
        <p className="t-caption w-600 c-3">{formatToday(new Date(), locale)}</p>
        <div className={styles.titleRow}>
          <h1 className="t-large-title">{text.home.title}</h1>
          <Link
            to="/settings"
            aria-label={text.nav.account}
            className={`${styles.avatar} pressable`}
          >
            {avatarName.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>

      {/* Both sites connected: the bar and the line under it switch the site; the bar dims
          while either is pressed (owner, 2026-11-15). */}
      <div className={other ? styles.ratingsBlock : undefined}>
        <section
          aria-label={text.home.ratingsLabel(site)}
          className={`${styles.ratings} ${other ? styles.switchable : ''} squircle`}
        >
          {RATED_CLASSES.map((speed) => {
            const entry = shownRatings?.[speed];
            const change = entry?.rating != null ? entry.change : null;
            const tone =
              change == null || change === 0 ? 'c-3' : change > 0 ? styles.up : styles.down;
            return (
              <div key={speed} className={styles.rating}>
                <p className="t-caption w-600 c-3">{text.timeClass[speed]}</p>
                <p className="t-stat">{entry?.rating ?? text.game.noValue}</p>
                <p className={`t-caption w-600 tabular ${tone}`}>
                  {change == null || change === 0 ? (
                    text.game.noValue
                  ) : (
                    <>
                      <span aria-hidden="true">
                        {change > 0 ? '▲' : '▼'} {Math.abs(change)}
                      </span>
                      <span className="visually-hidden">
                        {change > 0 ? text.home.ratingUp(change) : text.home.ratingDown(-change)}
                      </span>
                    </>
                  )}
                </p>
              </div>
            );
          })}
          {other && (
            // Laid over the whole bar, so the ratings under it are still read out.
            <button
              type="button"
              aria-label={text.home.ratingsSwitch(site, other)}
              className={styles.switch}
              onClick={() => setRatingsSite(other)}
            />
          )}
        </section>
        {other ? (
          // Tappable too; the button on the bar is the one for the keyboard and screen readers,
          // so this line stays plain text for them.
          <p
            className={`${styles.accountLine} ${styles.lineSwitch} t-caption c-3`}
            onClick={() => setRatingsSite(other)}
          >
            {text.sites[site]}
            <Icon name="swap" size={13} stroke={2} className={styles.swapIcon} />
            {text.home.accountLineAfterSite(username, note)}
          </p>
        ) : (
          <p className={`${styles.accountLine} t-caption c-3`}>
            {text.home.accountLine(site, username, note)}
          </p>
        )}
      </div>

      {card && <ContinueSection card={card} />}

      {recent.length > 0 && (
        <section className={styles.section}>
          <div className={styles.recentHead}>
            <h2 className="t-section">
              <Link to="/games">{text.home.recentGames}</Link>
            </h2>
            <Icon name="chevron" size={16} stroke={3} className="c-3" />
          </div>
          <div className={styles.tiles}>
            {recent.map((game, index) => {
              const { fen, lastMove } = finalPosition(game);
              return (
                <Link
                  key={game.id}
                  to={reviewPath(game.id)}
                  className={`${styles.tile} ${index >= 3 ? styles.secondRow : ''} pressable`}
                >
                  <MiniBoard
                    fen={fen}
                    lastMove={lastMove}
                    palette={paletteFor(game.id)}
                    className={styles.tileBoard}
                  />
                  <p className={`${styles.tileTitle} t-body w-600`}>
                    {gameText.outcome(game, usernameFor(game, accounts))}
                  </p>
                  <p className={`${styles.ellipsis} t-caption c-3`}>
                    {gameText.opponent(game, usernameFor(game, accounts))}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <TabBar />
    </Page>
  );
}

function ContinueSection({ card }: { card: ContinueCard }) {
  const text = useLanguage().messages;
  const gameText = useGameText();
  const summary = useApp((state) => state.summaries[card.game.id]);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const { game } = card;

  // The mark after the paused move ("d5?") comes from the saved analysis of that one game.
  useEffect(() => {
    let current = true;
    if (card.kind === 'paused') {
      void local.getAnalysis(game.id).then((found) => current && setAnalysis(found));
    }
    return () => {
      current = false;
    };
  }, [card.kind, game.id]);

  const position = card.kind === 'paused' ? positionAt(game, card.ply) : finalPosition(game);
  const first =
    card.kind === 'paused'
      ? text.home.pausedAt(moveLabel(game, card.ply, analysis?.moves[card.ply - 1]?.category))
      : card.kind === 'latest'
        ? text.home.latestReview
        : text.home.notAnalyzed;

  return (
    <section className={styles.section}>
      <h2 className={`${styles.sectionTitle} t-section`}>{text.home.continue}</h2>
      <Link
        to={reviewPath(game.id)}
        state={card.kind === 'latest' ? { ply: 0 } : undefined}
        className={`${styles.hero} squircle pressable`}
      >
        <MiniBoard
          fen={position.fen}
          lastMove={position.lastMove}
          palette={paletteFor(game.id)}
          className={styles.heroBoard}
        />
        <div className={styles.heroText}>
          <p className={`${styles.heroDim} t-caption`}>{first}</p>
          <p className={`${styles.ellipsis} t-headline`}>
            {text.game.players(game.white.name, game.black.name)}
          </p>
          <p className={`${styles.heroDim} t-body`}>{gameText.ending(game)}</p>
          {summary && card.kind !== 'notAnalyzed' && (
            <p className={`${styles.heroDim} t-body tabular`}>
              {text.game.accuracyPair(
                sideAccuracy(summary.white, game, 'white', text.game.noValue),
                sideAccuracy(summary.black, game, 'black', text.game.noValue),
              )}
            </p>
          )}
        </div>
      </Link>
    </section>
  );
}
