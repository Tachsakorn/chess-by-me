import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildAnalysis } from '@/analysis';
import { expectedPoints } from '@/analysis/classify';
import type { GameAnalysis, GameRecord, Score } from '@/contract';
import { initialAnalysisState, stateFromAnalysis } from './analysisState';
import { keyMoments, moveRows, moveText, numberedLine, qualityTone } from './panel';

function load(folder: string) {
  const root = fileURLToPath(new URL(`../../../fixtures/${folder}/`, import.meta.url));
  const game = JSON.parse(readFileSync(`${root}game.json`, 'utf8')) as GameRecord;
  const analysis = JSON.parse(readFileSync(`${root}analysis-lite.json`, 'utf8')) as GameAnalysis;
  return { game, analysis, state: stateFromAnalysis(game, analysis) };
}
/**
 * A fixture with some positions' scores replaced (the first line's too), rebuilt the way the app
 * builds an analysis. For cases the rules must handle that today's evaluations of the game no
 * longer produce (the engine method changed on 2026-11-15, speed round).
 */
function withScores(folder: string, scores: Record<number, { score: Score; best?: string }>) {
  const { game, analysis } = load(folder);
  const positions = analysis.positions.map((position) => {
    const patch = scores[position.ply];
    if (!patch) return position;
    const { score, best } = patch;
    const [first, ...rest] = position.lines;
    if (!first) return { ...position, score, whiteExpected: expectedPoints(score) };
    // `best`: the engine's first choice as it was then (one move, its SAN from the position).
    const san = best ? new Chess(position.fen).move(best).san : null;
    const line = best && san ? { ...first, score, uci: [best], san: [san] } : { ...first, score };
    return { ...position, score, whiteExpected: expectedPoints(score), lines: [line, ...rest] };
  });
  const rebuilt = buildAnalysis({ ...analysis, game, positions });
  return { game, state: stateFromAnalysis(game, rebuilt) };
}
// The lite analyses, as the app makes them (fixtures/*/analysis-lite.json).
const rosen = load('lichess-LAGvRNey');
const blitz = load('lichess-f6WkG3uO');

describe('numberedLine', () => {
  it('numbers a line as a scoresheet does', () => {
    expect(numberedLine(15, ['Nh6', 'Bxh6', 'gxh6'])).toBe('8... Nh6 9. Bxh6 gxh6');
    expect(numberedLine(14, ['h3', 'Nh6'])).toBe('8. h3 Nh6');
  });
});

describe('moveText', () => {
  it('says the game has not started at position 0', () => {
    expect(moveText(rosen.game, rosen.state, 0)).toEqual({ kind: 'start' });
  });

  it('describes a mistake: chances lost and the better line, two plies on', () => {
    const review = blitz.analysis.moves.find((m) => m.category === 'mistake')!;
    const ply = review.ply;
    const text = moveText(blitz.game, blitz.state, ply);
    const before = blitz.analysis.positions[ply - 1]!;
    const [best, ...rest] = before.lines[0]!.san;
    expect(text).toMatchObject({
      kind: 'move',
      category: 'mistake',
      line2: { kind: 'dropped', percent: Math.floor(review.pointLoss * 100 + 1e-9) },
      line3: {
        kind: 'better',
        best: numberedLine(ply - 1, [best!]),
        rest: numberedLine(ply, rest.slice(0, 2)),
      },
    });
    expect(text.kind === 'move' && text.label).toMatch(/\?$/);
    expect(text.kind === 'move' && text.evalText).toMatch(/^[+−]?\d+\.\d → [+−]?\d+\.\d$/);
  });

  it('says a best move is the best move, with no third line', () => {
    const ply = rosen.analysis.moves.find((m) => m.category === 'best')!.ply;
    expect(moveText(rosen.game, rosen.state, ply)).toMatchObject({
      line2: { kind: 'best' },
      line3: null,
    });
  });

  it('says a book move is a book move', () => {
    expect(moveText(rosen.game, rosen.state, 1)).toMatchObject({
      category: 'book',
      line2: { kind: 'book' },
      line3: null,
    });
  });

  it('shows a good move as holding, and names the best move when another was played', () => {
    const goods = rosen.analysis.moves.filter(
      (m) => (m.category === 'excellent' || m.category === 'good') && !m.playedIsBest,
    );
    expect(goods.length).toBeGreaterThan(0);
    for (const review of goods) {
      const percent = Math.floor(review.pointLoss * 100 + 1e-9);
      expect(moveText(rosen.game, rosen.state, review.ply)).toMatchObject({
        line2: percent >= 1 ? { kind: 'dropped', percent } : { kind: 'held' },
        line3: { kind: 'bestWas', rest: '' },
      });
    }
  });

  it('says the move is still being analysed while its review has not arrived', () => {
    expect(moveText(rosen.game, initialAnalysisState(rosen.game), 16)).toEqual({
      kind: 'analyzing',
    });
  });
});

describe('keyMoments', () => {
  it('picks the three biggest swings, in the order of the game', () => {
    const moments = keyMoments(rosen.game, rosen.state, 3);
    expect(moments).toHaveLength(3);
    const plies = moments.map((m) => m.ply);
    expect([...plies].sort((a, b) => a - b)).toEqual(plies);
    const swing = (ply: number) =>
      Math.abs(
        rosen.analysis.positions[ply]!.whiteExpected -
          rosen.analysis.positions[ply - 1]!.whiteExpected,
      );
    const smallest = Math.min(...plies.map(swing));
    const others = rosen.analysis.moves.filter((m) => !plies.includes(m.ply));
    for (const move of others) expect(swing(move.ply)).toBeLessThanOrEqual(smallest);
  });

  it('labels each with its move and mark', () => {
    for (const moment of keyMoments(rosen.game, rosen.state, 3)) {
      expect(moment.label).toMatch(/^\d+\.(\.\.)? \S+$/);
    }
  });
});

