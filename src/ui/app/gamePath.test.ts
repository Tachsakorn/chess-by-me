import { describe, expect, it } from 'vitest';
import { parseGameLink } from '@/data/lookup';
import { linkFromPath, pathOf, siteUrl } from './gamePath';

describe('linkFromPath', () => {
  it('reads /lichess/<id>, 8 or 12 characters', () => {
    expect(linkFromPath('/lichess/LAGvRNey')).toEqual({ source: 'lichess', id: 'LAGvRNey' });
    expect(linkFromPath('/lichess/LAGvRNeyAbCd/')).toEqual({ source: 'lichess', id: 'LAGvRNey' });
  });

  it('reads /chesscom/<id> as a live game, /chesscom/daily/<id>, and ?username=', () => {
    expect(linkFromPath('/chesscom/188816899405')).toEqual({
      source: 'chesscom',
      id: '188816899405',
      kind: 'live',
      username: null,
    });
    expect(linkFromPath('/chesscom/daily/747757185', '?username=erik')).toEqual({
      source: 'chesscom',
      id: '747757185',
      kind: 'daily',
      username: 'erik',
    });
    expect(linkFromPath('/chesscom/live/5')).toMatchObject({ kind: 'live', id: '5' });
  });

  it('is null for anything else', () => {
    for (const path of [
      '/lichess',
      '/lichess/short',
      '/lichess/LAGvRNey/x',
      '/chesscom/abc',
      '/chesscom/weekly/1',
      '/chesscom/daily/1/2',
      '/review/lichess:LAGvRNey',
    ]) {
      expect(linkFromPath(path)).toBeNull();
    }
  });
});

describe('pathOf', () => {
  it('is the address linkFromPath reads back', () => {
    for (const [path, search] of [
      ['/lichess/LAGvRNey', ''],
      ['/chesscom/7', ''],
      ['/chesscom/daily/8', '?username=a%20b'],
    ] as const) {
      const link = linkFromPath(path, search)!;
      const [back, query] = pathOf(link).split('?');
      expect(linkFromPath(back!, query ? `?${query}` : '')).toEqual(link);
    }
  });
});

describe('siteUrl', () => {
  it('gives back a link the paste reader opens the same way', () => {
    for (const path of ['/lichess/LAGvRNey', '/chesscom/7', '/chesscom/daily/8']) {
      const link = linkFromPath(path)!;
      expect(parseGameLink(siteUrl(link))).toEqual(link);
    }
    const named = linkFromPath('/chesscom/7', '?username=A%20B')!;
    expect(parseGameLink(siteUrl(named))).toEqual(named);
  });
});
