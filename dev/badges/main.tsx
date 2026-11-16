/**
 * Development page: the quality badge of the review board (owner, 2026-11-15) for every
 * category, on both edges of the board and with the board turned, for screenshots and for
 * watching the animation. Served only by the dev server (http://localhost:5173/dev/badges/);
 * the build never includes it and nothing in src/ imports it.
 *
 * The positions are one opening move each and the categories are set by hand: layout only, not
 * an analysis of anything.
 *
 * Query: ?only=<id> shows one board; ?size=<px> the board size (default 350).
 * Press a board's "Play" to run the animation as a step forward does.
 */
import { StrictMode, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chess.js';
import type { Color, MoveCategory } from '@/contract';
import '@/styles/fonts';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { ReviewBoard } from '@/ui/review/ReviewBoard';

interface Sample {
  id: string;
  /** The moves from the start, in SAN, separated by spaces; the badge goes on the last one. */
  move: string;
  category: MoveCategory;
  bottom?: Color;
}

const SAMPLES: Sample[] = [
  { id: 'brilliant', move: 'e4', category: 'brilliant' },
  { id: 'great', move: 'Nf3', category: 'great' },
  { id: 'best', move: 'e3', category: 'best' },
  { id: 'excellent', move: 'Nc3', category: 'excellent' },
  { id: 'good', move: 'b3', category: 'good' },
  { id: 'book', move: 'd4', category: 'book' },
  { id: 'inaccuracy', move: 'c4', category: 'inaccuracy' },
  { id: 'mistake', move: 'Na3', category: 'mistake' },
  { id: 'miss', move: 'g3', category: 'miss' },
  { id: 'blunder', move: 'f4', category: 'blunder' },
  // The Brilliant callout near the edges of the board.
  { id: 'file-a', move: 'a4', category: 'brilliant' },
  { id: 'file-h', move: 'h4', category: 'brilliant' },
  { id: 'rank-8', move: 'e4 f5 exf5 g6 fxg6 Nf6 gxh7 Rg8 hxg8=Q', category: 'brilliant' },
  { id: 'file-a-turned', move: 'a4', category: 'brilliant', bottom: 'black' },
  { id: 'file-h-turned', move: 'h4', category: 'inaccuracy', bottom: 'black' },
];

const params = new URLSearchParams(location.search);
const only = params.get('only');
const size = Number(params.get('size') ?? 350);

function position(moves: string) {
  const chess = new Chess();
  let last = { from: '', to: '' };
  for (const san of moves.split(' ')) last = chess.move(san);
  return { fen: chess.fen(), lastMove: last.from + last.to };
}

function Sample({ sample }: { sample: Sample }) {
  const [plays, setPlays] = useState(0);
  const { fen, lastMove } = position(sample.move);
  return (
    <figure data-sample={sample.id} style={{ margin: 0 }}>
      <ReviewBoard
        fen={fen}
        lastMove={lastMove}
        orientation={sample.bottom ?? 'white'}
        palette="blue"
        label={sample.id}
        // Every press mounts a new badge, as a new move does.
        ply={1 + plays}
        category={sample.category}
        stepped={plays > 0}
        movable={null}
        onMove={() => {}}
        checking={false}
      />
      <figcaption style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <span className="t-caption">{sample.id}</span>
        <button type="button" className="t-caption" onClick={() => setPlays((n) => n + 1)}>
          Play
        </button>
      </figcaption>
    </figure>
  );
}

function Page() {
  const shown = only ? SAMPLES.filter((s) => s.id === only) : SAMPLES;
  return (
    <main
      style={
        {
          '--board': `${size}px`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          padding: 24,
        } as CSSProperties
      }
    >
      {shown.map((sample) => (
        <Sample key={sample.id} sample={sample} />
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
