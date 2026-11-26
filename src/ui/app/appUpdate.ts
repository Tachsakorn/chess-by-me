/**
 * A new version of the app while a page of the old one is open (1.1.1, Fable review 1.1 B1-02).
 *
 * A page keeps running the code it was loaded with, but after a deploy the files it has not
 * loaded yet (the opening book) are gone: the new service worker deletes the old build's cache and
 * the server has only the new build. Every analysis of that page then fails with a script error.
 *
 * - When a new service worker takes over the page (`controllerchange`) and the server's page is
 *   of another build, the page reloads at once if nothing is running (an analysis, the reader
 *   trying a line of their own, or text typed and not sent); otherwise the app says "A new version is ready. Tap to reload".
 * - When loading the opening book fails with a script error and the server's page is of another
 *   build, the same line replaces "Analysis didn't finish" (a retry would fail the same way).
 *
 * "Another build" is read from the address of the page's own script, which carries the build's
 * hash (`/assets/index-<hash>.js`): offline, or on the same build, nothing is said.
 */
import { create } from 'zustand';

interface UpdateState {
  /** A newer build is on the server than the one this page runs. */
  ready: boolean;
  /** Why it was found: a new service worker took over, or a file of this build failed to load. */
  reason: 'new-worker' | 'load-failed' | null;
}

export const useAppUpdate = create<UpdateState>()(() => ({ ready: false, reason: null }));

/** What is running that a reload would throw away. */
const busy = new Set<string>();
export function setBusy(what: string, on: boolean): void {
  if (on) busy.add(what);
  else busy.delete(what);
}
export function isBusy(): boolean {
  return busy.size > 0;
}

/** The part of `document` that `hasUnsentText` reads. */
export interface TextFields {
  activeElement: Element | null;
  querySelectorAll(selectors: string): ArrayLike<Element>;
}

/** Fields a person types into; checkboxes, buttons and the like are not text. */
const TEXT_FIELDS =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"]';

/**
 * True while the person is typing or has text not sent yet: a focused text field, or any text
 * field holding something (the PGN box, the username field, the search field). A reload would
 * throw that text away (owner, 1.1.1 round 2).
 */
export function hasUnsentText(
  root: TextFields | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  if (!root) return false;
  const fields = Array.from(root.querySelectorAll(TEXT_FIELDS));
  if (root.activeElement && fields.includes(root.activeElement)) return true;
  return fields.some((field) => ((field as HTMLInputElement).value ?? '').trim() !== '');
}

/** The address of the build's entry script in a page's HTML. */
export function entryScript(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (/\btype=["']?module["']?/i.test(tag)) {
      const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
      if (src) return src;
    }
  }
  return null;
}

export interface UpdateDeps {
  /** The entry script of the running page. */
  ownEntry(): string | null;
  /** The server's page, never a stored copy; throws offline. */
  fetchPage(): Promise<string>;
}

const browserDeps: UpdateDeps = {
  ownEntry: () =>
    typeof document === 'undefined'
      ? null
      : (document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null),
  // A query keeps the service worker out of the way (public/sw.js leaves such requests alone);
  // the server answers every address with the page.
  fetchPage: async () => {
    const response = await fetch(`/?version-check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  },
};

/** True when the server's page names another entry script than this page's. */
export async function newVersionOnServer(deps: UpdateDeps = browserDeps): Promise<boolean> {
  const mine = deps.ownEntry();
  if (!mine) return false;
  try {
    const theirs = entryScript(await deps.fetchPage());
    return theirs !== null && theirs !== mine;
  } catch {
    return false; // offline or the server did not answer: nothing to say
  }
}

/** A dynamic import that failed: the browsers word it differently. */
const SCRIPT_ERROR = /dynamically imported module|module script|importing a module|mime type/i;

/**
 * After an analysis or a tried line failed: when the opening book could not be loaded as a script
 * and the server has another build, the app says a new version is ready.
 */
export async function checkAfterLoadFailure(
  error: { code: string; detail?: string } | Error | unknown,
  deps: UpdateDeps = browserDeps,
): Promise<boolean> {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'detail' in error
        ? String((error as { detail?: unknown }).detail ?? '')
        : String(error);
  if (!SCRIPT_ERROR.test(detail)) return false;
  if (!(await newVersionOnServer(deps))) return false;
  useAppUpdate.setState({ ready: true, reason: 'load-failed' });
  return true;
}

/**
 * Listens for a new service worker taking over this page. The first one of a first visit only
 * starts controlling a page that is already the newest: it is not an update.
 */
export function watchForNewVersion(
  reload: () => void = () => window.location.reload(),
  deps: UpdateDeps = browserDeps,
  container: ServiceWorkerContainer | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.serviceWorker,
  unsentText: () => boolean = () => hasUnsentText(),
): void {
  if (!container) return;
  let controlled = container.controller !== null;
  container.addEventListener('controllerchange', () => {
    const first = !controlled;
    controlled = true;
    if (first) return;
    void newVersionOnServer(deps).then((isNew) => {
      if (!isNew) return;
      if (isBusy() || unsentText()) useAppUpdate.setState({ ready: true, reason: 'new-worker' });
      else reload();
    });
  });
}

export function reloadApp(): void {
  window.location.reload();
}
