import { test } from '@playwright/test';
import { analyseTwoGames } from './twoGames';

// Dev server: no service worker (it is registered only in production builds).
test('engine - two games in a row, app opened again in between (dev, no service worker)', async ({
  page,
}) => {
  await analyseTwoGames(page, false);
});
