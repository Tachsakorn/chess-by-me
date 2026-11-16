import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { PositionEval } from '@/contract';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { graphPoints, plyAtFraction } from './graph';
import type { KeyMoment } from './panel';
import { qualityTone } from './panel';
import styles from './ReviewScreen.module.css';

interface EvalGraphProps {
  positions: readonly (PositionEval | undefined)[];
  lastPly: number;
  ply: number;
  moments: readonly KeyMoment[];
  onGoTo(ply: number): void;
  /** A line of the reader's own is on the board: the graph is about the game, so it fades. */
  faded?: boolean;
}

/**
 * White's winning chances across the game (top = White winning), the move on the board, and a
 * dot at each turning point. Tap or drag to go to a move (BRIEF-UI 6.2, item 6). Fills from the
 * left while the analysis runs.
 */
export function EvalGraph({
  positions,
  lastPly,
  ply,
  moments,
  onGoTo,
  faded = false,
}: EvalGraphProps) {
  const label = useMessages().review.graphLabel;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const points = graphPoints(positions, lastPly).map((point) => ({
    ply: point.ply,
    x: point.x * width,
    y: point.y * height,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const last = points.at(-1);
  const area =
    points.length > 1 && last
      ? `M0 ${height} L${points.map((p) => `${p.x} ${p.y}`).join(' L')} L${last.x} ${height} Z`
      : '';
  const xOf = (target: number) => (lastPly > 0 ? (target / lastPly) * width : 0);

  const jump = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onGoTo(plyAtFraction((event.clientX - rect.left) / rect.width, lastPly));
  };

  return (
    <div
      ref={box}
      role="img"
      aria-label={label}
      className={`${styles.graph}${faded ? ` ${styles.graphFaded}` : ''} squircle`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        jump(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) jump(event);
      }}
    >
      {width > 0 && (
        <svg aria-hidden="true" width={width} height={height} className={styles.graphSvg}>
          {area && <path d={area} className={styles.graphArea} />}
          {points.length > 1 && <polyline points={line} className={styles.graphLine} />}
          <line x1={xOf(ply)} x2={xOf(ply)} y1={0} y2={height} className={styles.graphCursor} />
          {moments.map((moment) => {
            const point = points.find((p) => p.ply === moment.ply);
            if (!point) return null;
            const tone = qualityTone(moment.category);
            return (
              <circle
                key={moment.ply}
                cx={point.x}
                cy={point.y}
                r={moment.ply === ply ? 4 : 3.5}
                className={tone ? styles[`fill-${tone}`] : styles['fill-neutral']}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
