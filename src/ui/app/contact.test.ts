import { describe, expect, it } from 'vitest';
import { getMessages } from '@/i18n';
import { CONTACT_EMAIL } from './config';
import { contactMailto } from './contact';

const decode = (mailto: string) => {
  const [address, query] = mailto.slice('mailto:'.length).split('?');
  const params = new URLSearchParams(query);
  return { address, subject: params.get('subject'), body: params.get('body') };
};

describe('contactMailto', () => {
  const info = { version: '1.2.3', screen: { width: 390, height: 844 } };

  it('writes to the support address, in English', () => {
    const mail = decode(contactMailto(getMessages('en'), 'en', info));
    expect(CONTACT_EMAIL).toBe('chessbyme.support@gmail.com');
    expect(mail.address).toBe(CONTACT_EMAIL);
    expect(mail.subject).toBe('Chess by me feedback');
    expect(mail.body).toBe(
      [
        'Tell us what happened:',
        '',
        '',
        'App version: 1.2.3',
        'Language: English',
        'Screen: 390×844',
      ].join('\r\n'),
    );
  });

  it('writes in Thai only when the app is in Thai', () => {
    const mail = decode(contactMailto(getMessages('th'), 'th', info));
    expect(mail.subject).toBe('ความคิดเห็นเกี่ยวกับ Chess by me');
    expect(mail.body).toBe(
      ['เล่าให้เราฟังว่าเกิดอะไรขึ้น:', '', '', 'เวอร์ชันแอป: 1.2.3', 'ภาษา: ไทย', 'ขนาดจอ: 390×844'].join(
        '\r\n',
      ),
    );
  });

  it('adds the game and the move when it comes from a review', () => {
    const fromReview = {
      ...info,
      game: { url: 'https://lichess.org/abcDEF12', move: '8... d5' },
    };
    const en = decode(contactMailto(getMessages('en'), 'en', fromReview)).body!;
    expect(en.endsWith('Game: https://lichess.org/abcDEF12\r\nMove: 8... d5')).toBe(true);
    const th = decode(contactMailto(getMessages('th'), 'th', fromReview)).body!;
    expect(th.endsWith('เกม: https://lichess.org/abcDEF12\r\nตา: 8... d5')).toBe(true);
  });

  it('leaves the game line out when the game has no link (a pasted PGN)', () => {
    const pasted = { ...info, game: { url: null, move: '8... d5' } };
    const body = decode(contactMailto(getMessages('en'), 'en', pasted)).body!;
    expect(body).not.toContain('Game:');
    expect(body.endsWith('Move: 8... d5')).toBe(true);
  });

  it('encodes the subject and body so that every mail app reads them', () => {
    const mailto = contactMailto(getMessages('th'), 'th', info);
    expect(mailto).not.toMatch(/[\s฀-๿]/); // no raw spaces, new lines or Thai letters
    expect(mailto).toContain('%0D%0A');
  });
});

describe('contactMailto: the last failure (Fable review 1.1 B8-01)', () => {
  const info = { version: '1.1.1', screen: { width: 390, height: 844 } };
  it('adds the code and the detail of the last failed analysis', () => {
    const mail = decode(
      contactMailto(getMessages('en'), 'en', {
        ...info,
        lastError: { code: 'engine-crashed', detail: 'no answer from the engine within 120000 ms' },
      }),
    );
    expect(mail.body?.split('\r\n').at(-1)).toBe(
      'Last error: engine-crashed (no answer from the engine within 120000 ms)',
    );
  });
  it('in Thai, and the code alone when there is no detail', () => {
    const mail = decode(
      contactMailto(getMessages('th'), 'th', {
        ...info,
        lastError: { code: 'engine-load-failed', detail: null },
      }),
    );
    expect(mail.body?.split('\r\n').at(-1)).toBe('ข้อผิดพลาดล่าสุด: engine-load-failed');
  });
  it('says nothing when nothing failed', () => {
    const mail = decode(contactMailto(getMessages('en'), 'en', { ...info, lastError: null }));
    expect(mail.body).not.toContain('Last error');
  });
});
