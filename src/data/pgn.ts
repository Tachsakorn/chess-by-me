import { Chess } from 'chess.js';
import type {
  GameMove,
  GameRecord,
  GameResult,
  GameSource,
  ImportResult,
  Termination,
  TimeControl,
} from '@/contract';
import { stableId } from './hash';
import { parseTimeControl } from './timeControl';

export type KnownGameFacts = Partial<
  Pick<
    GameRecord,
    'id' | 'source' | 'sourceUrl' | 'playedAt' | 'rated' | 'termination' | 'timeControl'
  >
> & { whiteRating?: number | null; blackRating?: number | null };

const RESULTS: readonly string[] = ['1-0', '0-1', '1/2-1/2', '*'];

function clockFromComment(comment: string | undefined): number | null {
  const m = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment ?? '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

function ratingFrom(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}

function playedAtFrom(headers: Record<string, string | null | undefined>): string | null {
  const date = headers.UTCDate ?? headers.Date;
  if (!date || !/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return null;
  const time = headers.UTCTime ?? '00:00:00';
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  return `${date.replaceAll('.', '-')}T${time}Z`;
}

function terminationFor(final: Chess, result: GameResult, header: string | undefined): Termination {
  if (final.isCheckmate()) return 'checkmate';
  const said = header ?? '';
  // "Time forfeit" is Lichess's wording, "won on time" and "timeout vs insufficient material"
  // are Chess.com's. A game that ended on the clock and is still a draw can only be the
  // flag-against-insufficient-material rule, whatever the final position looks like.
  const onClock = /time forfeit|won on time|timeout/i.test(said);
  if (onClock && result === '1/2-1/2') return 'timeout-vs-insufficient-material';
  // A decisive game can end in any position (resignation, flag), so a position that merely
  // looks drawn only counts when the result is a draw or unknown.
  if (result === '1/2-1/2' || result === '*') {
    if (final.isStalemate()) return 'stalemate';
    if (final.isInsufficientMaterial()) return 'insufficient-material';
    if (final.isThreefoldRepetition()) return 'repetition';
    if (final.isDrawByFiftyMoves()) return 'fifty-move';
  }
  if (onClock) return 'timeout';
  if (/abandon/i.test(said)) return 'abandonment';
  if (result === '1/2-1/2') return 'agreement';
  if (result === '1-0' || result === '0-1') return 'resignation';
  return 'unknown';
}

/**
 * Turns one PGN game into a GameRecord. Returns null for anything that must be skipped:
 * variants, custom start positions, games with no moves, unreadable text.
 */
export function gameFromPgn(pgn: string, known: KnownGameFacts = {}): GameRecord | null {
  const trimmed = pgn.trim();
  if (trimmed === '') return null;

  const loaded = new Chess();
  try {
    loaded.loadPgn(trimmed);
  } catch {
    return null;
  }
  const headers = loaded.getHeaders() as Record<string, string | undefined>;
  const variant = headers.Variant;
  if (variant !== undefined && !/^standard$/i.test(variant.trim())) return null;
  if (headers.FEN !== undefined || headers.SetUp === '1') return null;

  const history = loaded.history({ verbose: true });
  if (history.length === 0) return null;
  const comments = new Map(loaded.getComments().map((c) => [c.fen, c.comment]));

  const timeControl: TimeControl | null =
    known.timeControl !== undefined ? known.timeControl : parseTimeControl(headers.TimeControl);
  const increment = timeControl?.incrementSeconds ?? 0;

  const replay = new Chess();
  const initialFen = replay.fen();
  const lastClock = {
    white: timeControl?.initialSeconds ?? null,
    black: timeControl?.initialSeconds ?? null,
  };
  const moves: GameMove[] = [];
  for (const mv of history) {
    const color = mv.color === 'w' ? 'white' : 'black';
    const fenBefore = replay.fen();
    replay.move(mv.san);
    const fenAfter = replay.fen();
    const clock = clockFromComment(comments.get(fenAfter));
    const before = lastClock[color];
    const spent =
      clock !== null && before !== null ? Math.max(0, before + increment - clock) : null;
    if (clock !== null) lastClock[color] = clock;
    moves.push({
      ply: moves.length + 1,
      moveNumber: Math.floor(moves.length / 2) + 1,
      color,
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion ?? ''),
      fenBefore,
      fenAfter,
      clockSeconds: clock,
      spentSeconds: spent,
    });
  }

  const rawResult = headers.Result ?? '*';
  const result: GameResult = (RESULTS.includes(rawResult) ? rawResult : '*') as GameResult;
  const source: GameSource = known.source ?? 'pgn';
  const event = headers.Event ?? '';
  const rated = /\b(casual|unrated)\b/i.test(event)
    ? false
    : /\brated\b/i.test(event)
      ? true
      : null;

  return {
    id: known.id ?? `pgn:${stableId(trimmed)}`,
    source,
    sourceUrl: known.sourceUrl !== undefined ? known.sourceUrl : null,
    playedAt: known.playedAt !== undefined ? known.playedAt : playedAtFrom(headers),
    white: {
      name: headers.White ?? '?',
      rating: known.whiteRating !== undefined ? known.whiteRating : ratingFrom(headers.WhiteElo),
      title: headers.WhiteTitle ?? null,
    },
    black: {
      name: headers.Black ?? '?',
      rating: known.blackRating !== undefined ? known.blackRating : ratingFrom(headers.BlackElo),
      title: headers.BlackTitle ?? null,
    },
    result,
    termination: known.termination ?? terminationFor(replay, result, headers.Termination),
    timeControl,
    rated: known.rated !== undefined ? known.rated : rated,
    initialFen,
    moves,
    pgn,
  };
}

const HEADER_LINE = /^\s*\[\s*\w+\s+".*"\s*\]\s*$/;

/** Splits pasted text into games: a new game starts at a header line that follows movetext. */
function splitGames(text: string): string[] {
  const chunks: string[][] = [[]];
  let previousWasHeader = false;
  let seenMoveText = false;
  for (const line of text.split(/\r?\n/)) {
    const isHeader = HEADER_LINE.test(line);
    if (isHeader && !previousWasHeader && seenMoveText) {
      chunks.push([]);
      seenMoveText = false;
    }
    if (line.trim() !== '') {
      previousWasHeader = isHeader;
      if (!isHeader) seenMoveText = true;
    }
    chunks[chunks.length - 1]!.push(line);
  }
  return chunks.map((c) => c.join('\n').trim()).filter((c) => c !== '');
}

/**
 * Imports pasted text holding one or many games. Games that cannot be imported (variants,
 * custom start positions, no moves, unreadable) are counted in `skipped`. When nothing at all
 * is importable the result is `invalid-pgn`.
 */
export function parsePgn(text: string): ImportResult {
  const chunks = splitGames(text);
  const games: GameRecord[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const rec = gameFromPgn(chunk);
    if (rec) games.push(rec);
    else skipped++;
  }
  if (games.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid-pgn',
        detail: chunks.length === 0 ? 'empty text' : `no importable game (${skipped} skipped)`,
      },
    };
  }
  return { ok: true, games, skipped };
}
