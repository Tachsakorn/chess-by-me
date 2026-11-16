/**
 * Settings of the app that are not the user's. BRIEF-UI section 9, item 3: the "Buy me a coffee"
 * link is not decided yet; while it is empty, Settings hides the row.
 */
export const BUY_ME_A_COFFEE_URL = '';

/** The public source code repository (GPL-3.0, Fable review A5-01 and A9-02). */
export const SOURCE_CODE_REPOSITORY = 'https://github.com/Tachsakorn/chess-by-me';

/**
 * The one switch for the "Source code" rows of Settings and the licences page (owner,
 * 2026-11-15): false hides them until the owner makes the repository public at launch; set it to
 * true then.
 */
export const SOURCE_CODE_PUBLISHED = true;

/** The repository's address when it is published, otherwise empty. */
export function sourceCodeUrl(published: boolean): string {
  return published ? SOURCE_CODE_REPOSITORY : '';
}

/** What the screens use: empty (row hidden) until SOURCE_CODE_PUBLISHED is true. */
export const SOURCE_CODE_URL = sourceCodeUrl(SOURCE_CODE_PUBLISHED);

/** Where "Contact us" in Settings writes to (owner, 2026-11-15). */
export const CONTACT_EMAIL = 'chessbyme.support@gmail.com';
