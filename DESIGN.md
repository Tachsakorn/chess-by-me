# Design — Chess by me

The design system of the app. Every value lives in `src/styles/tokens.css` (custom properties)
and the type scale in `src/styles/base.css`; components use those tokens and never their own
colour, spacing, radius or shadow.

## Overall look

A white mobile app with the Apple system font, set heavy and tight (headings at weight 800).
Colour comes from **content** only (the four board colour sets and the course covers), never
from frames or backgrounds. Groups of information sit on a light grey fill without shadow.
Things that are "raised" (boards, tiles, the black card, the floating bars) have one soft shadow
falling downwards. Glass is used on the two floating bars only: the tab bar and the move stepper.

## Tokens

| Group | Values |
|---|---|
| Background and text | `--bg` #fff, `--text` #1d1d1f, `--text-2` #6e6e73, `--text-3` #6e6e73 (same as `--text-2`, for WCAG AA contrast), `--text-clock` #48484a, `--fill` #F4F4F5, `--chevron` #c7c7cc, `--hairline` 0.5px rgba(0,0,0,.08) |
| Black card | `--dark-card` #1c1c1e, `--dark-card-text-2` #a1a1a6 |
| Primary button | `--primary` #1d1d1f, `--on-primary` #fff |
| Move quality (dots, text and board badges only) | `--q-brilliant` #0E7C86, `--q-great` #1A7F4B, `--q-best` #5A9B3B, `--q-excellent` #7FAE5A, `--q-good` #5E7F4E (Good badge background `--q-good-bg` #E6EEDF), `--q-book` #9C7A54, `--q-inaccuracy` #D9A21B, `--q-mistake` #E8590C, `--q-miss` = Mistake, `--q-blunder` #C4321C. One colour per category everywhere: board badge, dots in the panels, dots on the graph. Move text in the move list: Inaccuracy `--q-inaccuracy-text` #966319, Mistake/Miss `--q-mistake-text` #BC480A (the badge colours are too light for text on grey); Book text is not coloured |
| Board badges | `--badge-mark` #fff (mark and ring), `--badge-border-width` 1.5px, `--shadow-badge` 0 1px 3px rgba(17,24,39,.30), `--shadow-callout` 0 0 0 .5px rgba(0,0,0,.06) + 0 3px 10px rgba(17,24,39,.28) (the Brilliant name tag, on `--surface`) |
| Boards (light/dark squares) | blue #E3EAF3/#8EA6C6, green #E7EFDF/#93B07E, orange #F6E6DD/#D79A7E, purple #ECE7F5/#A497C6, last move #F2E7A6/#D3BD62 |
| Switch (Settings: Sound) | `--switch-on` = `--primary`, `--switch-off` #86868b (3.3:1 on the grey `--fill`, WCAG 1.4.11); the knob is `--surface` with `--shadow-segment-on` |
| Course covers | red #E5322D, blue #2563EB, pink #D6336C, amber #E8930C, green #16A34A |
| Spacing | page edge 20, between sections 32 (Home) / 40 (Courses, Search), heading to content 12 |
| Radius | 20 (black card, course covers) · 16 (grey groups, panels) · 12 (boards, fields, graph) · 8 (56px mini boards), with `corner-shape: squircle` · buttons, chips, badges, tabs and segmented controls are fully rounded (`--r-pill`) · icons in Search rows 10 (`--r-icon`) |
| Shadows | cover, cover-sm, tile, hero, segment-on, badge, callout, glass (see the tokens file) |

## Type

`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, Anuphan, "Noto Sans Thai", sans-serif`.
Inter and Anuphan are self-hosted (`@fontsource`, OFL), Latin and Thai subsets only, weights
400–800 (Anuphan has no 800). The scale is a set of `.t-*` classes in `src/styles/base.css`:
large-title 34/40 800, course-hero 52, course-title 36, section 22/28 700, stat 24/28 800,
move-title 24/30 800, headline 17/22 700, nav-title 17/22 600, body-lg 17/23, row 16/21,
body 15/20, caption 13/18, tab 11/13 600. Thai text always has letter-spacing 0 and is never set
at 800 in long passages. Numbers that must line up use `tabular-nums`.

## Screen sizes

