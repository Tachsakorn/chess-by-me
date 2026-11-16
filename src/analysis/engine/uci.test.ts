import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfo } from './uci';

describe('parseInfo', () => {
  it('reads depth, multipv, score and pv from a full info line', () => {
    expect(
      parseInfo(
        'info depth 12 seldepth 18 multipv 2 score cp -31 nodes 123 nps 456 hashfull 1 time 9 pv e7e5 g1f3',
      ),
    ).toEqual({ depth: 12, multiPv: 2, score: { kind: 'cp', value: -31 }, pv: ['e7e5', 'g1f3'] });
  });

  it('defaults multiPv to 1 when the line has no multipv', () => {
    expect(parseInfo('info depth 9 seldepth 11 score cp 20 nodes 5 pv e2e4')).toEqual({
      depth: 9,
      multiPv: 1,
      score: { kind: 'cp', value: 20 },
      pv: ['e2e4'],
    });
  });

  it('reads a mate score with its sign', () => {
    expect(parseInfo('info depth 20 multipv 1 score mate -3 nodes 9 pv g8h8 a1a8')?.score).toEqual({
      kind: 'mate',
      value: -3,
    });
    expect(parseInfo('info depth 20 multipv 1 score mate 2 nodes 9 pv a1a8')?.score).toEqual({
      kind: 'mate',
      value: 2,
    });
  });

  it('ignores progress lines that carry no score', () => {
    expect(parseInfo('info depth 5 currmove e2e4 currmovenumber 1')).toBeNull();
  });

  it('ignores info string lines, even when the text looks like a search line', () => {
    expect(parseInfo('info string NNUE evaluation using nn-1c0000000000.nnue')).toBeNull();
    expect(parseInfo('info string depth 12 score cp 31 pv e2e4')).toBeNull();
  });

  it('ignores bound-only scores', () => {
    expect(
      parseInfo('info depth 14 seldepth 20 multipv 1 score cp 20 lowerbound nodes 9 pv e2e4'),
    ).toBeNull();
    expect(
      parseInfo('info depth 14 seldepth 20 multipv 1 score cp -20 upperbound nodes 9 pv e2e4'),
    ).toBeNull();
    expect(parseInfo('info depth 14 multipv 1 score mate 4 lowerbound nodes 9 pv e2e4')).toBeNull();
  });

  it('ignores non-info lines', () => {
    expect(parseInfo('bestmove e2e4 ponder e7e5')).toBeNull();
    expect(parseInfo('uciok')).toBeNull();
    expect(parseInfo('readyok')).toBeNull();
    expect(parseInfo('')).toBeNull();
    expect(parseInfo('information depth 3 score cp 1 pv e2e4')).toBeNull();
  });

  it('ignores a scored line without a pv, or with unreadable numbers', () => {
    expect(parseInfo('info depth 12 score cp 31 nodes 4')).toBeNull();
    expect(parseInfo('info depth x score cp 31 pv e2e4')).toBeNull();
    expect(parseInfo('info depth 12 score cp abc pv e2e4')).toBeNull();
    expect(parseInfo('info depth 12 score wdl 31 pv e2e4')).toBeNull();
  });

  it('tolerates surrounding whitespace and repeated spaces', () => {
    expect(parseInfo('  info depth 3  multipv 1 score cp 7 pv  e2e4 e7e5 \r')).toEqual({
      depth: 3,
      multiPv: 1,
      score: { kind: 'cp', value: 7 },
      pv: ['e2e4', 'e7e5'],
    });
  });
});

describe('parseBestMove', () => {
  it('returns the move of a bestmove line', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
  });

  it('returns null for "(none)" and for other lines', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1 score cp 1 pv e2e4')).toBeNull();
    expect(parseBestMove('bestmove')).toBeNull();
  });
});
