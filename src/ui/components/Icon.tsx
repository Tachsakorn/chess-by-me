import { ICON, type IconName } from './icons';

interface IconProps {
  name: IconName;
  size: number;
  stroke: number;
  filled?: boolean;
  className?: string;
}

/** A line icon from the drawings; decorative, so hidden from screen readers. */
export function Icon({ name, size, stroke, filled = false, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON[name]} />
    </svg>
  );
}
