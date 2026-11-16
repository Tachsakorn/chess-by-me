/**
 * The cburnett pieces (GPL-2.0-or-later, by Colin M.L. Burnett) exactly as chessground ships
 * them in its own stylesheet, so the still boards and the live board draw the same pieces.
 */
import cburnett from '@lichess-org/chessground/assets/chessground.cburnett.css?raw';

export type PieceCode = `${'w' | 'b'}${'P' | 'N' | 'B' | 'R' | 'Q' | 'K'}`;

const ROLE: Record<string, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
};

function readPieces(css: string): Record<PieceCode, string> {
  const out: Partial<Record<PieceCode, string>> = {};
  const rule = /piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*url\('([^']+)'\)/g;
  for (const [, role, color, url] of css.matchAll(rule)) {
    const letter = role ? ROLE[role] : undefined;
    if (letter && url) out[`${color === 'white' ? 'w' : 'b'}${letter}` as PieceCode] = url;
  }
  return out as Record<PieceCode, string>;
}

export const PIECE_IMAGES = readPieces(cburnett);
