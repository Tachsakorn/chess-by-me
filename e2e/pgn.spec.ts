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

test('pgn - an annotated PGN (several comments after a move) opens', async ({ page }) => {
  // The form of Lichess's annotated export (1.1.1, Fable review 1.1 B5-02).
  await seed(page, '/search');
  await page.getByRole('button', { name: /Paste PGN/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByRole('textbox')
    .fill(
      '[Event "Casual game"]\n[White "Annotated White"]\n[Black "Annotated Black"]\n[Result "*"]\n\n' +
        '1. e4 { [%eval 0.18] [%clk 0:01:00] } 1... e5 { [%eval 0.2] [%clk 0:01:00] } ' +
        '2. Nf3 { [%clk 0:00:59] } 2... f6?? { (0.17 → 2.19) Blunder. Nc6 was best. } ' +
        '{ [%eval 2.19] [%clk 0:00:59] } (2... Nc6 3. Bb5 a6) 3. Nxe5 { [%clk 0:00:58] } *',
    );
  await sheet.getByRole('button', { name: 'Review' }).click();
  await page.waitForURL(/\/review\//);
  await expect(page.getByText('Annotated White')).toBeVisible();
});
