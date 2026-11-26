import type { GameLink } from '@/data/lookup';

/**
 * The app's own short game addresses (1.2): chessby.me/lichess/<id>, chessby.me/chesscom/<id>
 * (a live game) and chessby.me/chesscom/daily/<id>, with an optional ?username= naming a Chess.com
 * player. Each opens the game as its Lichess or Chess.com link would. Null when the address is
 * not one of them.
 */
export function linkFromPath(pathname: string, search = ''): GameLink | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'lichess' && parts.length === 2) {
    const id = parts[1]!;
    return /^[A-Za-z0-9]{8}([A-Za-z0-9]{4})?$/.test(id)
      ? { source: 'lichess', id: id.slice(0, 8) }
      : null;
  }
  if (parts[0] === 'chesscom') {
    const [kind, id] = parts.length === 2 ? ['live', parts[1]!] : [parts[1], parts[2]];
    if (parts.length > 3 || (kind !== 'live' && kind !== 'daily') || !id || !/^\d+$/.test(id)) {
      return null;
    }
    const username = new URLSearchParams(search).get('username')?.trim() || null;
    return { source: 'chesscom', id, kind, username };
  }
  return null;
}

/** The app's short address of a game (the reverse of linkFromPath). */
export function pathOf(link: GameLink): string {
  if (link.source === 'lichess') return `/lichess/${link.id}`;
  const query = link.username ? `?username=${encodeURIComponent(link.username)}` : '';
  return `${link.kind === 'daily' ? '/chesscom/daily/' : '/chesscom/'}${link.id}${query}`;
}

/** The game's address on its own site, for Search to open as if it were pasted. */
export function siteUrl(link: GameLink): string {
  if (link.source === 'lichess') return `https://lichess.org/${link.id}`;
  const query = link.username ? `?username=${encodeURIComponent(link.username)}` : '';
  return `https://www.chess.com/game/${link.kind}/${link.id}${query}`;
}
