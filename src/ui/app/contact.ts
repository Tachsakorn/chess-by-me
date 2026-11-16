/**
 * The e-mail "Contact us" opens (owner, 2026-11-15): one language, the app's at the moment of the
 * tap, a line inviting the user to write, room to write, then details that help with a bug and
 * that the user can delete. Never the user's Lichess or Chess.com account.
 */
import type { Locale, Messages } from '@/i18n';
import { CONTACT_EMAIL } from './config';

export interface ContactInfo {
  version: string;
  /** The window, in CSS pixels. */
  screen: { width: number; height: number };
  /** From the review screen: the game's address (none for a pasted PGN) and the move shown. */
  game?: { url: string | null; move: string };
}

export function contactMailto(text: Messages, locale: Locale, info: ContactInfo): string {
  const t = text.contact;
  const lines = [
    t.prompt,
    '',
    '',
    `${t.appVersion}: ${info.version}`,
    `${t.language}: ${text.settings.languageNames[locale]}`,
    `${t.screen}: ${Math.round(info.screen.width)}×${Math.round(info.screen.height)}`,
  ];
  if (info.game?.url) lines.push(`${t.game}: ${info.game.url}`);
  if (info.game) lines.push(`${t.move}: ${info.game.move}`);
  const subject = encodeURIComponent(t.subject);
  const body = encodeURIComponent(lines.join('\r\n'));
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}
