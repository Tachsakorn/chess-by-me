import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { local } from '@/data/local';
import { fetchGameByLink } from '@/data/lookup';
import { useApp } from '@/ui/app/appStore';
import { linkFromPath, siteUrl } from '@/ui/app/gamePath';
import { reviewPath } from '@/ui/app/paths';
import { saveOpened } from '@/ui/app/viewedGames';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { MessageScreen } from '@/ui/screens/message/MessageScreen';

/** What Search is handed to go on with a Chess.com link (1.2). */
export interface SearchHandover {
  link: string;
  /** Go straight to the name question, with this text, without asking Chess.com again. */
  ask?: string;
}

/**
 * chessby.me/lichess/<id> and chessby.me/chesscom/<id> (1.2): fetches the game as Search does for
 * a pasted link, then takes the review's place in the history, so Back does not return here. A
 * Lichess game already on the device opens without the network. A Chess.com game with no player
 * known (none in the address, no Chess.com account) goes on in Search, where the name is asked.
 */
export function OpenGameScreen() {
  const text = useMessages();
  const location = useLocation();
  const navigate = useNavigate();
  const loaded = useApp((s) => s.loaded);
  const myChessCom = useApp((s) => s.accounts?.chesscom ?? null);
  const link = linkFromPath(location.pathname, location.search);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!link || !loaded) return;
    const controller = new AbortController();
    const toSearch = (handover: SearchHandover) =>
      void navigate('/search', { replace: true, state: handover });
    const open = (id: string) => void navigate(reviewPath(id), { replace: true });
    void (async () => {
      if (link.source === 'lichess') {
        const saved = await local.getGame(`lichess:${link.id}`).catch(() => null);
        if (saved) return open(saved.id);
      }
      const players = link.source === 'chesscom' && myChessCom ? [myChessCom] : [];
      if (link.source === 'chesscom' && !link.username && players.length === 0) {
        return toSearch({ link: siteUrl(link) });
      }
      const result = await fetchGameByLink(link, { signal: controller.signal }, players);
      if (controller.signal.aborted) return;
      const game = result.ok ? result.games[0] : undefined;
      if (game) {
        await saveOpened(game);
        return open(game.id);
      }
      const code = result.ok ? 'invalid-pgn' : result.error.code;
      if (link.source === 'chesscom' && (code === 'no-games' || code === 'user-not-found')) {
        const names = [link.username, ...players].filter(Boolean).join(` ${text.search.and} `);
        return toSearch({
          link: siteUrl(link),
          ask: code === 'no-games' ? text.search.chesscomNotFound(names) : text.search.chesscomWho,
        });
      }
      setFailed(
        code === 'network'
          ? text.search.offline
          : code === 'rate-limited'
            ? text.search.busy
            : text.search.gameNotLoaded,
      );
    })();
    return () => controller.abort();
    // The address alone decides; the text is read when it is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, loaded]);

  if (!link) return <Navigate to="/" replace />;
  const site = text.open.from(link.source);
  if (failed) {
    return (
      <MessageScreen
        title={text.open.failed}
        body={failed}
        action={{ label: text.open.toSearch, onClick: () => void navigate('/search') }}
      />
    );
  }
  return <MessageScreen title={text.open.opening} body={site} />;
}
