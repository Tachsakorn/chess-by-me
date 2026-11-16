// Builds THIRD-PARTY-NOTICES.txt (Fable review A5-02): the licence text and copyright notice of
// every package whose code or files the build really ships, read from the installed packages, plus
// the credits that are not packages. Used by vite.config.ts ("third-party-notices"), which passes
// the packages found in the bundle; the engine files are copied by scripts/copy-engines.mjs, not
// bundled, so Stockfish is added here by name. MIT, ISC and BSD-2-Clause require their notice to
// travel with the copies; GPL-3.0 and OFL-1.1 texts are included as well.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = join(root, 'node_modules');

/** The name of the package a module id from the bundle belongs to, or null for our own code. */
export function packageOf(id) {
  const path = id.replace(/\\/g, '/').replace(/^\0/, '').split('?')[0];
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const parts = path.slice(at + '/node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

const CREDITS = `Credits that are not packages

- WintrChess (WintrCat/wintrchess, GPL-3.0), https://github.com/WintrCat/wintrchess: the method
  of move classification (expected points, the loss ladder, Great and Brilliant) is followed and
  rewritten for this app; no code was copied. See docs/sources/classification.md in the source.
- Lichess (lichess.org): the game accuracy method (win percentage, move accuracy, volatility
  weights, harmonic mean) follows Lichess's published method,
  https://lichess.org/page/accuracy. Opening names: lichess-org/chess-openings (CC0-1.0),
  https://github.com/lichess-org/chess-openings.
- Chess pieces "cburnett" by Colin M.L. Burnett (GPL-2.0-or-later), as shipped by Chessground;
  also used for the app icon.
- Stockfish by the Stockfish developers (see the AUTHORS list below), GPL-3.0; Stockfish.js
  (c) Chess.com, LLC, https://github.com/nmrugg/stockfish.js, version 17.1.0; NNUE network by
  Linmiao Xu. The source of the WebAssembly engine this app serves is at
  https://github.com/nmrugg/stockfish.js (tag v17.1.0) and https://github.com/official-stockfish/Stockfish.
- Inter by Rasmus Andersson and the Inter Project Authors (OFL-1.1); Anuphan by Cadson Demak and
  the Anuphan Project Authors (OFL-1.1). Served from this site, through Fontsource.
`;

const LICENCE_FILES = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

function licenceText(dir) {
  const file = readdirSync(dir).find((name) => LICENCE_FILES.test(name));
  return file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

const isGpl3 = (text) => /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(text);

/** The notices file for these package names. */
export function buildNotices(packages) {
  const names = [...new Set([...packages, 'stockfish'])]
    .filter((name) => !name.startsWith('@types/') && name !== 'csstype')
    .sort((a, b) => a.localeCompare(b));
  const sections = [];
  for (const name of names) {
    const dir = join(modules, ...name.split('/'));
    if (!existsSync(join(dir, 'package.json')))
      throw new Error(`notices: ${name} is not installed`);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const text = licenceText(dir);
    if (!text) throw new Error(`notices: ${name} has no licence file`);
    const author = typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name ?? null);
    const head = [
      `${name} ${pkg.version}`,
      `Licence: ${pkg.license === 'GPL' ? 'GPL-3.0' : pkg.license}`,
      ...(author ? [`Author: ${author}`] : []),
      ...(pkg.homepage ? [`Home: ${pkg.homepage}`] : []),
    ];
    const body = isGpl3(text)
      ? 'The GNU General Public License, version 3: the full text is at the end of this file.'
      : text;
    const extra =
      name === 'stockfish' && existsSync(join(dir, 'AUTHORS'))
        ? `\n\nAuthors of Stockfish (the AUTHORS file of the package):\n\n${readFileSync(join(dir, 'AUTHORS'), 'utf8').replace(/\r\n/g, '\n').trim()}`
        : '';
    sections.push(`${'='.repeat(78)}\n${head.join('\n')}\n${'-'.repeat(78)}\n${body}${extra}`);
  }
  const gpl = readFileSync(join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim();
  return [
    'Chess by me: third-party notices',
    '',
    'Chess by me is free software: you can redistribute it and/or modify it under the terms of the',
    'GNU General Public License as published by the Free Software Foundation, either version 3 of',
    'the License, or (at your option) any later version. It is built with the works below; each',
    "one's licence and copyright notice follows.",
    '',
    CREDITS,
    ...sections,
    `${'='.repeat(78)}\nGNU General Public License, version 3\n${'-'.repeat(78)}\n${gpl}`,
    '',
  ].join('\n');
}
