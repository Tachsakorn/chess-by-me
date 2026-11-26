import { expect, test } from '@playwright/test';

/** The Settings screen (1.2). */

test('settings - the language note sits in the Language row and describes its picker', async ({
  page,
}) => {
  await page.goto('/settings');
  const picker = page.getByRole('combobox', { name: 'Language' });
  await expect(picker).toHaveAccessibleDescription('Automatic follows your device language.');

  // Inside the row: the note's box lies within the row that holds the picker, under its label.
  const note = page.getByText('Automatic follows your device language.');
  const row = picker.locator('..');
  const [noteBox, rowBox, labelBox] = await Promise.all([
    note.boundingBox(),
    row.boundingBox(),
    row.getByText('Language', { exact: true }).boundingBox(),
  ]);
  if (!noteBox || !rowBox || !labelBox) throw new Error('not laid out');
  expect(noteBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 1);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(rowBox.y + rowBox.height + 1);
});
