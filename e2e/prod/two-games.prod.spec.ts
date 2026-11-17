import { test } from '@playwright/test';
import { analyseTwoGames } from '../twoGames';

// The production build, served by vite preview: the service worker is registered.
test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('engine - two games in a row, app opened again in between (production build)', async ({
    page,
  }) => {
    await analyseTwoGames(page, true);
  });
});

test.describe('without the service worker', () => {
  test.use({ serviceWorkers: 'block' });
  test('engine - two games in a row, app opened again in between (production build)', async ({
    page,
  }) => {
    await analyseTwoGames(page, false);
  });
});
