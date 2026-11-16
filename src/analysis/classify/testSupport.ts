/**
 * Helpers for the tests in this folder: hand-built evaluations around a real,
 * legal move. Not used by product code.
 */
import { Chess } from 'chess.js';
import type { Color, EngineLine, GameMove, GameRecord, PositionEval, Score } from '@/contract';
import { expectedPoints } from './expectedPoints';
import type { MoveContext } from './great';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const cp = (value: number): Score => ({ kind: 'cp', value });
export const mate = (moves: number, winner: Color): Score => ({ kind: 'mate', moves, winner });
export const over = (winner: Color | null): Score => ({ kind: 'over', winner });

/** A GameMove for `uci` played in `fen`; throws when the move is not legal there. */
export function moveFrom(fen: string, uci: string, ply = 1): GameMove {
  const board = new Chess(fen);
  const color: Color = board.turn() === 'w' ? 'white' : 'black';
  const played = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    san: played.san,
    uci,
    fenBefore: fen,
    fenAfter: board.fen(),
    clockSeconds: null,
    spentSeconds: null,
  };
}

/**
 * A PositionEval with the given line scores, rank 1 first. Each line starts with
 * the UCI move given for it, or with any legal move (never `options.avoid`) when
 * none is given.
 */
export function position(
  fen: string,
  ply: number,
  lines: ReadonlyArray<{ score: Score; uci?: string }>,
  options: { avoid?: string } = {},
): PositionEval {
  const first = lines[0];
  if (!first || first.score.kind === 'over') {
    const score = first?.score ?? over(null);
    return {
      ply,
      fen,
      score,
      whiteExpected: expectedPoints(score),
      depth: 0,
      lines: [],
      source: 'rules',
    };
  }
  const legal = new Chess(fen).moves({ verbose: true });
  const spare = legal.filter(
    (candidate) =>
      candidate.lan !== options.avoid && !lines.some((line) => line.uci === candidate.lan),
  );
  const engineLines: EngineLine[] = lines.map((line, index) => {
    const move = line.uci ? legal.find((candidate) => candidate.lan === line.uci) : spare.shift();
    if (!move) throw new Error(`no legal move for line ${index + 1} in ${fen}`);
    return { rank: index + 1, score: line.score, uci: [move.lan], san: [move.san] };
  });
  return {
    ply,
    fen,
    score: first.score,
    whiteExpected: expectedPoints(first.score),
    depth: 18,
    lines: engineLines,
    source: 'engine',
  };
}

/**
 * Everything the special-category rules look at for one move: the move, the
 * evaluation before it (the played move is the first line; `second` is the
 * score of the second line, if any) and the evaluation after it.
 */
export function context(
  fen: string,
  uci: string,
  scores: { first: Score; second?: Score; after: Score },
): MoveContext {
  const move = moveFrom(fen, uci);
  const lines = [{ score: scores.first, uci }];
  return {
    move,
    before: position(fen, 0, scores.second ? [...lines, { score: scores.second }] : lines),
    after: position(move.fenAfter, 1, [{ score: scores.after }]),
  };
}

/** A game record holding the given moves played from `initialFen`; the rest is filler. */
export function gameFrom(ucis: readonly string[], initialFen = START_FEN): GameRecord {
  const moves: GameMove[] = [];
  let fen = initialFen;
  for (const uci of ucis) {
    const move = moveFrom(fen, uci, moves.length + 1);
    moves.push(move);
    fen = move.fenAfter;
  }
  return {
    id: 'pgn:test',
    source: 'pgn',
    sourceUrl: null,
    playedAt: null,
    white: { name: 'White', rating: null, title: null },
    black: { name: 'Black', rating: null, title: null },
    result: '*',
    termination: 'unknown',
    timeControl: null,
    rated: null,
    initialFen,
    moves,
    pgn: '',
  };
}

/**
 * Evaluations for every position of `game` with the given scores (index 0 = the
 * initial position). A position gets two lines with the same score, or one line
 * when it has a single legal move, or none when the game is over there. The
 * first line is the move actually played only for the plies listed in
 * `playedIsFirstChoice` (and where there is no other legal move).
 */
export function positionsFor(
  game: GameRecord,
  scores: readonly Score[],
  playedIsFirstChoice: readonly number[] = [],
): PositionEval[] {
  if (scores.length !== game.moves.length + 1) throw new Error('one score per position, please');
  return scores.map((score, index) => {
    const fen = index === 0 ? game.initialFen : (game.moves[index - 1]?.fenAfter ?? '');
    const next = game.moves[index];
    if (!next) return position(fen, index, [{ score }]);
    const legalCount = new Chess(fen).moves().length;
    if (playedIsFirstChoice.includes(next.ply) || legalCount === 1) {
      const lines = [{ score, uci: next.uci }];
      return position(fen, index, legalCount > 1 ? [...lines, { score }] : lines);
    }
    return position(fen, index, [{ score }, { score }], { avoid: next.uci });
  });
}
