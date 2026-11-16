import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import { clockAt, formatClock, formatScore, navigate, type ReviewNavigation } from './model';

const root = fileURLToPath(new URL('../../../fixtures/lichess-LAGvRNey/', import.meta.url));
const game = JSON.parse(readFileSync(`${root}game.json`, 'utf8')) as GameRecord;
const last = game.moves.length;

describe('navigate', () => {
  const at = (ply: number, flipped = false): ReviewNavigation => ({ ply, flipped });

  it('steps one move at a time and stops at both ends', () => {
    expect(navigate(at(3), 'next', last).ply).toBe(4);
    expect(navigate(at(3), 'previous', last).ply).toBe(2);
    expect(navigate(at(0), 'previous', last).ply).toBe(0);
    expect(navigate(at(last), 'next', last).ply).toBe(last);
  });

  it('jumps to the first and the last position', () => {
    expect(navigate(at(7), 'first', last).ply).toBe(0);
    expect(navigate(at(7), 'last', last).ply).toBe(last);
  });

  it('goes to a given position, kept inside the game', () => {
    expect(navigate(at(0), { goTo: 12 }, last).ply).toBe(12);
    expect(navigate(at(0), { goTo: 999 }, last).ply).toBe(last);
    expect(navigate(at(5), { goTo: -3 }, last).ply).toBe(0);
    expect(navigate(at(5), { goTo: 2.6 }, last).ply).toBe(3);
  });

  it('flips the board without changing the move', () => {
    expect(navigate(at(9), 'flip', last)).toEqual({ ply: 9, flipped: true, stepped: false });
    expect(navigate(at(9, true), 'flip', last)).toEqual({ ply: 9, flipped: false, stepped: false });
  });

  // The quality badge plays its animation only on a single step forward (owner, 2026-11-15).
  it('marks a single step forward, and nothing else', () => {
    expect(navigate(at(3), 'next', last).stepped).toBe(true);
    expect(navigate(at(last), 'next', last).stepped).toBe(false);
    expect(navigate(at(3), 'previous', last).stepped).toBe(false);
    expect(navigate(at(3), { goTo: 4 }, last).stepped).toBe(false);
    expect(navigate(at(3), 'last', last).stepped).toBe(false);
    expect(navigate(at(3), 'first', last).stepped).toBe(false);
    expect(navigate({ ply: 3, flipped: false, stepped: true }, 'flip', last).stepped).toBe(false);
  });
});

describe('formatClock', () => {
  it('writes minutes and seconds', () => {
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });

  it('adds hours when there are any', () => {
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('never rounds a clock up', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(12.7)).toBe('0:12');
  });

  it('shows whole seconds only, as the drawing does', () => {
    expect(formatClock(7.4)).toBe('0:07');
    expect(formatClock(0.3)).toBe('0:00');
  });
});

describe('clockAt', () => {
  it('is the starting time before a side has moved', () => {
    expect(clockAt(game, 'white', 0)).toBe(600);
    expect(clockAt(game, 'black', 1)).toBe(600);
  });

  it('is what the side had left after its latest move', () => {
    const whiteThird = game.moves[4]!;
    expect(whiteThird.color).toBe('white');
    expect(clockAt(game, 'white', 5)).toBe(whiteThird.clockSeconds);
    expect(clockAt(game, 'white', 6)).toBe(whiteThird.clockSeconds);
    expect(clockAt(game, 'black', 6)).toBe(game.moves[5]!.clockSeconds);
  });

  it('is null when the game carries no clocks', () => {
    const bare: GameRecord = {
      ...game,
      timeControl: null,
      moves: game.moves.map((move) => ({ ...move, clockSeconds: null })),
    };
    expect(clockAt(bare, 'white', 0)).toBeNull();
    expect(clockAt(bare, 'black', 10)).toBeNull();
  });
});

describe('formatScore', () => {
  it('writes centipawns as pawns with one decimal and a real minus sign', () => {
    expect(formatScore({ kind: 'cp', value: 34 })).toBe('+0.3');
    expect(formatScore({ kind: 'cp', value: -128 })).toBe('\u22121.3');
    expect(formatScore({ kind: 'cp', value: 1412 })).toBe('+14.1');
  });

  it('never writes -0.0 or +0.0', () => {
    expect(formatScore({ kind: 'cp', value: 0 })).toBe('0.0');
    expect(formatScore({ kind: 'cp', value: -4 })).toBe('0.0');
    expect(formatScore({ kind: 'cp', value: 4 })).toBe('0.0');
  });

  it('writes a forced mate as #N for White and \u2212#N for Black', () => {
    expect(formatScore({ kind: 'mate', moves: 3, winner: 'white' })).toBe('#3');
    expect(formatScore({ kind: 'mate', moves: 1, winner: 'black' })).toBe('\u2212#1');
  });

  it('writes a finished game as its result', () => {
    expect(formatScore({ kind: 'over', winner: 'white' })).toBe('1-0');
    expect(formatScore({ kind: 'over', winner: 'black' })).toBe('0-1');
    expect(formatScore({ kind: 'over', winner: null })).toBe('\u00bd-\u00bd');
  });
});
