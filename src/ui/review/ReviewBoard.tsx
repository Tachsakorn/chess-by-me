import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import type { Color, MoveCategory } from '@/contract';
import type { Palette } from '@/ui/board/board';
import { PIECE_IMAGES, type PieceCode } from '@/ui/board/pieces';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { arrowBrushes, arrowShapes, type BoardArrow } from './arrows';
import { badgeSpot } from './badge';
import { BoardBadge } from './BoardBadge';
import { boardCoordinates } from './coords';
import { legalDests, promotes } from './tryLine';
import styles from './ReviewBoard.module.css';

interface ReviewBoardProps {
  fen: string;
  /** UCI of the move that led here; null at the start. */
  lastMove: string | null;
  orientation: Color;
  palette: Palette;
  label: string;
  /** The move on the board (0 at the start) and its category once analysed, for the badge. */
  ply: number;
  category: MoveCategory | null;
  /** The reader stepped forward one move: the badge plays its animation. */
  stepped: boolean;
  /**
   * The side whose pieces can be moved, to try a move (owner, 2026-11-16): the side to move once
   * the game is analysed, null before. Only legal moves are accepted.
   */
  movable: Color | null;
  /** A legal move was made on the board, in UCI ("g4h6", "a7a8q"), in the position `fen`. */
  onMove(uci: string, fen: string): void;
  /** The engine is checking the move on the board: a grey badge with a spinner in its place. */
  checking: boolean;
  /** Arrows to draw (the analysis board); none on the review screen. */
  arrows?: readonly BoardArrow[];
}

const FILES = 'abcdefgh';
const isLight = (square: string) => (FILES.indexOf(square[0] ?? 'a') + Number(square[1])) % 2 === 0;
const shade = (square: string) => (isLight(square) ? styles.hlLight! : styles.hlDark!);

/**
 * The squares of the last move and the square picked up, each in the highlight of its own shade
 * (BRIEF-UI 5.4; the picked square takes the same colour, owner 2026-11-16).
 */
