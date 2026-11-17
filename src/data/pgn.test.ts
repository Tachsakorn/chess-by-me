import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@/contract';
import { stableId } from './hash';
import { gameFromPgn, isUnsupportedPgn, parsePgn } from './pgn';

const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`../../fixtures/lichess-LAGvRNey/${name}`, import.meta.url));
const fixturePgn = readFileSync(fixtureDir('game.pgn'), 'utf8');
const fixtureGame = JSON.parse(readFileSync(fixtureDir('game.json'), 'utf8')) as GameRecord;

function game(headers: Record<string, string>, moveText: string): string {
  const head = Object.entries(headers)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n');
  return `${head}\n\n${moveText}\n`;
}

describe('stableId', () => {
  it('is deterministic lowercase hex of at least 12 characters', () => {
    const a = stableId('hello');
    expect(a).toMatch(/^[0-9a-f]{12,}$/);
    expect(stableId('hello')).toBe(a);
    expect(stableId('hellp')).not.toBe(a);
  });
});

describe('gameFromPgn on the real Lichess game', () => {
  const rec = gameFromPgn(fixturePgn, {
    id: 'lichess:LAGvRNey',
    source: 'lichess',
    sourceUrl: 'https://lichess.org/LAGvRNey',
  })!;

  it('reads 85 moves with the right first move', () => {
    expect(rec.moves).toHaveLength(85);
    expect(rec.moves[0]).toMatchObject({
      ply: 1,
      moveNumber: 1,
      color: 'white',
      san: 'e4',
      uci: 'e2e4',
    });
  });
  it('chains positions', () => {
    for (let i = 1; i < rec.moves.length; i++) {
      expect(rec.moves[i - 1]!.fenAfter).toBe(rec.moves[i]!.fenBefore);
    }
  });
  it('matches the recorded fixture moves exactly', () => {
    expect(rec.moves).toEqual(fixtureGame.moves);
  });
  it('reads header facts', () => {
    expect(rec.termination).toBe('checkmate');
    expect(rec.result).toBe('1-0');
    expect(rec.white).toEqual({ name: 'EricRosen', rating: 2550, title: 'IM' });
    expect(rec.black).toEqual({ name: 'ni5hu', rating: 1761, title: null });
    expect(rec.playedAt).toBe('2026-11-04T09:04:40Z');
    expect(rec.timeControl).toEqual(fixtureGame.timeControl);
    expect(rec.initialFen).toBe(fixtureGame.initialFen);
    expect(rec.pgn).toBe(fixturePgn);
    expect(rec.rated).toBe(true);
    expect(rec.id).toBe('lichess:LAGvRNey');
    expect(rec.source).toBe('lichess');
  });
  it('computes clock and time spent', () => {
    expect(rec.moves[2]).toMatchObject({ san: 'Nf3', clockSeconds: 597, spentSeconds: 3 });
    expect(rec.moves[0]!.spentSeconds).toBe(0);
    expect(rec.moves[1]!.spentSeconds).toBe(0);
  });
  it('gives null clocks when the clock comments are missing', () => {
    const stripped = fixturePgn.replace(/\{ \[%clk [^\]]*\] \}/g, '');
    expect(stripped).not.toContain('%clk');
    const r = gameFromPgn(stripped)!;
    expect(r.moves).toHaveLength(85);
    for (const m of r.moves) {
      expect(m.clockSeconds).toBeNull();
      expect(m.spentSeconds).toBeNull();
    }
  });
});

