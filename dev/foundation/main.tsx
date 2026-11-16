/**
 * Development page for step 1 of the redesign (BRIEF-UI section 10): the shared pieces laid out
 * the way the drawings place them, for screenshots side by side with docs/ui-redesign/screenshots.
 * Served only by the dev server (http://localhost:5173/dev/foundation/); the build never
 * includes it and nothing in src/ imports it.
 *
 * The positions below are the drawings' own example positions, used here only to compare
 * pictures. They are not game data and never reach the app.
 *
 * Query: ?part=tabs|segmented|boards|back  &tab=<0-3>  &lang=en|th
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Locale } from '@/i18n';
import '@/styles/fonts';
import '@/styles/tokens.css';
import '@/styles/base.css';
import { MiniBoard } from '@/ui/board/MiniBoard';
import { BackButton } from '@/ui/components/BackButton';
import { Segmented } from '@/ui/components/Segmented';
import { TabBar } from '@/ui/components/TabBar';
import { LanguageProvider, useMessages } from '@/ui/i18n/LanguageContext';
import dev from './dev.module.css';

const params = new URLSearchParams(location.search);
const part = params.get('part') ?? 'tabs';
const lang = (params.get('lang') ?? 'en') as Locale;
const tabPaths = ['/', '/games', '/courses', '/search'];
const path = tabPaths[Number(params.get('tab') ?? 0)] ?? '/';

const frame = { width: 390, height: 844, position: 'relative', overflow: 'hidden' } as const;

function Segments() {
  const text = useMessages();
  const [filter, setFilter] = useState<'all' | 'analyzed' | 'notYet'>('all');
  const [panel, setPanel] = useState<'move' | 'summary' | 'moves'>('move');
  const [site, setSite] = useState<'lichess' | 'chesscom'>('lichess');
  return (
    <div style={{ ...frame, padding: '20px' }}>
      <Segmented
        size="large"
        kind="tabs"
        label={text.games.filterLabel}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: text.games.filter.all },
          { value: 'analyzed', label: text.games.filter.analyzed },
          { value: 'notYet', label: text.games.filter.notYet },
        ]}
      />
      <div style={{ height: 24 }} />
      <Segmented
        size="small"
        kind="tabs"
        label={text.review.tabsLabel}
        value={panel}
        onChange={setPanel}
        options={[
          { value: 'move', label: text.review.tabs.move },
          { value: 'summary', label: text.review.tabs.summary },
          { value: 'moves', label: text.review.tabs.moves },
        ]}
      />
      <div style={{ height: 24 }} />
      <Segmented
        size="large"
        kind="radio"
        label={text.connect.sitesLabel}
        value={site}
        onChange={setSite}
        options={[
          { value: 'lichess', label: text.sites.lichess },
          { value: 'chesscom', label: text.sites.chesscom },
        ]}
      />
    </div>
  );
}

const HERO = 'r1bq1rk1/ppp1bppp/2n5/3pP3/2Bp2n1/5N1P/PPP2PP1/RNBQR1K1 w - - 0 9';
const TILES: [string, string, 'green' | 'orange' | 'purple'][] = [
  ['r1bqk2r/ppppbppp/2n5/4P3/2Bp2n1/5N2/PPP2PPP/RNBQ1RK1 w - - 0 1', 'f6g4', 'green'],
  ['r1bqkb1r/pppp1ppp/2n2n2/8/2BpP3/5N2/PPP2PPP/RNBQK2R w - - 0 1', 'g8f6', 'orange'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 1', 'e7e5', 'purple'],
];

function Boards() {
  return (
    <div style={{ ...frame, padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--dark-card)', padding: 16, borderRadius: 20, width: 350 }}>
        <MiniBoard fen={HERO} lastMove="d7d5" palette="blue" className={dev.hero} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
        {TILES.map(([fen, move, palette]) => (
          <MiniBoard key={fen} fen={fen} lastMove={move} palette={palette} className={dev.tile} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <MiniBoard fen={HERO} lastMove="d7d5" palette="blue" className={dev.row} />
        <MiniBoard
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          lastMove={null}
          palette="blue"
          className={dev.connect}
        />
      </div>
    </div>
  );
}

function Part() {
  if (part === 'segmented') return <Segments />;
  if (part === 'boards') return <Boards />;
  if (part === 'back')
    return (
      <div style={{ ...frame, padding: '56px 20px' }}>
        <BackButton />
      </div>
    );
  return (
    <div style={frame}>
      <TabBar />
    </div>
  );
}

const router = createMemoryRouter([{ path: '*', element: <Part /> }], { initialEntries: [path] });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider fixed={lang}>
      <RouterProvider router={router} />
    </LanguageProvider>
  </StrictMode>,
);
