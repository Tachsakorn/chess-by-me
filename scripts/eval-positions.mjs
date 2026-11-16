// DEVELOPMENT ONLY. Evaluates the real game moments listed in
// src/analysis/classify/__fixtures__/special-moves.json with Stockfish and stores
// the engine output beside each moment, in the contract's PositionEval shape.
//
// For every moment it searches the position before the move and the position
// after it; for a moment with a "previous" move (the opponent's move just before)
// it also searches the position before that move. One engine process, searched
// one position at a time, with the hash cleared before every search so the
// result does not depend on the order of the moments.
//
// Before searching, every moment is checked: "movesBefore" replayed from the
// starting position must give "fenBefore", and the moves must be legal.
// What the engine says is stored as it comes; nothing is adjusted afterwards.
//
// Usage: node scripts/eval-positions.mjs
// Nothing in src/ may import from this script.

import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/analysis/classify/__fixtures__/special-moves.json');
const DEPTH = 18;
const MULTI_PV = 2;
const ENGINE_FILE = 'node_modules/stockfish/src/stockfish-17.1-single-a496a04.js';
const PV_PLIES = 8;

// --------------------------------- engine ---------------------------------

function startEngine() {
  const child = spawn(process.execPath, [join(root, ENGINE_FILE)], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let buffer = '';
  let onLine = () => {};
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(line);
    }
  });
  const send = (command) => child.stdin.write(command + '\n');
  const waitFor = (token) =>
    new Promise((resolve) => {
      onLine = (line) => {
        if (line.startsWith(token)) resolve(line);
      };
    });
  return {
    send,
    waitFor,
    /** The last reported line of each MultiPV rank, rank 1 first. */
    async search(fen) {
      send('ucinewgame');
      send('isready');
      await waitFor('readyok');
      return new Promise((resolve) => {
        const lines = new Map();
        onLine = (line) => {
          if (line.includes('lowerbound') || line.includes('upperbound')) return; // not a final score
          if (line.startsWith('info') && line.includes(' score ') && line.includes(' pv ')) {
            const tokens = line.split(' ');
            const after = (key) => tokens[tokens.indexOf(key) + 1];
            lines.set(tokens.includes('multipv') ? Number(after('multipv')) : 1, {
              depth: Number(after('depth')),
              kind: after('score'),
              value: Number(tokens[tokens.indexOf('score') + 2]),
              pv: tokens.slice(tokens.indexOf('pv') + 1),
            });
          } else if (line.startsWith('bestmove')) {
            resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value));
          }
        };
        send(`position fen ${fen}`);
        send(`go depth ${DEPTH}`);
      });
    },
    quit: () => child.kill(),
  };
}

// The engine scores from the side to move; the contract wants White's view.
function toScore(kind, value, whiteToMove) {
  if (kind === 'mate') {
    const moverWins = value > 0;
    return {
      kind: 'mate',
      moves: Math.abs(value),
      winner: moverWins === whiteToMove ? 'white' : 'black',
    };
  }
  return { kind: 'cp', value: whiteToMove ? value : -value };
}

// Same curve as src/analysis/classify/expectedPoints.ts (WintrChess, gradient 0.0035).
function whiteExpected(score) {
  if (score.kind === 'cp') return Number((1 / (1 + Math.exp(-0.0035 * score.value))).toFixed(4));
  if (score.kind === 'mate') return score.winner === 'white' ? 1 : 0;
  return score.winner === 'white' ? 1 : score.winner === 'black' ? 0 : 0.5;
}

async function evaluate(engine, fen, ply) {
  const board = new Chess(fen);
  if (board.isGameOver()) {
    const winner = board.isCheckmate() ? (board.turn() === 'w' ? 'black' : 'white') : null;
    const score = { kind: 'over', winner };
    return {
      ply,
      fen,
      score,
      whiteExpected: whiteExpected(score),
      depth: 0,
      lines: [],
      source: 'rules',
    };
  }
  const whiteToMove = board.turn() === 'w';
  const raw = await engine.search(fen);
  const lines = raw.map((line, index) => {
    const walk = new Chess(fen);
    const uci = [];
    const san = [];
    for (const step of line.pv.slice(0, PV_PLIES)) {
      const played = walk.move({
        from: step.slice(0, 2),
        to: step.slice(2, 4),
        promotion: step[4],
      });
      uci.push(step);
      san.push(played.san);
    }
    return { rank: index + 1, score: toScore(line.kind, line.value, whiteToMove), uci, san };
  });
  const score = lines[0].score;
  return {
    ply,
    fen,
    score,
    whiteExpected: whiteExpected(score),
    depth: raw[0].depth,
    lines,
    source: 'engine',
  };
}

// ------------------------------- the moments -------------------------------

/** Plays a UCI move on a position and returns the move and the position after it. */
function play(fen, uci) {
  const board = new Chess(fen);
  const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { san: move.san, fenAfter: board.fen() };
}

function check(moment) {
  const at = `moment "${moment.id}"`;
  const replay = new Chess();
  for (const san of moment.movesBefore) replay.move(san); // throws on an illegal move
  const lineEnd = moment.previous ? moment.previous.fenBefore : moment.fenBefore;
  if (replay.fen() !== lineEnd) {
    throw new Error(`${at}: movesBefore lead to ${replay.fen()}, not to ${lineEnd}`);
  }
  if (moment.previous) {
    const previous = play(moment.previous.fenBefore, moment.previous.moveUci);
    if (previous.san !== moment.previous.moveSan) throw new Error(`${at}: previous.moveSan`);
    if (previous.fenAfter !== moment.fenBefore) {
      throw new Error(`${at}: previous move does not lead to fenBefore`);
    }
  }
  const played = play(moment.fenBefore, moment.moveUci);
  if (played.san !== moment.moveSan) throw new Error(`${at}: moveSan is ${played.san}`);
  return played.fenAfter;
}

const fixture = JSON.parse(readFileSync(file, 'utf8'));
const fensAfter = fixture.moments.map(check);

const engine = startEngine();
engine.send('uci');
await engine.waitFor('uciok');
engine.send(`setoption name MultiPV value ${MULTI_PV}`);
engine.send('isready');
await engine.waitFor('readyok');

const started = Date.now();
let searched = 0;
for (const [index, moment] of fixture.moments.entries()) {
  const plyBefore = moment.movesBefore.length + (moment.previous ? 1 : 0);
  const evals = {};
  if (moment.previous) {
    evals.previousBefore = await evaluate(engine, moment.previous.fenBefore, plyBefore - 1);
    searched += 1;
  }
  evals.before = await evaluate(engine, moment.fenBefore, plyBefore);
  evals.after = await evaluate(engine, fensAfter[index], plyBefore + 1);
  searched += 2;
  moment.evals = evals;
  console.log(`${index + 1}/${fixture.moments.length} ${moment.id}`);
}
engine.quit();

fixture.engine = {
  name: 'Stockfish',
  version: '17.1',
  variant: 'full',
  depth: DEPTH,
  multiPv: MULTI_PV,
  file: ENGINE_FILE,
};
const options = (await prettier.resolveConfig(file)) ?? {};
writeFileSync(file, await prettier.format(JSON.stringify(fixture), { ...options, filepath: file }));
console.log(`${searched} positions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
