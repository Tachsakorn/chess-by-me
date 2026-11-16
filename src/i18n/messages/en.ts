// English is the source language: its shape defines what every other language must provide.
// Wording follows docs/ui-redesign/BRIEF-UI.md section 7 and the approved drawings.
//
// Never translated (BRIEF-UI section 7): move category names, Bullet / Blitz / Rapid / Classical,
// moves in SAN, site names, Stockfish and "chessby.me". They still live here so that no
// component holds text of its own, and the Thai file repeats them unchanged.

import type { GameResult, MoveCategory, Termination, TimeClass } from '@/contract';

type Site = 'lichess' | 'chesscom';

const siteNames: Record<Site, string> = { lichess: 'Lichess', chesscom: 'Chess.com' };

export const en = {
  app: {
    name: 'Chess by me',
    /** The signature on the course covers, never translated: "chessby" + ".me". */
    signature: { name: 'chessby', domain: '.me' },
  },
  sites: siteNames,
  /** Never translated. */
  timeClass: {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
    daily: 'Daily',
  } satisfies Record<TimeClass, string>,
  /** Never translated. */
  category: {
    brilliant: 'Brilliant',
    great: 'Great',
    best: 'Best',
    excellent: 'Excellent',
    good: 'Good',
    book: 'Book',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    miss: 'Miss',
    blunder: 'Blunder',
  } satisfies Record<MoveCategory, string>,
  game: {
    /** The result seen from the user's side. */
    outcome: { win: 'Win', loss: 'Loss', draw: 'Draw' },
    /** "Win · Blitz" */
    outcomeAndClass: (outcome: string, timeClass: string) => `${outcome} · ${timeClass}`,
    /** "ni5hu – EricRosen" */
    players: (white: string, black: string) => `${white} – ${black}`,
    /** "1-0 by checkmate"; a game whose ending is unknown shows its result alone. */
    ending: (result: GameResult, termination: Termination) => {
      const how = endingWords[termination];
      return how ? `${result} ${how}` : result;
    },
    /** "Accuracy 93.7 / 88.4" (White / Black) */
    accuracyPair: (white: string, black: string) => `Accuracy ${white} / ${black}`,
    noValue: '—',
  },
  nav: {
    mainMenu: 'Main menu',
    home: 'Home',
    games: 'My Games',
    courses: 'Courses',
    search: 'Search',
    back: 'Back',
    /** The avatar at the top of Home (the drawing's label). */
    account: 'My account',
  },
  home: {
    title: 'Home',
    ratingsLabel: (site: Site) => `Your ${siteNames[site]} ratings`,
    /** Spoken, two sites connected: the ratings switch site when tapped (owner, 2026-11-15). */
    ratingsSwitch: (site: Site, other: Site) =>
      `Your ${siteNames[site]} ratings. Tap to show ${siteNames[other]}.`,
    updates: 'Updates when you open the app',
    updateFailed: "Couldn't update. Showing saved data.",
    /** The site answered "too many requests" (HTTP 429): the app waits a minute before asking again. */
    updateBusy: 'Try again in a moment. Showing saved data.',
    /** "Lichess · <username> · Updates when you open the app" */
    accountLine: (site: Site, username: string, note: string) =>
      `${siteNames[site]} · ${username} · ${note}`,
    /** Two sites connected: after the site name and the switch icon (owner, 2026-11-15). */
    accountLineAfterSite: (username: string, note: string) => ` · ${username} · ${note}`,
    continue: 'Continue',
    pausedAt: (move: string) => `Paused at ${move}`,
    latestReview: 'Latest review',
    notAnalyzed: 'Not analyzed yet',
    recentGames: 'Recent Games',
    /** Spoken: the rating change. */
    ratingUp: (n: number) => `up ${n}`,
    ratingDown: (n: number) => `down ${n}`,
  },
  games: {
    title: 'My Games',
    /** "Lichess · <username>" */
    accountLine: (site: Site, username: string) => `${siteNames[site]} · ${username}`,
    accountLineFailed: (site: Site, username: string) =>
      `${siteNames[site]} · ${username} · Couldn't update`,
    /** Added to the account line when every site that failed asked the app to wait (HTTP 429). */
    tryLater: 'Try again in a moment',
    /** Every connected account: "Lichess · a · Chess.com · B" (owner, 2026-11-15). */
    accountsLine: (accounts: readonly { site: Site; username: string }[]) =>
      accounts.map((a) => `${siteNames[a.site]} · ${a.username}`).join(' · '),
    /** The same, saying which site could not be updated (no site named when none could). */
    accountsLineFailed: (
      accounts: readonly { site: Site; username: string }[],
      failed: readonly Site[],
    ) => {
      const line = accounts.map((a) => `${siteNames[a.site]} · ${a.username}`).join(' · ');
      const all = accounts.every((a) => failed.includes(a.site));
      return all
        ? `${line} · Couldn't update`
        : `${line} · Couldn't update ${failed.map((s) => siteNames[s]).join(', ')}`;
    },
    filterLabel: 'Filter games',
    filter: { all: 'All', analyzed: 'Analyzed', notYet: 'Not yet', others: 'Others' },
    /** Games opened from Search, a game link or pasted PGN (Fable review A6-06). */
    recentlyOpened: 'Recently opened',
    /** Where an other game came from, in its row. */
    from: { lichess: 'Lichess', chesscom: 'Chess.com', pgn: 'Pasted PGN' },
    /** "Blitz · Pasted PGN · Nov 13"; the time class is left out when unknown. */
    otherMeta: (timeClass: string | null, from: string, date: string) =>
      [timeClass, from, date].filter(Boolean).join(' · '),
    /** Under the two accuracies of an other game: neither side is the user. */
    whiteBlack: 'White · Black',
    noOthers: 'No other games yet',
    noOthersHint: 'Games you open from Search, a game link or a pasted PGN show up here.',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    /** "Ni5hu · Nov 12" */
    meta: (opponent: string, date: string) => `${opponent} · ${date}`,
    accuracy: 'Accuracy',
    analyze: 'Analyze',
    analyzing: (percent: number) => `${percent}%`,
    noGames: 'No games yet',
    noGamesHint: (site: Site) => `Play a game on ${siteNames[site]} and it will show up here.`,
    noGamesHintBoth: 'Play a game on Lichess or Chess.com and it will show up here.',
    nothingHere: 'Nothing here',
    tryAnotherFilter: 'Try another filter.',
    /** Spoken: the button of one row. */
    analyzeGame: (players: string) => `Analyze ${players}`,
  },
  review: {
    title: 'Game Review',
    tabsLabel: 'Review details',
    tabs: { move: 'Move', summary: 'Summary', moves: 'All Moves' },
    boardAt: 'Board at the start',
    /** The evaluation bar (owner, 2026-11-15): "Evaluation +2.5, White is better". */
    evalLabel: (figure: string, leader: 'white' | 'black' | 'equal') =>
      `Evaluation ${figure}, ${leader === 'equal' ? 'equal' : leader === 'white' ? 'White is better' : 'Black is better'}`,
    evalPending: 'Evaluation not ready yet',
    /** The Move panel when the win chance moved less than 1% (owner, 2026-11-15). */
    alreadyLost: "Already lost. This move doesn't change the result.",
    stillWinning: 'Still winning.',
    /** A Miss that let a forced mate go: "Missed mate in 1." */
    missedMate: (moves: number) => `Missed mate in ${moves}.`,
    boardAfter: (move: string) => `Board after ${move}`,
    /** "Board after 8... d5, a mistake": the board's label once the move is analysed. */
    boardAfterCategory: (move: string, category: MoveCategory) =>
      `Board after ${move}, ${categoryPhrase[category]}`,
    graphLabel: 'Evaluation across the game. Tap to jump to a move.',
    winDropped: (n: number) => `Win chance dropped ${n}%`,
    winHeld: 'Win chance held',
    betterWas: 'Better was',
    bestWas: 'Best was',
    bestMove: 'Best move',
    bookMove: 'Book move',
    start: 'Start of the game',
    startHint: 'Tap › to step through the moves',
    analyzing: (n: number) => `Analyzing… ${n}%`,
    downloading: (n: number) => `Downloading the engine… ${n}%`,
    accuracyOf: (name: string) => `${name} accuracy`,
    stopped: "Analysis didn't finish. Tap to try again.",
    stepper: {
      label: 'Step through the game',
      start: 'Go to start',
      previous: 'Previous move',
      next: 'Next move',
      end: 'Go to end',
      flip: 'Flip board',
    },
    /** Spoken: the side of a player row. */
    white: 'White',
    black: 'Black',
    /** "Try your own move": a line of the reader's own on the review board (owner, 2026-11-16). */
    tryLine: {
      /** The bar in place of the tabs: "Your line · from move 8". */
      title: (move: number) => `Your line · from move ${move}`,
      back: 'Back to game',
      /** The badge of the Move panel while the engine thinks. */
      checking: 'Checking',
      /** The reader's own move or the engine's reply: the same words for both. */
      checkingMove: 'Checking this move',
      /** "Game move was 8... d5?" */
      gameMoveWas: (move: string) => `Game move was ${move}`,
      better: (move: string) => `Better than the game move ${move}`,
      /** Within 1% of the win chance: another move can be as good, so not "the same". */
      same: 'As good as the game move',
      worse: (move: string) => `Worse than the game move ${move}`,
      /** Followed by the engine's line: "Best reply 9. Bxh6 gxh6". */
      bestReply: 'Best reply',
      /** At the start of an analysed game, under "Tap › to step through the moves". */
      startHint: 'Drag a piece to try your own move',
      /** Spoken: the choice of piece for a pawn on the last row. */
      promote: 'Choose a piece',
      pieces: { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' },
    },
  },
  courses: {
    title: 'Courses',
    intro: "Short, hands-on lessons. We're building them now.",
    startHere: 'Start here',
    comingSoon: 'Coming soon',
    byPhase: 'By Phase',
    names: {
      basics: 'Basics',
      openings: 'Openings',
      tactics: 'Tactics',
      middlegame: 'Middlegame',
      endgame: 'Endgame',
      mates: 'Checkmate Patterns',
    },
  },
  search: {
    title: 'Search',
    placeholder: 'Player name or game link',
    fieldLabel: 'Search players or games',
    reviewAny: 'Review Any Game',
    findPlayer: 'Find a player',
    findPlayerSub: 'See their recent games on Chess.com or Lichess',
    pasteLink: 'Paste a game link',
    pasteLinkSub: 'From Chess.com or Lichess',
    pastePgn: 'Paste PGN',
    pastePgnSub: 'Any game, from any source',
    publicNote: "Games on Chess.com and Lichess are public, so you can review anyone's games.",
    review: 'Review',
    pgnLabel: 'PGN',
    pgnInvalid: "This PGN couldn't be read.",
    /** A pasted PGN with more than one game: only the first opens (Fable review A6-06). */
    pgnMany: (count: number, players: string) =>
      `This PGN has ${count} games. The first one will open (${players}).`,
    noPlayer: (name: string) => `No player named “${name}” on Lichess or Chess.com`,
    close: 'Close',
    chesscomLink: "Chess.com game links can't be opened yet. Paste the PGN instead.",
    gameNotLoaded: "This game couldn't be loaded.",
    notAGameLink: "That isn't a game link.",
    offline: "Can't reach Lichess or Chess.com right now.",
    busy: 'Lichess or Chess.com asked us to wait. Try again in a moment.',
    searching: 'Searching…',
  },
  settings: {
    title: 'Settings',
    groups: {
      accounts: 'Accounts',
      general: 'General',
      analysis: 'Analysis',
      storage: 'Storage',
      about: 'About',
    },
    storageUsed: 'Space used on this device',
    /** Megabytes, one decimal. */
    megabytes: (mb: number) => `${mb.toFixed(1)} MB`,
    storageUnknown: 'Unknown',
    clearData: 'Clear saved data',
    clearTitle: 'Clear everything saved?',
    clearBody:
      'Your connected accounts, games and reviews will be deleted from this device. Nothing changes on Lichess or Chess.com.',
    clearConfirm: 'Clear everything',
    clearCancel: 'Cancel',
    connect: 'Connect',
    accountsNote: 'Your usernames, games and reviews are kept on this device only.',
    language: 'Language',
    languageAuto: (current: string) => `Automatic · ${current}`,
    languageNames: { en: 'English', th: 'ไทย' },
    automatic: 'Automatic',
    appearance: 'Appearance',
    /** Move sounds on the review screen (owner, 2026-11-16). */
    sound: 'Sound',
    languageNote: 'Automatic follows your device language.',
    engine: 'Engine',
    /** Engine and depth on one row, to make room for Sound (2026-11-16). */
    engineDepth: (engine: string, depth: number) => `${engine} · depth ${depth}`,
    buyCoffee: 'Buy me a coffee',
    contact: 'Contact us',
    version: 'Version',
    licenses: 'Open-source licenses',
    privacy: 'Privacy',
    connected: 'Connected',
    engineValue: (version: string, variant: string) => `Stockfish ${version} ${variant}`,
  },
  /** The e-mail "Contact us" opens, in the app's language (owner, 2026-11-15). */
  contact: {
    subject: 'Chess by me feedback',
    prompt: 'Tell us what happened:',
    appVersion: 'App version',
    language: 'Language',
    screen: 'Screen',
    game: 'Game',
    move: 'Move',
  },
  storage: {
    title: "This browser isn't letting Chess by me save",
    body: 'Chess by me keeps your games and reviews in this browser. Allow site data (cookies and website data) for this site, leave private browsing, or open it in another browser.',
    retry: 'Try again',
    saveFailed:
      "Couldn't save on this device. It may be full: free some space, or clear saved data in Settings.",
    dismiss: 'Close',
  },
  error: {
    title: 'Something went wrong',
    body: "This page couldn't be shown. What is saved on this device is safe.",
    home: 'Back to Home',
  },
  privacy: {
    title: 'Privacy',
    sections: [
      {
        title: 'Kept on this device',
        body: 'Your usernames, the games the app loads, their reviews, your ratings and where you stopped in each game. They stay in this browser and are never sent to us.',
      },
      {
        title: 'Sent to Lichess and Chess.com',
        body: 'To load games, your browser asks Lichess and Chess.com for the usernames you connect or look up, and for the game of a Lichess link you paste. Like any website, they see your IP address. Nothing else is sent.',
      },
      {
        title: 'Not in this app',
        body: 'No tracking, no analytics, no ads, no cookies. Cloudflare delivers the site, like a web host.',
      },
    ],
    contactTitle: 'Questions',
    contactBody: 'Write to us at',
  },
  licenses: {
    title: 'Open-source licenses',
    note: 'Chess by me is free software under GPL-3.0. It is built with these.',
    notices: 'Full licence texts and notices',
    source: 'Source code',
  },
  connect: {
    title: 'Connect your chess account',
    intro: 'Your latest games come in every time you open the app. No password needed.',
    sitesLabel: 'Where you play',
    /** Shown in the empty field. Never a real account name (owner, 2026-11-15). */
    placeholder: (site: Site) => `Your ${siteNames[site]} username`,
    username: (site: Site) => `${siteNames[site]} username`,
    continue: 'Continue',
    checking: 'Checking…',
    pasteInstead: 'Paste a PGN instead',
    laterNote: 'You can connect the other site later in Settings.',
    notFound: (name: string, site: Site) => `We couldn't find “${name}” on ${siteNames[site]}.`,
    offline: (site: Site) =>
      `Can't reach ${siteNames[site]} right now. Check your connection and try again.`,
    busy: (site: Site) => `${siteNames[site]} asked us to wait. Try again in a moment.`,
    disconnect: 'Disconnect',
    disconnectTitle: (site: Site) => `Disconnect ${siteNames[site]}?`,
    disconnectBody: (name: string) =>
      `The games and reviews of ${name} saved on this device will be deleted.`,
    disconnectConfirm: 'Disconnect and delete',
    disconnectCancel: 'Cancel',
  },
};

const categoryPhrase: Record<MoveCategory, string> = {
  brilliant: 'a brilliant move',
  great: 'a great move',
  best: 'the best move',
  excellent: 'an excellent move',
  good: 'a good move',
  book: 'a book move',
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  miss: 'a miss',
  blunder: 'a blunder',
};

const endingWords: Record<Termination, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  abandonment: 'abandoned',
  stalemate: 'stalemate',
  repetition: 'by repetition',
  'fifty-move': 'fifty-move rule',
  'insufficient-material': 'insufficient material',
  'timeout-vs-insufficient-material': 'time out, insufficient material',
  agreement: 'by agreement',
  unknown: '',
};

export type Messages = typeof en;
