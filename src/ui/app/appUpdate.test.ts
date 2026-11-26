import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAfterLoadFailure,
  hasUnsentText,
  entryScript,
  newVersionOnServer,
  setBusy,
  useAppUpdate,
  watchForNewVersion,
  type UpdateDeps,
} from './appUpdate';

const page = (entry: string) =>
  `<!doctype html><html><head><script type="application/ld+json">{}</script>` +
  `<script type="module" crossorigin src="${entry}"></script></head><body></body></html>`;

const deps = (mine: string | null, server: string | Error): UpdateDeps => ({
  ownEntry: () => mine,
  fetchPage: () =>
    server instanceof Error ? Promise.reject(server) : Promise.resolve(page(server)),
});

afterEach(() => {
  useAppUpdate.setState({ ready: false, reason: null });
  setBusy('analysis', false);
  setBusy('try', false);
});

describe('entryScript', () => {
  it('finds the module script of the build, not the JSON-LD', () => {
    expect(entryScript(page('/assets/index-DbEYDPHK.js'))).toBe('/assets/index-DbEYDPHK.js');
    expect(entryScript('<script src="/a.js"></script>')).toBeNull();
    expect(entryScript('nothing')).toBeNull();
  });
});

describe('newVersionOnServer', () => {
  it('is true only when the server names another entry script', async () => {
    expect(await newVersionOnServer(deps('/assets/index-A.js', '/assets/index-B.js'))).toBe(true);
    expect(await newVersionOnServer(deps('/assets/index-A.js', '/assets/index-A.js'))).toBe(false);
  });
  it('is false offline, and when the page has no entry of its own (development)', async () => {
    expect(await newVersionOnServer(deps('/assets/index-A.js', new Error('offline')))).toBe(false);
    expect(await newVersionOnServer(deps(null, '/assets/index-B.js'))).toBe(false);
  });
});

describe('checkAfterLoadFailure', () => {
  const chrome = {
    code: 'engine-load-failed',
    detail:
      'opening book: Failed to fetch dynamically imported module: https://chessby.me/assets/openings-BP90xieq.js',
  };
  const safari = {
    code: 'engine-load-failed',
    detail: 'opening book: Importing a module script failed.',
  };

  it('says a new version is ready after a script error when the server has another build', async () => {
    expect(
      await checkAfterLoadFailure(chrome, deps('/assets/index-A.js', '/assets/index-B.js')),
    ).toBe(true);
    expect(useAppUpdate.getState()).toEqual({ ready: true, reason: 'load-failed' });
  });

  it('works with the wording of other browsers and with a plain Error', async () => {
    expect(await checkAfterLoadFailure(safari, deps('/a/1.js', '/a/2.js'))).toBe(true);
    expect(
      await checkAfterLoadFailure(
        new TypeError('error loading dynamically imported module: /assets/openings-x.js'),
        deps('/a/1.js', '/a/2.js'),
      ),
    ).toBe(true);
  });

  it('says nothing offline, on the same build, or for other failures', async () => {
    expect(await checkAfterLoadFailure(chrome, deps('/a/1.js', new Error('offline')))).toBe(false);
    expect(await checkAfterLoadFailure(chrome, deps('/a/1.js', '/a/1.js'))).toBe(false);
    expect(
      await checkAfterLoadFailure(
        { code: 'engine-crashed', detail: 'no answer from the engine within 120000 ms' },
        deps('/a/1.js', '/a/2.js'),
      ),
    ).toBe(false);
    expect(useAppUpdate.getState().ready).toBe(false);
  });
});

/** A stand-in for navigator.serviceWorker. */
function container(controlled: boolean) {
  const target = new EventTarget() as EventTarget & { controller: object | null };
  target.controller = controlled ? {} : null;
  return target as unknown as ServiceWorkerContainer & EventTarget;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchForNewVersion', () => {
  it('reloads at once when a new worker takes over and nothing is running', async () => {
    const reload = vi.fn();
    const sw = container(true);
    watchForNewVersion(reload, deps('/a/1.js', '/a/2.js'), sw);
    sw.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the line instead while an analysis or a tried line is running', async () => {
    for (const what of ['analysis', 'try']) {
      useAppUpdate.setState({ ready: false, reason: null });
      setBusy(what, true);
      const reload = vi.fn();
      const sw = container(true);
      watchForNewVersion(reload, deps('/a/1.js', '/a/2.js'), sw);
      sw.dispatchEvent(new Event('controllerchange'));
      await flush();
      expect(reload).not.toHaveBeenCalled();
      expect(useAppUpdate.getState()).toEqual({ ready: true, reason: 'new-worker' });
      setBusy(what, false);
    }
  });

  it('ignores the first worker of a first visit, and a worker of the same build', async () => {
    const reload = vi.fn();
    const first = container(false);
    watchForNewVersion(reload, deps('/a/1.js', '/a/2.js'), first);
    first.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).not.toHaveBeenCalled();
    // A later deploy, the same page still open: that one counts.
    first.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);

    const same = container(true);
    const reloadSame = vi.fn();
    watchForNewVersion(reloadSame, deps('/a/1.js', '/a/1.js'), same);
    same.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reloadSame).not.toHaveBeenCalled();
    expect(useAppUpdate.getState().ready).toBe(false);
  });
});

/** A stand-in for document: text fields with values, and which one has focus. */
function fields(values: string[], focused: number | null = null) {
  const elements = values.map((value) => ({ value }) as unknown as Element);
  return {
    activeElement: focused === null ? null : elements[focused]!,
    querySelectorAll: () => elements,
  };
}

describe('hasUnsentText (owner, 1.1.1 round 2)', () => {
  it('is true for a field holding text, or a focused field even when empty', () => {
    expect(hasUnsentText(fields(['', '1. e4 e5']))).toBe(true);
    expect(hasUnsentText(fields([''], 0))).toBe(true);
  });
  it('is false with empty fields and no focus, or blank text only', () => {
    expect(hasUnsentText(fields(['', '   ']))).toBe(false);
    expect(hasUnsentText(fields([]))).toBe(false);
    expect(hasUnsentText(undefined)).toBe(false);
  });
});

describe('watchForNewVersion while the person has unsent text', () => {
  it('shows the note instead of reloading', async () => {
    const reload = vi.fn();
    const sw = container(true);
    watchForNewVersion(reload, deps('/a/1.js', '/a/2.js'), sw, () => true);
    sw.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).not.toHaveBeenCalled();
    expect(useAppUpdate.getState()).toEqual({ ready: true, reason: 'new-worker' });
  });
});
