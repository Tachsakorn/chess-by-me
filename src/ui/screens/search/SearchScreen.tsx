import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { GameRecord } from '@/contract';
import { importGames } from '@/data';
import {
  fetchGameByLink,
  openPasted,
  parseGameLink,
  searchPlayers,
  type GameLink,
  type PlayerHit,
} from '@/data/lookup';
import { reviewPath } from '@/ui/app/paths';
import { rememberViewed, saveOpened } from '@/ui/app/viewedGames';
import { BackButton } from '@/ui/components/BackButton';
import { Group } from '@/ui/components/GroupedList';
import { Icon } from '@/ui/components/Icon';
import type { IconName } from '@/ui/components/icons';
import { Page } from '@/ui/components/Page';
import { SettingsButton } from '@/ui/components/SettingsButton';
import { useApp } from '@/ui/app/appStore';
import { TabBar } from '@/ui/components/TabBar';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { GameRow } from '@/ui/screens/games/GamesScreen';
import type { SearchHandover } from '@/ui/screens/open/OpenGameScreen';
import { PgnSheet } from './PgnSheet';
import styles from './SearchScreen.module.css';

type View =
  | { kind: 'start' }
  | { kind: 'busy' }
  | { kind: 'message'; text: string }
  | { kind: 'players'; query: string; lichess: PlayerHit[]; chesscom: PlayerHit[] }
  | { kind: 'player'; player: PlayerHit; games: GameRecord[] | null; failed: boolean }
  /** A Chess.com link that needs a player's name to be found (1.2). */
  | { kind: 'chesscom-name'; link: ChessComLink; text: string };

type ChessComLink = Extract<GameLink, { source: 'chesscom' }>;

/** Searches once typing has paused this long (Fable review A4-01: was 400 ms). */
const DELAY = 800;

export function SearchScreen() {
  const text = useMessages();
  const noAccount = useApp((s) => s.loaded && s.accounts === null);
  const myChessCom = useApp((s) => s.accounts?.chesscom ?? null);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const field = useRef<HTMLInputElement>(null);
  // A Chess.com link handed over by a short address or a share (1.2): shown in the field, and
  // either looked up as if typed, or (`ask`) straight at the name question.
  const handover = location.state as Partial<SearchHandover> | null;
  const handed = typeof handover?.link === 'string' ? parseGameLink(handover.link) : null;
  const [query, setQuery] = useState(handed ? handover!.link! : '');
  const [view, setView] = useState<View>(() =>
    handed?.source === 'chesscom' && typeof handover?.ask === 'string'
      ? { kind: 'chesscom-name', link: handed, text: handover.ask }
      : { kind: 'start' },
  );
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

  /**
   * A Chess.com link (1.2): read through the player the link names, the user's own Chess.com
   * account, and a name typed here, in that order. With none of them, the name is asked for.
   */
  const openChessCom = async (link: ChessComLink, typed = '') => {
    const names = [link.username, typed.trim(), myChessCom].filter(
      (n): n is string => !!n && n.trim() !== '',
    );
    if (names.length === 0) {
      setView({ kind: 'chesscom-name', link, text: text.search.chesscomWho });
      return;
    }
    const mine = ++run.current;
    setView({ kind: 'busy' });
    const result = await fetchGameByLink({ ...link, username: null }, { signal: fresh() }, names);
    if (mine !== run.current) return;
    if (result.ok && result.games[0]) {
      await saveOpened(result.games[0]);
      void navigate(reviewPath(result.games[0].id));
      return;
    }
    const code = result.ok ? 'invalid-pgn' : result.error.code;
    if (code === 'no-games' || code === 'user-not-found') {
      setName('');
      setView({
        kind: 'chesscom-name',
        link,
        text:
          code === 'no-games'
            ? text.search.chesscomNotFound(
                [...new Set(names.map((n) => n.trim()))].join(` ${text.search.and} `),
              )
            : typed.trim()
              ? text.search.chesscomNoPlayer(typed.trim())
              : text.search.chesscomWho,
      });
      return;
    }
    setView({ kind: 'message', text: failureText(code) });
  };

  const openLink = async (value: string) => {
    const link = parseGameLink(value);
    if (!link) return false;
    if (link.source === 'chesscom') {
      await openChessCom(link);
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

  // Searches once typing pauses. Not for the question already on screen when Search opens.
  const askedOnOpen = useRef(view.kind === 'chesscom-name' ? query : null);
  useEffect(() => {
    if (view.kind === 'chesscom-name' && query === askedOnOpen.current) return;
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
    // Judged on the device first: only a game link is fetched, from its own site only, and
    // nothing else on the clipboard ever leaves the device (Fable review A2-01).
    const mine = ++run.current;
    setView({ kind: 'busy' });
    const pasted = await openPasted(clip);
    if (mine !== run.current) return;
    if (pasted.kind === 'chesscom-link') {
      await openChessCom(pasted.link);
      return;
    }
    if (pasted.kind === 'game') {
      await saveOpened(pasted.game);
      void navigate(reviewPath(pasted.game.id));
      return;
    }
    const message = {
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
    // The analysis board (owner, 2026-11-26).
    { icon: 'analysis', title: text.search.analysisBoard, sub: text.search.analysisBoardSub },
  ];
  function act(icon: IconName) {
    if (icon === 'player') field.current?.focus();
    else if (icon === 'link') void pasteLink();
    else if (icon === 'analysis') void navigate('/analysis');
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
        {noAccount ? (
          // Without an account Home is not there: Settings is reached from here (B4-03).
          <div className={styles.titleRow}>
            <h1 className="t-large-title">{text.search.title}</h1>
            <SettingsButton label={text.settings.title} />
          </div>
        ) : (
          <h1 className="t-large-title">{text.search.title}</h1>
        )}
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
        {view.kind === 'chesscom-name' && (
          <form
            className={styles.nameForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) void openChessCom(view.link, name);
            }}
          >
            <p id="chesscom-who" className="t-body c-2">
              {view.text}
            </p>
            <div className={`${styles.field} ${styles.nameField} squircle`}>
              <label htmlFor="chesscom-name" className="visually-hidden">
                {text.search.chesscomName}
              </label>
              <input
                id="chesscom-name"
                value={name}
                placeholder={text.search.chesscomName}
                aria-describedby="chesscom-who"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                className={styles.input}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={name.trim() === ''}
              className={`${styles.findButton} t-headline pressable`}
            >
              {text.search.chesscomFind}
            </button>
          </form>
        )}
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
