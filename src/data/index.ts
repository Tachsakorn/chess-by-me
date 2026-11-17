import type { ImportGames } from '@/contract';
import { fetchChessComGames } from './chesscom';
import { failure } from './errors';
import { fetchLichessGames } from './lichess';
import { isUnsupportedPgn, parsePgn } from './pgn';

export { isUnsupportedPgn, parsePgn, fetchLichessGames, fetchChessComGames };

export interface ImportDeps {
  fetch?: typeof fetch;
}

/** Builds the contract's `ImportGames`; `deps.fetch` lets tests replace the network. */
export function createImportGames(deps: ImportDeps): ImportGames {
  return async (request, signal) => {
    switch (request.source) {
      case 'pgn':
        return parsePgn(request.text);
      case 'lichess':
      case 'chesscom': {
        if (request.username.trim() === '') return failure('user-not-found', 'empty username');
        const fetcher = request.source === 'lichess' ? fetchLichessGames : fetchChessComGames;
        return fetcher(request.username, { fetch: deps.fetch, signal });
      }
    }
  };
}

export const importGames: ImportGames = createImportGames({});