Designed at 390×844; every page fits one screen there (except Courses). Top and bottom spacing
follow the safe areas (`--pad-top-*`, `--float-bottom`). Home and Settings scroll only on screens
lower than 760. Pages other than the review are at most 560 wide; the tab bar is at most 440 wide
and centred. The review screen sizes the board from the screen height; on wide screens (900 and
up, iPad landscape) it uses two columns: the board on the left, a 390-wide column on the right.

## Shared components (`src/ui/components`, `src/ui/board`)

- **TabBar**: glass bar with four tabs, 62 high, radius 31; the selected tab has
  `--tab-active-bg`; only the Home icon is filled.
- **BackButton**: grey circle 44, arrow 18, stroke 2.6.
- **Segmented**: large (36/30) and small (32/26); a white thumb slides to the selection in 200ms.
- **MiniBoard**: a still board from a FEN, drawn as SVG with the cburnett pieces, last move
  highlighted, colour set chosen per game (hash of the game id).
- **Review board**: always the blue set. Coordinates (review board only): Inter 600 at about 2.7%
  of the board width, a–h in the bottom-right corner of the bottom row, 1–8 in the top-left corner
  of the left file, in the colour of the opposite square; they follow the board's orientation and
  sit under the move badge.
- **Evaluation bar** (`src/ui/review/EvalBar.tsx`): vertical, left of the board, 6 away, as high
  as the board, radius `--eval-radius` 7. 14 wide without numbers on phones; 20 wide with the
  value (Inter 700 10px, 8px for a four-character mate such as "−#13") from 700 wide. Colours
  `--eval-white` #fff and `--eval-black` #3A3A3C, edge `--eval-edge`, middle mark `--eval-mid`.
  Its length is White's expected score (`whiteExpected`); a mate fills it. White's side is always
  at White's end of the board. Moves in 300ms ease-out; before analysis it sits at 50% at 0.45
  opacity.
- **Move table** (wide screens only): with the Move and Summary tabs, a `--fill` box (radius 16)
  under the panel lists every move, one full move per 40-high row: move number (40 wide,
  `--text-3`) | White | Black, 17px text, an 18px badge slot before every move so the text lines
  up; the current move is bold on white, a tap jumps to it, and it is kept in view. Phones and
  iPad portrait use the All Moves tab instead.
- **Two connected sites**: My Games, Home's Recent Games and Continue merge the games of every
  connected account, newest first; with two sites the site name follows the first line of a row
  (13px `--text-3`); a site that cannot be updated is named under the heading while the other's
  games still show. The rating strip on Home shows one site at a time; tapping the strip or the
  line under it switches (remembered in `cbm.ratingsSite`).
- **Move badges** (`src/ui/review/BoardBadge.tsx`): on the review board, at the top-right corner of
  the current move's destination square, a circle 41% of a square (about 18px on a 350 board),
  5% in from the square's edges, white ring 1.5, `--shadow-badge`, above the piece, never clipped
  by the board's edge. White marks, Inter 800 about 11px: Brilliant "!!", Great "!", Book an open
  book icon (our own, stroke 2.6), Inaccuracy "?!", Mistake "?", Miss "×", Blunder "??"; Best a
  filled white five-point star, Excellent a white check mark, Good a `--q-good` check mark on
  `--q-good-bg` (all drawn for this app). In the move lists only Brilliant, Great, Inaccuracy,
  Mistake, Miss and Blunder get an 18px badge, and Book only on the first and the last move still
  labelled Book; Best, Excellent and Good get none. Miss's "×" appears only inside the badge, never
  after the move text. The board has an aria-label naming the category, for example "Board after
  8... d5, a mistake".
- **Badge animation**: plays once, only when stepping forward one move (next button, right arrow,
  holding next); not when jumping, dragging the graph, tapping the move list, going back or
  flipping the board; a new move cuts the old animation; off under `prefers-reduced-motion`.
  Every category except Brilliant: the badge pops in 160ms, scale 0 → 1.3 → 1,
  `cubic-bezier(.34,1.56,.64,1)`. Brilliant: a white name tag 60% of a square high, fully rounded,
  `--shadow-callout`, holding a `--q-brilliant` circle with "!!" and the word "Brilliant" (Inter 800,
  `--q-brilliant`), centred on the top edge of the destination square and kept 4px inside the board;
  it pops in over 160ms (scale 0.55 → 1.06 → 1, opacity 0 → 1, `cubic-bezier(.2,.8,.2,1)`), holds
  until 1100ms, then shrinks to 0.9 and fades by 1250ms while the corner badge pops in. Web
  Animations only. `/dev/badges/` on the dev server shows every category and the board-edge cases.
