import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import {
  finalPosition,
  formatShortDate,
  formatToday,
  groupByTime,
  moveLabel,
  outcomeFor,
  opponentOf,
  pickContinue,
  ratingsToShow,
} from './games';

function fixture(folder: string): GameRecord {
  const path = fileURLToPath(new URL(`../../../fixtures/${folder}/game.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as GameRecord;
}
const rosen = fixture('lichess-LAGvRNey'); // EricRosen v ni5hu, 1-0, 85 moves, 2026-11-04
const bullet = fixture('lichess-HKl8S22m'); // ni5hu v raphapap, 0-1, 2026-11-13
const blitz = fixture('lichess-f6WkG3uO'); // ni5hu v HlalVLSI, 1-0, 2026-11-13

describe('outcomeFor', () => {
  it('sees the result from the user’s side, ignoring letter case', () => {
    expect(outcomeFor(rosen, 'Ni5hu')).toBe('loss');
    expect(outcomeFor(rosen, 'ericrosen')).toBe('win');
    expect(outcomeFor(blitz, 'ni5hu')).toBe('win');
    expect(outcomeFor(rosen, 'somebody')).toBeNull();
  });

  it('names the opponent', () => {
    expect(opponentOf(rosen, 'ni5hu')).toBe('EricRosen');
    expect(opponentOf(bullet, 'ni5hu')).toBe('raphapap');
  });
});

describe('moveLabel', () => {
  it('writes Black’s moves with three dots and the category mark', () => {
    const blackPly = rosen.moves.find((move) => move.color === 'black')!.ply;
    expect(moveLabel(rosen, blackPly, 'mistake')).toBe(`1... ${rosen.moves[1]!.san}?`);
    expect(moveLabel(rosen, 1, 'great')).toBe(`1. ${rosen.moves[0]!.san}!`);
    expect(moveLabel(rosen, 1, 'best')).toBe(`1. ${rosen.moves[0]!.san}`);
  });

  // Owner, 2026-11-15 (second round): "28... Qxg1+×" read like a capture. The cross stays in the
  // Miss badge only; the move itself carries no mark.
  it('writes a miss with no mark after it', () => {
    expect(moveLabel(rosen, 1, 'miss')).toBe(`1. ${rosen.moves[0]!.san}`);
  });

  it('gives the final position with its last move', () => {
    const last = rosen.moves.at(-1)!;
    expect(finalPosition(rosen)).toEqual({ fen: last.fenAfter, lastMove: last.uci });
  });
});

describe('ratingsToShow', () => {
  const none = { rating: null, progress: null };
  it('uses Lichess’s own change figure', () => {
    const shown = ratingsToShow(
      'lichess',
      {
        bullet: { rating: 1513, progress: 19 },
        blitz: { rating: 1354, progress: -23 },
        rapid: none,
      },
      null,
    );
    expect(shown).toEqual({
      bullet: { rating: 1513, change: 19 },
      blitz: { rating: 1354, change: -23 },
      rapid: { rating: null, change: null },
    });
  });

  it('measures Chess.com against the previous visit', () => {
    const before = {
      bullet: { rating: 1500, change: null },
      blitz: { rating: null, change: null },
      rapid: { rating: 1532, change: 4 },
    };
    const shown = ratingsToShow(
      'chesscom',
      {
        bullet: { rating: 1510, progress: null },
        blitz: { rating: 1400, progress: null },
        rapid: { rating: 1532, progress: null },
      },
      before,
    );
    expect(shown.bullet.change).toBe(10);
    expect(shown.blitz.change).toBeNull();
    expect(shown.rapid.change).toBe(0);
  });
});

describe('groupByTime', () => {
  it('puts games under this week, last week, then their month', () => {
    // Saturday 14 November 2026: the week starts on Monday the 9th.
    const now = new Date(2026, 10, 14, 12);
    const groups = groupByTime([blitz, bullet, rosen], now);
    expect(groups.map((group) => group.key.kind)).toEqual(['thisWeek', 'lastWeek']);
    expect(groups[0]!.games).toHaveLength(2);
    const later = groupByTime([rosen], new Date(2026, 11, 20));
    expect(later[0]!.key).toEqual({ kind: 'month', date: new Date(2026, 10, 1) });
  });
});

describe('pickContinue', () => {
  const games = [blitz, bullet, rosen];
  it('prefers the game the user left most recently, before its last move', () => {
    const card = pickContinue(games, new Set(), {
      [rosen.id]: { ply: 16, flipped: false, at: 200 },
      [blitz.id]: { ply: 4, flipped: false, at: 100 },
      [bullet.id]: { ply: bullet.moves.length, flipped: false, at: 300 },
    });
    expect(card).toEqual({ kind: 'paused', game: rosen, ply: 16 });
  });

  it('falls back to the newest analysed game, then to the newest game', () => {
    expect(pickContinue(games, new Set([rosen.id]), {})).toEqual({ kind: 'latest', game: rosen });
    expect(pickContinue(games, new Set(), {})).toEqual({ kind: 'notAnalyzed', game: blitz });
    expect(pickContinue([], new Set(), {})).toBeNull();
  });
});

describe('dates', () => {
  it('writes today’s date as the drawing does, in both languages', () => {
    const day = new Date(2026, 10, 14);
    expect(formatToday(day, 'en')).toBe('Saturday, November 14');
    expect(formatToday(day, 'th')).toBe('วันเสาร์ที่ 14 พฤศจิกายน');
  });

  it('writes short dates with the Gregorian year and Arabic digits in Thai', () => {
    expect(formatShortDate('2026-11-12T10:00:00Z', 'en')).toBe('Nov 12');
    expect(formatShortDate('2026-11-12T10:00:00Z', 'th')).toBe('12 พ.ย.');
  });
});
