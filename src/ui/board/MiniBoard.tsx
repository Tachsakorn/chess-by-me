import { memo } from 'react';
import type { Color } from '@/contract';
import { boardSquares, type BoardSquare, type Palette } from './board';
import { PIECE_IMAGES } from './pieces';
import styles from './MiniBoard.module.css';

interface MiniBoardProps {
  fen: string;
  /** UCI of the move that led here, to mark its two squares; null for none. */
  lastMove: string | null;
  palette: Palette;
  orientation?: Color;
  /** Size, corner and shadow come from the place that shows the board. */
  className?: string;
}

const cache = new Map<string, BoardSquare[]>();

function squaresFor(fen: string, lastMove: string | null, orientation: Color): BoardSquare[] {
  const key = `${fen}|${lastMove ?? ''}|${orientation}`;
  let squares = cache.get(key);
  if (!squares) {
    squares = boardSquares(fen, lastMove, orientation);
    if (cache.size > 300) cache.clear();
    cache.set(key, squares);
  }
  return squares;
}

/**
 * A still picture of a position (BRIEF-UI 5.4): no chessground, one SVG. Decorative: the text
 * next to it says what game it is.
 */
export const MiniBoard = memo(function MiniBoard({
  fen,
  lastMove,
  palette,
  orientation = 'white',
  className,
}: MiniBoardProps) {
  const squares = squaresFor(fen, lastMove, orientation);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={`${styles.board} squircle${className ? ` ${className}` : ''}`}
      data-palette={palette}
    >
      {squares.map((square, i) => (
        <rect
          key={square.square}
          x={i % 8}
          y={Math.floor(i / 8)}
          width={1}
          height={1}
          className={
            square.moved
              ? square.light
                ? styles.hl
                : styles.hd
              : square.light
                ? styles.light
                : styles.dark
          }
        />
      ))}
      {squares.map((square, i) =>
        square.piece ? (
          <image
            key={`p${square.square}`}
            href={PIECE_IMAGES[square.piece]}
            x={i % 8}
            y={Math.floor(i / 8)}
            width={1}
            height={1}
          />
        ) : null,
      )}
    </svg>
  );
});
