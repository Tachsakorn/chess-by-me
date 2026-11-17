import { expect, test } from '@playwright/test';
import { seed } from './support';

/**
 * Pasted PGN that cannot be reviewed (Fable review A1-06, owner 1.1 round 2): a variant or a game
 * from a set-up position is told apart from text that is simply unreadable, in the same place.
 */
test('pgn - a variant is "not supported yet", unreadable text "couldn\'t be read"', async ({
  page,
}) => {
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  const field = sheet.getByRole('textbox');
  const alert = sheet.getByRole('alert');

  await field.fill(
    '[Variant "Chess960"]\n[FEN "bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9"]\n[SetUp "1"]\n\n9. g3 Nc6 *',
  );
  await sheet.getByRole('button', { name: 'Review' }).click();
  await expect(alert).toHaveText(
    "This game uses a variant or custom start position, which isn't supported yet.",
  );
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/search/);

  // Typing clears it; text that is not a game gets the old message.
  await field.fill('hello there');
  await expect(alert).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Review' }).click();
  await expect(alert).toHaveText("This PGN couldn't be read.");
});