describe('ids and known values', () => {
  it('uses pgn: + stableId of the trimmed text and is repeatable', () => {
    const a = gameFromPgn(`  \n${fixturePgn}\n  `)!;
    const b = gameFromPgn(fixturePgn)!;
    expect(a.id).toBe(`pgn:${stableId(fixturePgn.trim())}`);
    expect(b.id).toBe(a.id);
    expect(a.source).toBe('pgn');
    expect(a.sourceUrl).toBeNull();
  });
  it('lets known values win over headers', () => {
    const r = gameFromPgn(fixturePgn, {
      id: 'x:1',
      playedAt: '2020-01-01T00:00:00Z',
      rated: false,
      whiteRating: 1234,
      termination: 'timeout',
    })!;
    expect(r.id).toBe('x:1');
    expect(r.playedAt).toBe('2020-01-01T00:00:00Z');
    expect(r.rated).toBe(false);
    expect(r.white.rating).toBe(1234);
    expect(r.black.rating).toBe(1761);
    expect(r.termination).toBe('timeout');
  });
});

describe('promotion', () => {
  it('writes a five-character uci for a quiet promotion', () => {
    const r = gameFromPgn(
      game({ Result: '*' }, '1. a4 b5 2. axb5 Nf6 3. b6 Nc6 4. bxa7 Rb8 5. a8=Q *'),
    )!;
    expect(r.moves[8]).toMatchObject({ san: 'a8=Q', uci: 'a7a8q' });
  });
  it('writes a five-character uci for a capture promotion', () => {
    const r = gameFromPgn(
      game({ Result: '*' }, '1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Rg8 5. hxg8=Q *'),
    )!;
    expect(r.moves[8]).toMatchObject({ san: 'hxg8=Q', uci: 'h7g8q' });
  });
});

describe('skipped games', () => {
  it('returns null for variants, custom starts, empty and unreadable games', () => {
    expect(gameFromPgn(game({ Variant: 'Chess960', Result: '*' }, '1. e4 e5 *'))).toBeNull();
    expect(gameFromPgn(game({ Variant: 'Crazyhouse', Result: '*' }, '1. e4 e5 *'))).toBeNull();
    expect(
      gameFromPgn(
        game(
          {
            SetUp: '1',
            FEN: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
            Result: '*',
          },
          '1... e5 2. Nf3 *',
        ),
      ),
    ).toBeNull();
    expect(gameFromPgn(game({ Result: '*' }, '*'))).toBeNull();
    expect(gameFromPgn(game({ Result: '*' }, '1. e4 e4 *'))).toBeNull();
    expect(gameFromPgn('')).toBeNull();
    expect(gameFromPgn('not a pgn at all')).toBeNull();
  });
});

describe('isUnsupportedPgn (Fable review A1-06)', () => {
  const fromPosition = game(
    {
      SetUp: '1',
      FEN: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      Result: '*',
    },
    '1... e5 2. Nf3 *',
  );

  it('is true for a variant or a custom start position, with nothing else to open', () => {
    expect(isUnsupportedPgn(game({ Variant: 'Chess960', Result: '*' }, '1. e4 e5 *'))).toBe(true);
    // Crazyhouse drops cannot even be read as moves: the header still says what it is.
    expect(
      isUnsupportedPgn(
        game({ Variant: 'Crazyhouse', Result: '*' }, '1. e4 d5 2. exd5 Qxd5 3. P@e4 *'),
      ),
    ).toBe(true);
    expect(isUnsupportedPgn(fromPosition)).toBe(true);
    expect(
      isUnsupportedPgn(game({ FEN: '8/8/8/8/8/8/k7/K7 w - - 0 1', Result: '*' }, '1. Kb1 *')),
    ).toBe(true);
  });

  it('is false for text that is simply not a readable game', () => {
    expect(isUnsupportedPgn('')).toBe(false);
    expect(isUnsupportedPgn('not a pgn at all')).toBe(false);
    expect(isUnsupportedPgn(game({ Result: '*' }, '1. e4 e4 *'))).toBe(false);
    expect(isUnsupportedPgn(game({ Variant: 'Standard', Result: '*' }, '1. e4 e4 *'))).toBe(false);
  });

  it('is false when a standard game in the text can be opened', () => {
    expect(isUnsupportedPgn(game({ Result: '*' }, '1. e4 e5 *'))).toBe(false);
    expect(
      isUnsupportedPgn(`${fromPosition}

${game({ Result: '*' }, '1. e4 e5 *')}`),
    ).toBe(false);
  });
});