- **Try your own move** (review screen; `src/ui/review/tryLine.ts`, `useTryLine.ts`): once a game is
  analysed, in any position, the side to move can be dragged, or tapped and then a square tapped.
  A picked-up piece shows where it can go: a dot in the middle of an empty square (12px on a
  phone's board, 3.43% of a bigger board) in `--board-dest` rgba(17,24,39,0.24), a ring 4px thick
  (1.14% of the board) inside a square whose piece it can take; its own square takes the last-move
  highlight. A move that is not legal springs back. A pawn reaching the last row opens a four-square
  list in its file (queen, rook, bishop, knight) on `--surface`, radius 8, `--shadow-callout`;
  a tap elsewhere or Escape takes the move back.
  - The move of the game steps along the game. Any other move starts a line: in place of the tabs a
    bar 32 high, radius 16, `--fill`, padding 3 3 3 12, with "Your line · from move 8" (13px 600
    `--text-2`) on the left and a "Back to game" button on the right (26 high, radius 13,
    `--primary` with `--on-primary` text, 13px 600, the back arrow before it, 44 high to a finger).
    The evaluation graph fades to 0.5.
  - While the engine thinks: in the badge's place and size a grey circle (`--q-checking` #8e8e93)
    with a white ring turning once every 800ms (still under `prefers-reduced-motion`), the
    evaluation bar at 0.45, and in the Move panel the move with a "Checking" badge, "Checking this
    move" (the same words for the reader's move and the engine's reply) and, in grey, "Game move
    was 8... d5?".
  - The result: the usual badge with its animation, the evaluation bar, and in the Move panel the
    move, its category and the evaluation before → after; for the first move of the line only,
    "Better than the game move 8... d5?" / "As good as the game move" (within 1% of the win
    chance; another move can earn it, hence not "the same") / "Worse than the game move
    8... d5?"; and in grey "Best reply 9. Bxh6 gxh6". Short screens keep two lines.
  - Step bar: Next goes to the line's next move, or plays the other side's best move and checks it;
    Previous steps back in the line and then returns to the game; First and Last return to the game
    and go to its start or end; Back to game and Escape return to the position the line left from.
    A new move in the middle of a line cuts what followed. Left and right arrows work in a line;
    the result is announced through `aria-live`.
  - Nothing of a line is saved: it is gone when the screen is left, and the game's analysis and
    accuracy never change. One engine, the app's own settings (depth 18, every position on its own),
    made on the first tried move and stopped when the screen is left; results remembered by FEN in
    memory; labels from the same function as the game's moves.
- **SwitchRow** (`GroupedList.tsx`): a 48px row, label on the left, a 51×31 switch on the right
  (slides in 200ms, no motion with reduced motion). The whole row flips it; it is a real checkbox
  with `role="switch"`.
- **Settings**: a "Sound" switch in General after Language, on by default, kept in `cbm.sound`.
  Engine and depth share one row ("Stockfish 17.1 lite · depth 18") so Settings fits a 390×844
  screen without scrolling in both languages.
- **Move sounds** (`src/ui/sound/`): made in code with the Web Audio API, no sound files. A
  wood-on-wood knock: one for a move (castling too); a light then a heavier, lower one for a
  capture; a knock then a higher one for check; three rising knocks for promotion, mate and the
  game's last move (end > check > capture > move). Played for one step forward or back (the step
  buttons or arrow keys; back plays the move taken back), a move tried on the board, and the
  engine's reply. Silent for a jump to the start or end, the steps that repeat while a button or
  key is held, a tap on the graph or the move list, flipping the board and leaving a line. On
  iPhone and iPad the audio session is "ambient": the silent switch mutes it and the user's music
  keeps playing. Sound starts after the first tap, as browsers require.
- **Every button**: hover; pressed fades to 0.6 and back in 150ms; focus ring 2px `--text`, 2px
  away; disabled 0.4; touch target at least 44×44.

## Rules

No gradients (except the avatar), no emoji, no glass outside the floating bars, no shadow on grey
groups, and no animation other than: pieces sliding 150ms, segmented 200ms, the PGN sheet 250ms,
move badges 160ms (Brilliant 1250ms), the turning ring while a tried move is checked; all of them
off under `prefers-reduced-motion`. There is no
dark mode yet.
