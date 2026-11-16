import { describe, expect, it } from 'vitest';
import { isBrilliant } from './brilliant';
import { isCriticalCandidate, isGreat } from './great';
import { context, cp } from './testSupport';

// Hand-built positions, hand-built scores: each test isolates one condition.
// "Sound" scores: the mover is a little better, the second-best move is not winning.
const SOUND = { first: cp(150), second: cp(40), after: cp(150) };

// A bishop sacrifice on h7: after Bxh7+ only the king can take the bishop.
const GREEK_GIFT = '5rk1/4qppp/4p3/4P3/8/3B1N2/5PPP/3Q2K1 w - - 0 1';

describe('isBrilliant', () => {
  it('is true for a sound sacrifice: a piece left to be taken, with no cheap way out', () => {
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', SOUND))).toBe(true);
  });

  it('is false when the mover was completely winning without it', () => {
    const scores = { first: cp(1500), second: cp(750), after: cp(1500) };
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', scores))).toBe(false);
  });

  // Owner, 2026-11-15: Brilliant may leave the mover a little worse, down to an expected 0.455
  // (about -52 cp, AT_LEAST_EQUAL_EXPECTED); Great keeps "not worse at all".
  it('is false when the mover is clearly worse after it', () => {
    const scores = { first: cp(-150), second: cp(-300), after: cp(-150) };
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', scores))).toBe(false);
  });

  it('is true when the mover is only a little worse after it (expected 0.455 or more)', () => {
    const scores = { first: cp(-50), second: cp(-300), after: cp(-50) };
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', scores))).toBe(true);
  });

  it('is false just past the line, below an expected 0.455', () => {
    const scores = { first: cp(-55), second: cp(-300), after: cp(-55) };
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', scores))).toBe(false);
  });

  // A sacrifice counts once (owner, 2026-11-15): leaving the same piece to the same attacker
  // again on the next move is not a new sacrifice. Scores: the app's own lite analysis.
  // After 8.h4 the g5 bishop was safe; 8...h6 attacks it; 9.Qd2 leaves it (new sacrifice);
  // 9...Re8 declines; 10.O-O-O leaves it again to the same pawn (not new).
  const AFTER_8_H4 = 'rnbq1rk1/pp2bpp1/2p2n2/3p2B1/3P3P/2NB1N2/PPP2PP1/R2QK2R b KQ - 0 8';
  const AFTER_9_QD2 = 'rnbq1rk1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPPQ1PP1/R3K2R b KQ - 1 9';
  const BEFORE_10 = 'rnbqr1k1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPPQ1PP1/R3K2R w KQ - 2 10';
  const BEFORE_9 = 'rnbq1rk1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPP2PP1/R2QK2R w KQ - 0 9';

  it('keeps 9.Qd2 Brilliant: the bishop was safe after White’s previous move', () => {
    const qd2 = context(BEFORE_9, 'd1d2', { first: cp(-25), second: cp(-59), after: cp(-19) });
    expect(isBrilliant({ ...qd2, afterOwnPrevious: AFTER_8_H4 })).toBe(true);
  });

  it('does not call 10.O-O-O Brilliant: the same bishop, left to the same pawn since 9.Qd2', () => {
    const castle = context(BEFORE_10, 'e1c1', { first: cp(-18), second: cp(-64), after: cp(-21) });
    expect(isBrilliant({ ...castle, afterOwnPrevious: AFTER_9_QD2 })).toBe(false);
    // Without the previous move to compare with, it would count.
    expect(isBrilliant(castle)).toBe(true);
  });

  // The owner's report (2026-11-15): White leaves the g5 bishop to ...hxg5, opening the h-file.
  // Scores from the app's own analysis (Stockfish 17.1 lite, depth 18, two lines).
  it('calls 9.Qd2 of a French Exchange game Brilliant, and not Great', () => {
    const fen = 'rnbq1rk1/pp2bpp1/2p2n1p/3p2B1/3P3P/2NB1N2/PPP2PP1/R2QK2R w KQ - 0 9';
    const qd2 = context(fen, 'd1d2', { first: cp(-25), second: cp(-59), after: cp(-19) });
    expect(isBrilliant(qd2)).toBe(true);
    expect(isCriticalCandidate(qd2)).toBe(false);
    expect(isGreat(qd2)).toBe(false);
  });

  it('can be awarded with a single engine line', () => {
    expect(isBrilliant(context(GREEK_GIFT, 'd3h7', { first: cp(150), after: cp(150) }))).toBe(true);
  });

  it('is false for a quiet move that leaves nothing to be taken', () => {
    expect(isBrilliant(context(GREEK_GIFT, 'h2h3', SOUND))).toBe(false);
  });

  it('is false for a trade of equal value: queen takes a defended queen', () => {
    // The rook on a1 guards the queen, so nothing hangs before the trade.
    const fen = '3q1rk1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'd1d8', SOUND))).toBe(false);
  });

  it('is false for a recapture that can itself be recaptured', () => {
    // Bishop takes knight; the pawn on e6 takes back.
    const fen = '4k3/8/4p3/3n4/8/5B2/8/4K3 w - - 0 1';
    expect(isBrilliant(context(fen, 'f3d5', SOUND))).toBe(false);
  });

  it('is false when the move rescues a piece: fewer pieces hang than before', () => {
    // Knight and bishop are both attacked by pawns; the knight steps away.
    const fen = '6k1/5ppp/3p4/1p2N3/B7/8/5PPP/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'e5f3', SOUND))).toBe(false);
  });

  it('is true when a piece that was already attacked is left hanging for a better move', () => {
    // Same position: the king steps aside and both pieces stay where they can be taken.
    const fen = '6k1/5ppp/3p4/1p2N3/B7/8/5PPP/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'g1h1', SOUND))).toBe(true);
  });

  it('is false for a promotion', () => {
    // The bishop on a4 hangs before and after; e8=N would otherwise qualify.
    const fen = '2k5/4P3/8/1p6/B7/8/8/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'e7e8n', SOUND))).toBe(false);
  });

  it('is false when taking the offered piece allows mate in one', () => {
    // After Nd6, ...Rxd6 is answered by Re8 mate: the knight is not really on offer.
    const fen = '3r2k1/5ppp/8/8/4N3/8/5PPP/4R1K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'e4d6', SOUND))).toBe(false);
  });

  it('is false when a trapped piece escapes its trap, even onto an attacked square', () => {
    // The knight in the corner is lost where it stands; from c7 it could still get away.
    const fen = 'N7/pk6/8/8/8/8/8/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'a8c7', SOUND))).toBe(false);
  });

  it('is false when the move gives a trapped piece a way out', () => {
    // a4-a5 guards b6, so the cornered knight is no longer trapped, only attacked.
    const fen = 'N7/1k6/8/8/P7/8/8/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'a4a5', SOUND))).toBe(false);
  });

  it('is false when the piece that moved was trapped before and is still trapped', () => {
    // The cornered knight goes to c7, where every square it could reach is covered
    // (king, pawns on c6 and f7, rook on h8). The bishop on a4 also hangs but is
    // not trapped, so only the "it was lost anyway" rule decides here.
    const fen = 'N6r/pk3p2/2p5/1p6/B7/8/8/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'a8c7', SOUND))).toBe(false);
  });

  it('is false when every piece left hanging is trapped', () => {
    // Leaving the trapped knight to its fate is not a sacrifice.
    const fen = 'N7/pk6/8/8/8/8/8/6K1 w - - 0 1';
    expect(isBrilliant(context(fen, 'g1g2', SOUND))).toBe(false);
  });
});