describe('termination without a known value', () => {
  const t = (headers: Record<string, string>, moves: string) =>
    gameFromPgn(game(headers, moves))!.termination;

  it('checkmate', () => {
    expect(t({ Result: '0-1' }, '1. f3 e5 2. g4 Qh4# 0-1')).toBe('checkmate');
  });
  it('stalemate', () => {
    expect(
      t(
        { Result: '1/2-1/2' },
        '1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. h4 Rah6 5. Qxc7 f6 6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6 10. Qe6 1/2-1/2',
      ),
    ).toBe('stalemate');
  });
  it('insufficient material', () => {
    expect(
      t(
        { Result: '1/2-1/2' },
        '1. c3 b5 2. f4 f6 3. c4 bxc4 4. f5 e6 5. fxe6 Be7 6. exd7+ Nxd7 7. a4 c6 8. b4 cxb3 9. a5 Rb8 10. Qxb3 Rb6 11. Qa4 Rxb1 12. Qxc6 Bb7 13. Qe4 Bxe4 14. a6 Bxg2 15. Bxg2 Qc7 16. Rxb1 Kf7 17. h3 Qxc1+ 18. Rxc1 Nb8 19. Bf1 Nxa6 20. Kf2 Bb4 21. Bg2 Nh6 22. Bf3 Bxd2 23. Kg3 Bxc1 24. Be4 Kg8 25. Bxh7+ Kxh7 26. h4 f5 27. e3 Rg8 28. Rh3 Bxe3 29. Rh2 Rh8 30. h5 Bxg1 31. Rg2 Nc7 32. Rxg1 Na6 33. Ra1 Nb4 34. Rxa7 f4+ 35. Kxf4 Ng4 36. Rxg7+ Kxg7 37. Kxg4 Rxh5 38. Kxh5 1/2-1/2',
      ),
    ).toBe('insufficient-material');
  });
  it('threefold repetition', () => {
    expect(t({ Result: '1/2-1/2' }, '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2')).toBe(
      'repetition',
    );
  });
  it('fifty-move rule', () => {
    const sans =
      'e4 e5 Qf3 Nc6 Qe2 Na5 Nc3 Ba3 Rb1 Bf8 Qf3 Rb8 Qh3 Qg5 Qg3 Nc6 Ba6 Bb4 Nf3 Qf6 Ra1 Qd6 Bc4 Kf8 Qh3 Qc5 Rf1 Qb5 Qg3 Qa5 Rg1 Ke7 Ba6 Kf8 Bd3 Nf6 Nd1 Ra8 Qg4 Qa4 Qg6 Qa3 Qh5 Rg8 Qh6 Ne7 Rh1 Ng6 Qe3 Ne7 Nh4 Ne8 Qh3 Rb8 Bf1 Qa6 Qe3 Bd6 Qc5 Qa3 Nf5 Qb3 Qa3 Bc5 Nh4 Qc4 Nf3 Bb4 Qa5 Qa6 Ng5 Qd6 Qc5 Ba3 Qd4 Qd5 Nc3 Qd6 Rb1 Rh8 Ba6 Qf6 Rf1 Kg8 Qd6 Qg6 Be2 Nf6 Qb6 Ng4 Qc6 Ra8 Kd1 Nd5 Rh1 Bf8 Qb5 Qa6 Na4 Nf4 Qa5 Qc6'.split(
        ' ',
      );
    const text = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');
    expect(t({ Result: '1/2-1/2' }, `${text} 1/2-1/2`)).toBe('fifty-move');
  });
  it('time forfeit and abandonment headers', () => {
    expect(t({ Result: '1-0', Termination: 'Time forfeit' }, '1. e4 e5 1-0')).toBe('timeout');
    expect(t({ Result: '1-0', Termination: 'Abandoned' }, '1. e4 e5 1-0')).toBe('abandonment');
  });
  it('reads the wording Chess.com writes into its PGN', () => {
    // Wording seen in the Termination header of real Chess.com games
    // (api.chess.com/pub/player/hikaru/games/2026/10, read 2026-11-13).
    const e = '1. e4 e5';
    expect(t({ Result: '0-1', Termination: 'Hikaru won on time' }, `${e} 0-1`)).toBe('timeout');
    expect(t({ Result: '1-0', Termination: 'Hikaru won - game abandoned' }, `${e} 1-0`)).toBe(
      'abandonment',
    );
    expect(t({ Result: '1-0', Termination: 'Hikaru won by resignation' }, `${e} 1-0`)).toBe(
      'resignation',
    );
    expect(t({ Result: '1/2-1/2', Termination: 'Game drawn by agreement' }, `${e} 1/2-1/2`)).toBe(
      'agreement',
    );
    expect(
      t(
        { Result: '1/2-1/2', Termination: 'Game drawn by timeout vs insufficient material' },
        `${e} 1/2-1/2`,
      ),
    ).toBe('timeout-vs-insufficient-material');
  });
  it('reads a drawn time forfeit as timeout against insufficient material', () => {
    // A game that ends on the clock and is still a draw can only be this rule.
    expect(t({ Result: '1/2-1/2', Termination: 'Time forfeit' }, '1. e4 e5 1/2-1/2')).toBe(
      'timeout-vs-insufficient-material',
    );
  });
  it('by result', () => {
    expect(t({ Result: '1/2-1/2' }, '1. e4 e5 1/2-1/2')).toBe('agreement');
    expect(t({ Result: '0-1' }, '1. e4 e5 0-1')).toBe('resignation');
    expect(t({ Result: '*' }, '1. e4 e5 *')).toBe('unknown');
  });
  it('does not read a position-based draw into a decisive game', () => {
    expect(t({ Result: '1-0' }, '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1-0')).toBe(
      'resignation',
    );
  });
});

