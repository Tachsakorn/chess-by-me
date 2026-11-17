import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cp, position } from '@/analysis/classify/testSupport';
import type { GameAnalysis, GameRecord, MoveReview } from '@/contract';
import { stateFromAnalysis } from './analysisState';
import { reviewNavigate, type ReviewPosition } from './tryLine';
import { tryText } from './tryPanel';

const read = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as T;
const game = read<GameRecord>('game.json');
const state = stateFromAnalysis(game, read<GameAnalysis>('analysis-lite.json'));
// In this analysis 8... d5 is an Inaccuracy (it gives up 6.3%; Good before the 0.05 line of
// 2026-11-17), so the game move is written with its mark.

const start: ReviewPosition = { ply: 15, flipped: false, line: null };
const play = (...ucis: string[]) =>
  ucis.reduce((current, uci) => reviewNavigate(current, { play: uci }, game), start).line!;

const review = (ply: number, category: MoveReview['category']): MoveReview => ({
  ply,
  category,
  pointLoss: 0,
  accuracy: 100,
  playedIsBest: category === 'best',
  best: null,
  tags: [],
});

describe('tryText', () => {
  it('while the engine thinks: the move, and the game move it replaces', () => {
    const line = play('g4h6');
    expect(
      tryText({
        game,
        state,
        line,
        evals: [undefined],
        review: null,
        compare: null,
        failed: false,
      }),
    ).toEqual({ kind: 'checking', label: '8... Nh6', gameMove: '8... d5?!' });
  });

  it('the result of the first move: category, evaluation, the game move and the best reply', () => {
    const line = play('g4h6');
    const after = position(line.moves[0]!.fenAfter, 16, [{ score: cp(124), uci: 'c1h6' }]);
    // The reply's line as the engine gives it: 9. Bxh6 gxh6 and more.
    after.lines[0] = {
      ...after.lines[0]!,
      uci: ['c1h6', 'g7h6', 'd1d4'],
      san: ['Bxh6', 'gxh6', 'Qxd4'],
    };
    expect(
      tryText({
        game,
        state,
        line,
        evals: [after],
        review: review(16, 'best'),
        compare: 'better',
        failed: false,
      }),
    ).toEqual({
      kind: 'result',
      label: '8... Nh6',
      category: 'best',
      // Before: the game analysis's evaluation of the position the line left from.
      evalText: '+1.2 → +1.2',
      compare: { kind: 'better', gameMove: '8... d5?!' },
      reply: '9. Bxh6 gxh6',
    });
  });

  it('marks the move as the game does', () => {
    const line = play('g4f2');
    const after = position(line.moves[0]!.fenAfter, 16, [{ score: cp(420) }]);
    const text = tryText({
      game,
      state,
      line,
      evals: [after],
      review: review(16, 'blunder'),
      compare: 'worse',
      failed: false,
    });
    expect(text).toMatchObject({
      kind: 'result',
      label: '8... Nxf2??',
      evalText: '+1.2 → +4.2',
      compare: { kind: 'worse', gameMove: '8... d5?!' },
    });
  });

  it('a later move of the line: no comparison, the evaluation before is the line’s own', () => {
    const line = play('g4h6', 'c1h6');
    const first = position(line.moves[0]!.fenAfter, 16, [{ score: cp(124), uci: 'c1h6' }]);
    const second = position(line.moves[1]!.fenAfter, 17, [{ score: cp(131), uci: 'g7h6' }]);
    expect(
      tryText({
        game,
        state,
        line,
        evals: [first, second],
        review: review(17, 'best'),
        compare: 'better', // of the first move: not this one's
        failed: false,
      }),
    ).toEqual({
      kind: 'result',
      label: '9. Bxh6',
      category: 'best',
      evalText: '+1.2 → +1.3',
      compare: null,
      reply: '9... gxh6',
    });
    // While it is being checked, no game move is named either.
    expect(
      tryText({
        game,
        state,
        line,
        evals: [first, undefined],
        review: null,
        compare: null,
        failed: false,
      }),
    ).toEqual({ kind: 'checking', label: '9. Bxh6', gameMove: null });
  });

  it('describes the move on the board, not the last move of the line', () => {
    const line = { ...play('g4h6', 'c1h6'), at: 1 };
    const first = position(line.moves[0]!.fenAfter, 16, [{ score: cp(124), uci: 'c1h6' }]);
    const text = tryText({
      game,
      state,
      line,
      evals: [first, undefined],
      review: review(16, 'best'),
      compare: 'better',
      failed: false,
    });
    expect(text).toMatchObject({ kind: 'result', label: '8... Nh6', compare: { kind: 'better' } });
  });

  it('has no best reply when the move ends the game', () => {
    const line = play('g4h6');
    const over = position(line.moves[0]!.fenAfter, 16, [
      { score: { kind: 'over', winner: 'black' } },
    ]);
    const text = tryText({
      game,
      state,
      line,
      evals: [over],
      review: review(16, 'best'),
      compare: null,
      failed: false,
    });
    expect(text).toMatchObject({ kind: 'result', reply: null, compare: null });
  });

  it('says so when the move could not be checked', () => {
    const line = play('g4h6');
    expect(
      tryText({ game, state, line, evals: [undefined], review: null, compare: null, failed: true }),
    ).toEqual({ kind: 'failed', label: '8... Nh6' });
  });
});
