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
import { validPlayedAt } from './dates';
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
  // "2024.00.00" (day unknown in old collections) or "2024.13.40": no date (Fable review 1.1 B4-04).
  return validPlayedAt(`${date.replaceAll('.', '-')}T${time}Z`);
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

/** The first `[%clk h:mm:ss]` tag of a comment, if any. */
function clockTag(comment: string): string | null {
  return /\[%clk\s+\d+:\d+:\d+(?:\.\d+)?\]/.exec(comment)?.[0] ?? null;
}

/**
 * The move text rewritten in the one form chess.js reads (1.1.1, Fable review 1.1 B5-02): after a
 * move, its NAGs and then at most one comment. Annotated PGN (Lichess's annotated export, studies,
 * engine output) writes several neighbouring comments after a move (`{ Blunder. } { [%eval 2.19]
 * [%clk 0:00:59] }`), a comment after a variation or before a NAG, and `;` comments; chess.js
 * refuses all of these. The app only reads the clock from comments, so every comment is dropped
 * except the first `[%clk]` tag after a move, which is kept as that move's comment. Headers are
 * left as they are.
 */
export function tidyMoveText(pgn: string): string {
  const lines = pgn.split(/\r?\n/);
  let start = 0;
  while (start < lines.length && /^\s*(\[.*\])?\s*$/.test(lines[start] ?? '')) start += 1;
  const head = lines.slice(0, start).join('\n');
  const text = lines.slice(start).join('\n');

  const out: string[] = [];
  /** What follows the last move: its NAGs and the first clock tag of its comments. */
  let afterMove: { nags: string[]; clock: string | null } | null = null;
  const flush = () => {
    if (!afterMove) return;
    out.push(...afterMove.nags);
    if (afterMove.clock) out.push(`{ ${afterMove.clock} }`);
    afterMove = null;
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (/\s/.test(char)) {
      i += 1;
    } else if (char === '{') {
      const end = text.indexOf('}', i + 1);
      const comment = text.slice(i + 1, end === -1 ? text.length : end);
      if (afterMove && !afterMove.clock) afterMove.clock = clockTag(comment);
      i = end === -1 ? text.length : end + 1;
    } else if (char === ';' || (char === '%' && (i === 0 || text[i - 1] === '\n'))) {
      // A comment to the end of the line, or an escaped line.
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end + 1;
    } else if (char === '$') {
      const nag = /^\$\d+/.exec(text.slice(i))?.[0] ?? '$';
      if (afterMove) afterMove.nags.push(nag);
      i += nag.length;
    } else if (char === '(' || char === ')') {
      flush();
      out.push(char);
      i += 1;
    } else {
      flush();
      const word = /^[^\s{}();$]+/.exec(text.slice(i))?.[0] ?? char;
      out.push(word);
      // A move number ("12." or "12...") or a result has nothing of its own after it.
      const isMove = !/^\d+\.*$/.test(word) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(word);
      afterMove = isMove ? { nags: [], clock: null } : null;
      i += word.length;
    }
  }
  flush();
  return `${head}\n\n${out.join(' ')}`.trim();
}

function readPgn(text: string): Chess | null {
  const chess = new Chess();
  try {
    chess.loadPgn(text);
    return chess;
  } catch {
    return null;
  }
}

/**
 * Turns one PGN game into a GameRecord. Returns null for anything that must be skipped:
 * variants, custom start positions, games with no moves, unreadable text.
 */
export function gameFromPgn(pgn: string, known: KnownGameFacts = {}): GameRecord | null {
  const trimmed = pgn.trim();
  if (trimmed === '') return null;

  // Annotated PGN is read again with its comments tidied (B5-02). Text that chess.js reads as it
  // is never goes that way, so nothing changes for it.
  const loaded = readPgn(trimmed) ?? readPgn(tidyMoveText(trimmed));
  if (!loaded) return null;
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

/** The value of one header tag of a PGN game, read from its text (null when absent). */
function headerValue(chunk: string, tag: string): string | null {
  const match = new RegExp(String.raw`^\s*\[${tag}\s+"([^"]*)"\s*\]`, 'm').exec(chunk);
  return match ? (match[1] ?? '') : null;
}

/**
 * True when nothing in the text can be opened and at least one game in it is a variant or starts
 * from a position of its own (Fable review A1-06): the user is then told it is not supported yet,
 * not that the PGN is unreadable. Read from the headers, since a variant's moves (a Crazyhouse
 * drop) may not even parse.
 */
export function isUnsupportedPgn(text: string): boolean {
  if (parsePgn(text).ok) return false;
  return splitGames(text).some((chunk) => {
    const variant = headerValue(chunk, 'Variant');
    if (variant !== null && !/^standard$/i.test(variant.trim())) return true;
    return headerValue(chunk, 'FEN') !== null || headerValue(chunk, 'SetUp') === '1';
  });
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