function highlights(lastMove: string | null, selected: string | null): Map<Key, string> {
  const map = new Map<Key, string>();
  if (lastMove) {
    for (const square of [lastMove.slice(0, 2), lastMove.slice(2, 4)]) {
      map.set(square as Key, shade(square));
    }
  }
  if (selected) map.set(selected as Key, shade(selected));
  return map;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The pieces a pawn can become, in the order they are offered. */
const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;
type PromotionPiece = (typeof PROMOTION_PIECES)[number];

/**
 * The live board of the review screen: chessground with cburnett pieces, the game's colours and
 * no arrows (BRIEF-UI 5.4). Once the game is analysed the side to move can be dragged, or tapped
 * and then a square tapped, to try a move: the squares it can go to are marked, a move that is
 * not legal springs back, and a pawn reaching the last row asks which piece it becomes.
 */
export function ReviewBoard({
  fen,
  lastMove,
  orientation,
  palette,
  label,
  ply,
  category,
  stepped,
  movable,
  onMove,
  checking,
  arrows,
}: ReviewBoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  /** The square picked up, and the position it was picked up in. */
  const [picked, setPicked] = useState<{ fen: string; square: string } | null>(null);
  const selected = picked && picked.fen === fen ? picked.square : null;
  /** A pawn waiting on the last row for its piece. */
  const [promotion, setPromotion] = useState<{ from: string; to: string; fen: string } | null>(
    null,
  );
  // The handlers chessground calls read what the latest render knew.
  const latest = useRef({ fen, onMove });
  useEffect(() => {
    latest.current = { fen, onMove };
  });

  useEffect(() => {
    if (!element.current) return;
    const board = Chessground(element.current, {
      coordinates: false,
      animation: { enabled: !reducedMotion(), duration: 150 },
      highlight: { lastMove: false, check: false },
      // Nobody draws on the board; the arrows of the analysis board are drawn by the app (its
      // layer must exist from the start, so it is visible, and empty on the review screen).
      drawable: { enabled: false, visible: true },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      disableContextMenu: true,
      movable: {
        free: false,
        color: undefined,
        showDests: true,
        events: {
          after: (from, to) => {
            const now = latest.current;
            if (promotes(now.fen, from, to)) setPromotion({ from, to, fen: now.fen });
            else now.onMove(`${from}${to}`, now.fen);
          },
        },
      },
    });
    // The arrows' brushes in the colours of the tokens (the analysis board, 2026-11-26).
    const css = getComputedStyle(element.current);
    const brushes = board.state.drawable.brushes;
    board.set({
      drawable: {
        brushes: {
          ...brushes,
          ...arrowBrushes(brushes.green, (name) => css.getPropertyValue(name).trim()),
        },
      },
    });
    api.current = board;
    // Chessground picks a square up and puts it down in several places and tells nobody, so the
    // picked square is read back from it after every press and release.
    let timer = 0;
    const readPicked = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const square = board.state.selected;
        setPicked(square ? { fen: latest.current.fen, square } : null);
      }, 0);
    };
    const RELEASES = ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel'] as const;
    for (const name of RELEASES) document.addEventListener(name, readPicked);
    const observer = new ResizeObserver(() => board.redrawAll());
    observer.observe(element.current);
    return () => {
      window.clearTimeout(timer);
      for (const name of RELEASES) document.removeEventListener(name, readPicked);
      observer.disconnect();
      board.destroy();
      api.current = null;
    };
  }, []);

  // A pawn still waiting for its piece when the position changes was for another position.
  const pending = promotion && promotion.fen === fen ? promotion : null;

  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      turnColor: fen.split(' ')[1] === 'b' ? 'black' : 'white',
      movable: {
        color: movable ?? undefined,
        dests: movable ? (legalDests(fen) as Map<Key, Key[]>) : new Map(),
      },
    });
    // A new position, or a pawn sent back: nothing is picked up any more.
    api.current?.selectSquare(null);
  }, [fen, orientation, movable, pending]);

  useEffect(() => {
    api.current?.set({ highlight: { custom: highlights(lastMove, selected) } });
  }, [lastMove, selected]);

  useEffect(() => {
    const shapes = arrowShapes(arrows ?? []);
    api.current?.setAutoShapes(shapes);
  }, [arrows]);

  const spot = lastMove ? badgeSpot(lastMove.slice(2, 4), orientation) : null;

  return (
    <div role="img" aria-label={label} className={styles.wrap} data-palette={palette}>
      <div className={`${styles.frame} squircle`}>
        <div ref={element} className={styles.board} aria-hidden="true" />
      </div>
      <Coordinates bottom={orientation} />
      <div className={styles.badges} aria-hidden="true">
        {lastMove && category && !checking && (
          <BoardBadge
            // A new move or a turned board mounts a new badge: any animation still running stops.
            key={`${ply}-${orientation}-${lastMove}`}
            category={category}
            square={lastMove.slice(2, 4)}
            bottom={orientation}
            animate={stepped}
          />
        )}
        {spot && checking && (
          <span
            className={`${styles.badge} ${styles.checking}`}
            data-checking=""
            style={{ '--col': spot.column, '--row': spot.row } as CSSProperties}
          >
            <span className={styles.spinner} />
          </span>
        )}
      </div>
      {pending && (
        <PromotionPicker
          color={pending.to[1] === '8' ? 'white' : 'black'}
          square={pending.to}
          bottom={orientation}
          onPick={(piece) => {
            setPromotion(null);
            onMove(`${pending.from}${pending.to}${piece}`, pending.fen);
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  );
}

/**
 * Which piece a pawn on the last row becomes: four squares in the pawn's file, from the square
 * it reached towards the middle of the board. A tap anywhere else, or Escape, takes the move
 * back.
 */
function PromotionPicker({
  color,
  square,
  bottom,
  onPick,
  onCancel,
}: {
  color: Color;
  square: string;
  bottom: Color;
  onPick(piece: PromotionPiece): void;
  onCancel(): void;
}) {
  const text = useMessages().review.tryLine;
  const first = useRef<HTMLButtonElement>(null);
  const spot = badgeSpot(square, bottom);
  const down = spot.row === 0;
  const cancel = useRef(onCancel);
  useLayoutEffect(() => {
    cancel.current = onCancel;
  });

  // In the same task as the list is put on the page, before the browser paints it: with a passive
  // effect there was a moment when the list showed but Escape went to the page, which ignores it
  // while no line is on the board (a flaky e2e run, 1.1 round 1).
  useLayoutEffect(() => {
    first.current?.focus({ preventScroll: true });
    // Escape closes the list wherever the keyboard is, also after a click beside the board. Taken
    // first, on the way down: the screen's own Escape (leave the line) is not meant while it is
    // open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      cancel.current();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  return (
    <div
      role="dialog"
      aria-label={text.promote}
      className={styles.promotion}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className={`${styles.promotionList} squircle`}
        style={{ '--col': spot.column, '--row': down ? 0 : 4 } as CSSProperties}
        data-down={down ? '' : undefined}
      >
        {PROMOTION_PIECES.map((piece, index) => {
          const code = `${color === 'white' ? 'w' : 'b'}${piece.toUpperCase()}` as PieceCode;
          return (
            <button
              key={piece}
              ref={index === 0 ? first : undefined}
              type="button"
              aria-label={text.pieces[piece]}
              className={`${styles.promotionPiece} pressable`}
              style={{ backgroundImage: `url("${PIECE_IMAGES[code]}")` }}
              onClick={() => onPick(piece)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * a–h along the bottom row and 1–8 down the left-hand file, each in the shade of the other kind
 * of square (owner, 2026-11-15). Under the quality badge, which sits in the other corners.
 */
function Coordinates({ bottom }: { bottom: Color }) {
  const { files, ranks } = boardCoordinates(bottom);
  return (
    <div className={styles.coords} aria-hidden="true">
      {files.map((file) => (
        <span
          key={file.label}
          className={`${styles.file} ${file.light ? styles.onLight : styles.onDark}`}
          style={{ '--col': file.column } as CSSProperties}
        >
          {file.label}
        </span>
      ))}
      {ranks.map((rank) => (
        <span
          key={rank.label}
          className={`${styles.rank} ${rank.light ? styles.onLight : styles.onDark}`}
          style={{ '--row': rank.row } as CSSProperties}
        >
          {rank.label}
        </span>
      ))}
    </div>
  );
}
