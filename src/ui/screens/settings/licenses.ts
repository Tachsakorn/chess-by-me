/**
 * What the app ships and under which licence (Settings › Open-source licenses), from
 * docs/STACK.md. Keep in step with it when a dependency, font or piece set is added. The full
 * licence texts and copyright notices are in THIRD-PARTY-NOTICES.txt, written by the build
 * (scripts/third-party-notices.mjs) and linked from the same page.
 */
export const LICENSES: { name: string; license: string }[] = [
  { name: 'React, React DOM, Scheduler', license: 'MIT' },
  { name: 'React Router', license: 'MIT' },
  { name: 'route-pattern, cookie-es', license: 'MIT' },
  { name: 'Zustand', license: 'MIT' },
  { name: 'idb', license: 'ISC' },
  { name: 'chess.js', license: 'BSD-2-Clause' },
  { name: 'Chessground', license: 'GPL-3.0' },
  { name: 'Stockfish 17.1', license: 'GPL-3.0' },
  { name: 'cburnett pieces · Colin M.L. Burnett', license: 'GPL-2.0+' },
  { name: 'WintrChess (move labels)', license: 'GPL-3.0' },
  { name: 'Lichess (accuracy method)', license: '' },
  { name: 'Lichess chess-openings', license: 'CC0-1.0' },
  { name: 'Inter · Rasmus Andersson', license: 'OFL-1.1' },
  { name: 'Anuphan · Cadson Demak', license: 'OFL-1.1' },
];