describe('parsePgn', () => {
  const g1 = game({ Event: 'A', White: 'W1', Black: 'B1', Result: '1-0' }, '1. e4 e5 2. Nf3 1-0');
  const g2 = game({ Event: 'B', White: 'W2', Black: 'B2', Result: '0-1' }, '1. d4 d5 2. c4 0-1');

  it('imports several games separated by blank lines', () => {
    const r = parsePgn(`${g1}\n\n${g2}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.games.map((x) => x.white.name)).toEqual(['W1', 'W2']);
    expect(r.skipped).toBe(0);
    expect(r.games[0]!.source).toBe('pgn');
    expect(r.games[0]!.sourceUrl).toBeNull();
    expect(r.games[0]!.pgn).not.toContain('W2');
  });
  it('counts a variant as skipped', () => {
    const v = game({ Variant: 'Chess960', Result: '*' }, '1. e4 e5 *');
    const r = parsePgn(`${g1}\n\n${v}`);
    expect(r).toMatchObject({ ok: true, skipped: 1 });
    if (r.ok) expect(r.games).toHaveLength(1);
  });
  it('imports comments, variations and NAGs', () => {
    const r = parsePgn(
      game(
        { Result: '*' },
        '1. e4 $1 {best by test} e5 (1... c5 2. Nf3 {sicilian}) 2. Nf3 $2 Nc6 *',
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.games[0]!.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
  it('rejects empty or unreadable text', () => {
    for (const text of ['', '   \n  ', 'hello world', '[Event "x"]\n\n']) {
      expect(parsePgn(text)).toMatchObject({ ok: false, error: { code: 'invalid-pgn' } });
    }
  });
  it('imports move text with no headers, players named "?"', () => {
    const r = parsePgn('1. e4 e5 2. Nf3 *');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.games).toHaveLength(1);
    expect(r.games[0]!.white.name).toBe('?');
    expect(r.games[0]!.black.name).toBe('?');
    expect(r.games[0]!.moves).toHaveLength(3);
  });
});