describe('qualityTone', () => {
  it('colours only the categories that have a colour', () => {
    expect(qualityTone('mistake')).toBe('mistake');
    expect(qualityTone('miss')).toBe('miss');
    // Owner, 2026-11-15 (second design): Best, Excellent and Good have colours too.
    expect(qualityTone('best')).toBe('best');
    expect(qualityTone('excellent')).toBe('excellent');
    expect(qualityTone('good')).toBe('good');
    // Book has its own brown since the board badges (owner, 2026-11-15).
    expect(qualityTone('book')).toBe('book');
  });
});

describe('moveRows', () => {
  it('puts one full move per row: number, White, Black', () => {
    const rows = moveRows(rosen.game);
    expect(rows[0]).toEqual({ number: 1, white: 1, black: 2 });
    expect(rows[1]).toEqual({ number: 2, white: 3, black: 4 });
    expect(rows).toHaveLength(Math.ceil(rosen.game.moves.length / 2));
  });

  it('leaves Black empty when White made the last move', () => {
    // 85 plies: the last row has White's 43rd move only.
    expect(rosen.game.moves).toHaveLength(85);
    expect(moveRows(rosen.game).at(-1)).toEqual({ number: 43, white: 85, black: null });
  });

  it('leaves White empty when the game starts with Black to move', () => {
    const fromBlack = {
      ...rosen.game,
      moves: rosen.game.moves.slice(1).map((move) => ({ ...move, ply: move.ply - 1 })),
    };
    expect(moveRows(fromBlack)[0]).toEqual({ number: 1, white: null, black: 1 });
    expect(moveRows(fromBlack)[1]).toEqual({ number: 2, white: 2, black: 3 });
  });
});

// Owner, 2026-11-15 (rule c): no "Win chance dropped 0%". Under 1%, say what the position is.
describe('moveText: under 1%, and a missed mate', () => {
  const bullet = load('lichess-HKl8S22m');

  // The scores of the app's earlier analysis of this game (+18.0, then White mates in 3).
  it('says the game was already lost (34...Bg7: Black had 0.18%)', () => {
    const lost = withScores('lichess-f6WkG3uO', {
      67: { score: { kind: 'cp', value: 1800 }, best: 'h8h7' },
      68: { score: { kind: 'mate', moves: 3, winner: 'white' } },
    });
    const text = moveText(lost.game, lost.state, 68);
    expect(text).toMatchObject({ kind: 'move', category: 'good', line2: { kind: 'lost' } });
  });

  // The scores of the app's earlier analysis of this game (Black mates in 11, then in 12).
  it('says the mover is still winning (34...Bxc4: Black was certain to win)', () => {
    const winning = withScores('lichess-HKl8S22m', {
      67: { score: { kind: 'mate', moves: 11, winner: 'black' }, best: 'f7h5' },
      68: { score: { kind: 'mate', moves: 12, winner: 'black' } },
    });
    const text = moveText(winning.game, winning.state, 68);
    expect(text).toMatchObject({ kind: 'move', line2: { kind: 'winning' } });
  });

  it('names the missed mate (28...Qxg1+: mate in 1 was there)', () => {
    const text = moveText(bullet.game, bullet.state, 56);
    expect(text).toMatchObject({ category: 'miss', line2: { kind: 'missedMate', moves: 1 } });
  });

  it('never says a 0% drop', () => {
    for (const { game, state } of [rosen, blitz, bullet]) {
      for (let ply = 1; ply <= game.moves.length; ply += 1) {
        const text = moveText(game, state, ply);
        if (text.kind === 'move' && text.line2.kind === 'dropped') {
          expect(text.line2.percent).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

// Fable review 1.1 B3-01: rounding made a Good move read "dropped 5%" (a 4.5–5% loss), next to a
// label that says it stayed under the Inaccuracy line. The text rounds down, so it never crosses
// a line the label did not cross.
describe('moveText: the percentage is rounded down', () => {
  const ply = rosen.analysis.moves.find((m) => m.category === 'good' && !m.playedIsBest)!.ply;
  const withLoss = (category: 'good' | 'inaccuracy' | 'mistake' | 'blunder', pointLoss: number) => {
    const reviews = rosen.state.reviews.map((review, index) =>
      index === ply - 1 && review ? { ...review, category, pointLoss } : review,
    );
    const text = moveText(rosen.game, { ...rosen.state, reviews }, ply);
    return text.kind === 'move' && text.line2.kind === 'dropped' ? text.line2.percent : null;
  };

  it.each([
    ['good', 0.0499, 4],
    ['good', 0.046, 4],
    ['inaccuracy', 0.05, 5],
    ['inaccuracy', 0.0999, 9],
    ['mistake', 0.1, 10],
    ['mistake', 0.1999, 19],
    ['blunder', 0.2, 20],
    ['blunder', 0.29, 29],
    ['blunder', 0.57, 57],
  ] as const)('%s with a loss of %f reads %i%%', (category, loss, shown) => {
    expect(withLoss(category, loss)).toBe(shown);
  });

  it('never reads 5% for a Good move, 10% for an Inaccuracy or 20% for a Mistake', () => {
    const limit = { good: 5, inaccuracy: 10, mistake: 20 } as const;
    for (const { game, state } of [rosen, blitz, load('lichess-HKl8S22m')]) {
      for (let p = 1; p <= game.moves.length; p += 1) {
        const text = moveText(game, state, p);
        if (text.kind !== 'move' || text.line2.kind !== 'dropped') continue;
        const max = limit[text.category as keyof typeof limit];
        if (max !== undefined) expect(text.line2.percent).toBeLessThan(max);
      }
    }
  });
});
