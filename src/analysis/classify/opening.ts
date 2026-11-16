/**
 * Opening book lookup by position.
 *
 * Data: src/analysis/classify/openings.json, built by scripts/build-openings.mjs
 * from https://github.com/lichess-org/chess-openings (CC0-1.0). Matching by
 * position rather than by move order means transpositions are recognised.
 * See docs/sources/classification.md.
 */
import { Chess } from 'chess.js';
import type { OpeningInfo } from '@/contract';

/** Named opening positions keyed by EPD (the first four fields of a FEN). */
export type OpeningBook = Record<string, [eco: string, name: string]>;

/** Loads the book on demand, so the app only pays for it when a game is analysed. */
export async function loadOpeningBook(): Promise<OpeningBook> {
  const module = await import('./openings.json');
  return module.default as unknown as OpeningBook;
}

/**
 * The opening of a game, from the FEN after each of its moves (index 0 = after
 * ply 1). `lastBookPly` is the highest ply whose position is in the book, and
 * the name and ECO code are those of that position. Null when no position of
 * the game is in the book.
 */
export function findOpening(
  book: OpeningBook,
  fensAfterEachMove: readonly string[],
): OpeningInfo | null {
  for (let index = fensAfterEachMove.length - 1; index >= 0; index--) {
    const fen = fensAfterEachMove[index];
    if (fen === undefined) continue;
    const entry = book[toEpd(fen)];
    if (entry) return { eco: entry[0], name: entry[1], lastBookPly: index + 1 };
  }
  return null;
}

/**
 * The book's keys are written by chess.js, which names the en passant square
 * only when a pawn can really capture there. A FEN that names it after every
 * double step is respelled the same way before the lookup.
 */
function toEpd(fen: string): string {
  let fields = fen.trim().split(/\s+/);
  if (fields[3] !== undefined && fields[3] !== '-') {
    try {
      fields = new Chess(fen).fen().split(' ');
    } catch {
      // Not a FEN chess.js accepts: look it up as written.
    }
  }
  return fields.slice(0, 4).join(' ');
}
