import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { GameRecord } from '@/contract';
import { importGames } from '@/data';
import {
  fetchGameByLink,
  openPasted,
  parseGameLink,
  searchPlayers,
  type PlayerHit,
} from '@/data/lookup';
import { reviewPath } from '@/ui/app/paths';
import { rememberViewed, saveOpened } from '@/ui/app/viewedGames';
import { BackButton } from '@/ui/components/BackButton';
import { Group } from '@/ui/components/GroupedList';
import { Icon } from '@/ui/components/Icon';
import type { IconName } from '@/ui/components/icons';
import { Page } from '@/ui/components/Page';
import { TabBar } from '@/ui/components/TabBar';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { GameRow } from '@/ui/screens/games/GamesScreen';
import { PgnSheet } from './PgnSheet';
import styles from './SearchScreen.module.css';

type View =
  | { kind: 'start' }
  | { kind: 'busy' }
  | { kind: 'message'; text: string }
  | { kind: 'players'; query: string; lichess: PlayerHit[]; chesscom: PlayerHit[] }
  | { kind: 'player'; player: PlayerHit; games: GameRecord[] | null; failed: boolean };

/** Searches once typing has paused this long (Fable review A4-01: was 400 ms). */
const DELAY = 800;

export function SearchScreen() {
  const text = useMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'start' });
  const [sheet, setSheet] = useState(
    () => (location.state as { pgn?: boolean } | null)?.pgn === true,
  );
  const run = useRef(0);
  /** The requests of the search on screen; a new search cancels them (Fable review A4-01). */
  const requests = useRef<AbortController | null>(null);
  const fresh = () => {
    requests.current?.abort();
    requests.current = new AbortController();
    return requests.current.signal;
  };
  const failureText = (code: string) =>
    code === 'rate-limited'
      ? text.search.busy
      : code === 'network'
        ? text.search.offline
        : text.search.gameNotLoaded;

  const openLink = async (value: string) => {
    const link = parseGameLink(value);
    if (!link) return false;
    if (link.source === 'chesscom') {
      setView({ kind: 'message', text: text.search.chesscomLink });
      return true;
    }
    const mine = ++run.current;
    setView({ kind: 'busy' });
    const result = await fetchGameByLink(link, { signal: fresh() });
    if (mine !== run.current) return true;
    if (!result.ok || !result.games[0]) {
      setView({
        kind: 'message',
        text: failureText(result.ok ? 'invalid-pgn' : result.error.code),
      });
      return true;
    }
    await saveOpened(result.games[0]);
    void navigate(reviewPath(result.games[0].id));
    return true;
  };

  const search = async (value: string) => {
    const term = value.trim();
    if (term === '') return setView({ kind: 'start' });
    if (await openLink(term)) return;
    const mine = ++run.current;
    setView({ kind: 'busy' });
    const result = await searchPlayers(term, { signal: fresh() });
    if (mine !== run.current) return;
    if (!result.ok) {
      return setView({
        kind: 'message',
        text: result.error.code === 'rate-limited' ? text.search.busy : text.search.offline,
      });
    }
    if (result.lichess.length + result.chesscom.length === 0) {
      return setView({ kind: 'message', text: text.search.noPlayer(term) });
    }
    setView({ kind: 'players', query: term, ...result });
  };

  // Searches once typing pauses.
  useEffect(() => {
    if (view.kind === 'player') return;
    const timer = window.setTimeout(() => void search(query), DELAY);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const showPlayer = async (player: PlayerHit) => {
    const mine = ++run.current;
    setView({ kind: 'player', player, games: null, failed: false });
    const result = await importGames({ source: player.source, username: player.username }, fresh());
    if (mine !== run.current) return;
    // Kept in memory; a game is saved on the device only when it is opened (A6-02).
    if (result.ok) rememberViewed(result.games);
    setView({
      kind: 'player',
      player,
      games: result.ok ? result.games : [],
      failed: !result.ok && result.error.code !== 'no-games',
    });
  };

  const pasteLink = async () => {
    let clip = '';
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      // reading the clipboard was refused: let the user paste into the field
    }
    if (clip.trim() === '') {
      field.current?.focus();
      return;
    }
    // Judged on the device first: only a Lichess game link is fetched, from Lichess only, and
    // nothing else on the clipboard ever leaves the device (Fable review A2-01).
    const mine = ++run.current;
    setView({ kind: 'busy' });
    const pasted = await openPasted(clip);
    if (mine !== run.current) return;
    if (pasted.kind === 'game') {
      await saveOpened(pasted.game);
      void navigate(reviewPath(pasted.game.id));
      return;
    }
    const message = {
      'chesscom-link': text.search.chesscomLink,
      'not-a-game': text.search.notAGameLink,
      failed:
        pasted.kind === 'failed' && pasted.error.code === 'network'
          ? text.search.offline
          : text.search.gameNotLoaded,
    }[pasted.kind];
    setView({ kind: 'message', text: message });
  };

  const actions: { icon: IconName; title: string; sub: string }[] = [
    { icon: 'player', title: text.search.findPlayer, sub: text.search.findPlayerSub },
    { icon: 'link', title: text.search.pasteLink, sub: text.search.pasteLinkSub },
    { icon: 'pgn', title: text.search.pastePgn, sub: text.search.pastePgnSub },
  ];
  function act(icon: IconName) {
    if (icon === 'player') field.current?.focus();
    else if (icon === 'link') void pasteLink();
    else setSheet(true);
  }

  return (
    <Page mode="fixed">
      <header className={styles.header}>
        {view.kind === 'player' && (
          <div className={styles.back}>
            <BackButton onBack={() => void search(query)} />
          </div>
        )}
        <h1 className="t-large-title">{text.search.title}</h1>
      </header>
      <form
        role="search"
        className={`${styles.field} squircle`}
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <Icon name="search" size={18} stroke={2.4} className={styles.fieldIcon} />
        <label htmlFor="q" className="visually-hidden">
          {text.search.fieldLabel}
        </label>
        <input
          ref={field}
          id="q"
          type="search"
          value={query}
          placeholder={text.search.placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          className={styles.input}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className={styles.body} aria-live="polite">
        {view.kind === 'start' && (
          <section className={styles.start}>
            <h2 className={`${styles.sectionTitle} t-section`}>{text.search.reviewAny}</h2>
            <Group note={text.search.publicNote} noteClassName={styles.publicNote}>
              {actions.map((action) => (
                <button
                  key={action.icon}
                  type="button"
                  className={`${styles.action} pressable`}
                  onClick={() => act(action.icon)}
                >
                  <span aria-hidden="true" className={styles.actionIcon}>
                    <Icon name={action.icon} size={20} stroke={2} />
                  </span>
                  <span className={styles.actionText}>
                    <span className="t-row w-600">{action.title}</span>
                    <span className="t-caption c-3">{action.sub}</span>
                  </span>
                  <Icon name="chevron" size={14} stroke={3} className={styles.chevron} />
                </button>
              ))}
            </Group>
          </section>
        )}
        {view.kind === 'busy' && (
          <p className={`${styles.message} t-body c-2`}>{text.search.searching}</p>
        )}
        {view.kind === 'message' && <p className={`${styles.message} t-body c-2`}>{view.text}</p>}
        {view.kind === 'players' && (
          <div className={styles.results}>
            {(['lichess', 'chesscom'] as const).map((site) =>
              view[site].length > 0 ? (
                <section key={site} className={styles.resultGroup}>
                  <h2 className={`${styles.groupTitle} t-caption w-600 c-3`}>{text.sites[site]}</h2>
                  {view[site].map((player) => (
                    <button
                      key={player.username}
                      type="button"
                      className={`${styles.playerRow} pressable`}
                      onClick={() => void showPlayer(player)}
                    >
                      <span className="t-row w-600">
                        {player.title && <span className={styles.title}>{player.title} </span>}
                        {player.username}
                      </span>
                      <Icon name="chevron" size={14} stroke={3} className={styles.chevron} />
                    </button>
                  ))}
                </section>
              ) : null,
            )}
          </div>
        )}
        {view.kind === 'player' && (
          <div className={styles.results}>
            <h2 className={`${styles.groupTitle} t-caption w-600 c-3`}>
              {text.games.accountLine(view.player.source, view.player.username)}
            </h2>
            {view.games === null ? (
              <p className={`${styles.message} t-body c-2`}>{text.search.searching}</p>
            ) : view.games.length === 0 ? (
              <p className={`${styles.message} t-body c-2`}>
                {view.failed ? text.search.offline : text.games.noGames}
              </p>
            ) : (
              view.games.map((game) => (
                <GameRow key={game.id} game={game} username={view.player.username} />
              ))
            )}
          </div>
        )}
      </div>
      <TabBar />
      <PgnSheet open={sheet} onClose={() => setSheet(false)} />
    </Page>
  );
}
