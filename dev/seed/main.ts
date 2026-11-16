/**
 * Development page: fills this browser's app storage with the real-game fixtures, as if the user
 * had connected the Lichess account "ni5hu" (the player of all three fixtures), then opens the
 * app. Served only by the dev server (http://localhost:5173/dev/seed/); never part of the build.
 *
 * Query:
 *   analyzed=<fixture ids, comma separated>  saves those fixtures' analyses (default: LAGvRNey)
 *   paused=<ply>                              the user left LAGvRNey at that move (default 16)
 *   ratings=drawing                           saved ratings = the drawing's example figures, for
 *                                             comparing layout only; they are not anyone's data
 *   empty=1                                   the account has no games
 *   none=1                                    no account at all (first launch)
 *   go=<path>                                 where to go afterwards (default /)
 */
import type { GameAnalysis, GameRecord } from '@/contract';
import { local, ownerKey } from '@/data/local';

const params = new URLSearchParams(location.search);
const games = import.meta.glob<{ default: GameRecord }>('../../fixtures/*/game.json', {
  eager: true,
});
const analyses = import.meta.glob<{ default: GameAnalysis }>(
  '../../fixtures/*/analysis-lite.json',
  {
    eager: true,
  },
);

// Start from nothing.
await new Promise<void>((resolve) => {
  const request = indexedDB.deleteDatabase('chessbyme');
  request.onsuccess = request.onerror = request.onblocked = () => resolve();
});
localStorage.clear();

if (params.get('none') !== '1') {
  const owner = ownerKey('lichess', 'ni5hu');
  await local.setAccounts({ lichess: 'ni5hu', chesscom: null, primary: 'lichess' });
  if (params.get('empty') !== '1') {
    const records = Object.values(games).map((module) => module.default);
    await local.putGames(records, owner);
    const wanted = (params.get('analyzed') ?? 'LAGvRNey').split(',').filter(Boolean);
    for (const record of records) {
      const analysis = Object.entries(analyses).find(([path]) =>
        path.includes(record.id.replace(':', '-')),
      )?.[1].default;
      if (analysis && wanted.some((id) => record.id.endsWith(id))) {
        await local.putAnalysis(analysis, record);
      }
    }
    const paused = Number(params.get('paused') ?? 16);
    if (paused > 0) {
      await local.setProgress('lichess:LAGvRNey', { ply: paused, flipped: false, at: Date.now() });
    }
  }
  if (params.get('ratings') === 'drawing') {
    // The drawing's example figures (docs/ui-redesign/reference/Main.dc.html), layout only.
    await local.setRatings(owner, {
      bullet: { rating: 1513, change: 19 },
      blitz: { rating: 1354, change: -23 },
      rapid: { rating: 1532, change: null },
    });
  }
}

document.getElementById('out')!.textContent = 'Seeded.';
location.replace(params.get('go') ?? '/');
