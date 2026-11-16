/** Icon paths from the drawings (viewBox 0 0 24 24, round caps and joins). */
export const ICON = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  games: 'M4 4h16v16H4zM4 12h16M12 4v16',
  courses: 'M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-4a3 3 0 0 0-3 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  /** Two arrows, one each way: switch the ratings' site on Home (owner, 2026-11-15). */
  swap: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4',
  first: 'M6 5v14M18 6l-8 6 8 6z',
  last: 'M18 5v14M6 6l8 6-8 6z',
  flip: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  player: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  pgn: 'M8 4h8l3 3v13H5V4h3zM8 11h8M8 15h6',
} as const;

export type IconName = keyof typeof ICON;
