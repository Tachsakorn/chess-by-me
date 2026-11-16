import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, getMessages, LOCALES, pickLocale } from './index';

describe('pickLocale', () => {
  it('uses the first preferred language that is supported', () => {
    expect(pickLocale(['fr-FR', 'th-TH', 'en-US'])).toBe('th');
  });

  it('ignores region and letter case', () => {
    expect(pickLocale(['TH'])).toBe('th');
    expect(pickLocale(['en-GB'])).toBe('en');
  });

  it('falls back to the default when nothing matches', () => {
    expect(pickLocale(['ja-JP'])).toBe(DEFAULT_LOCALE);
    expect(pickLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe('message catalogues', () => {
  it('has no empty text in any language', () => {
    const empty: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (node.trim() === '') empty.push(path);
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    for (const locale of LOCALES) walk(getMessages(locale), locale);
    expect(empty).toEqual([]);
  });
});

describe('connect placeholder', () => {
  it('says what to type, in both languages, without a real account name', () => {
    const en = getMessages('en').connect;
    const th = getMessages('th').connect;
    expect(en.placeholder('lichess')).toBe('Your Lichess username');
    expect(en.placeholder('chesscom')).toBe('Your Chess.com username');
    expect(th.placeholder('lichess')).toBe('ชื่อผู้ใช้ Lichess ของคุณ');
    expect(th.placeholder('chesscom')).toBe('ชื่อผู้ใช้ Chess.com ของคุณ');
  });
});

describe('board label with the quality badge', () => {
  it('names the category of the move on the board', () => {
    const en = getMessages('en').review;
    const th = getMessages('th').review;
    expect(en.boardAfterCategory('8... d5', 'mistake')).toBe('Board after 8... d5, a mistake');
    expect(en.boardAfterCategory('3. Nf3', 'inaccuracy')).toBe('Board after 3. Nf3, an inaccuracy');
    expect(en.boardAfterCategory('1. e4', 'book')).toBe('Board after 1. e4, a book move');
    expect(en.boardAfterCategory('20. Qh5', 'brilliant')).toBe(
      'Board after 20. Qh5, a brilliant move',
    );
    expect(th.boardAfterCategory('8... d5', 'mistake')).toBe('กระดานหลัง 8... d5 เป็นตา Mistake');
  });
});

describe('two connected sites (owner, 2026-11-15)', () => {
  const both = [
    { site: 'lichess' as const, username: 'liUser' },
    { site: 'chesscom' as const, username: 'CcUser' },
  ];

  it('names every account in the My Games header', () => {
    const en = getMessages('en').games;
    expect(en.accountsLine(both)).toBe('Lichess · liUser · Chess.com · CcUser');
    expect(en.accountsLine([both[0]!])).toBe('Lichess · liUser');
  });

  it('says which site could not be updated', () => {
    const en = getMessages('en').games;
    const th = getMessages('th').games;
    expect(en.accountsLineFailed(both, ['chesscom'])).toBe(
      "Lichess · liUser · Chess.com · CcUser · Couldn't update Chess.com",
    );
    expect(en.accountsLineFailed(both, ['lichess', 'chesscom'])).toBe(
      "Lichess · liUser · Chess.com · CcUser · Couldn't update",
    );
    expect(en.accountsLineFailed([both[0]!], ['lichess'])).toBe(
      "Lichess · liUser · Couldn't update",
    );
    expect(th.accountsLineFailed(both, ['chesscom'])).toBe(
      'Lichess · liUser · Chess.com · CcUser · อัปเดต Chess.com ไม่ได้',
    );
  });

  // The line under the ratings bar: the site, then the switch icon, then the rest (owner,
  // 2026-11-15, second round).
  it('writes what follows the site name under the ratings', () => {
    expect(
      getMessages('en').home.accountLineAfterSite('CcUser', 'Updates when you open the app'),
    ).toBe(' · CcUser · Updates when you open the app');
    expect(getMessages('th').home.accountLineAfterSite('CcUser', 'อัปเดตทุกครั้งที่เปิดแอป')).toBe(
      ' · CcUser · อัปเดตทุกครั้งที่เปิดแอป',
    );
  });

  it('tells a screen reader that the ratings switch site', () => {
    expect(getMessages('en').home.ratingsSwitch('lichess', 'chesscom')).toBe(
      'Your Lichess ratings. Tap to show Chess.com.',
    );
    expect(getMessages('th').home.ratingsSwitch('lichess', 'chesscom')).toBe(
      'เรตติ้ง Lichess ของคุณ แตะเพื่อดู Chess.com',
    );
  });
});

describe('evaluation bar label (owner, 2026-11-15)', () => {
  it('says the figure and who is better', () => {
    const en = getMessages('en').review;
    const th = getMessages('th').review;
    expect(en.evalLabel('+2.5', 'white')).toBe('Evaluation +2.5, White is better');
    expect(en.evalLabel('−#3', 'black')).toBe('Evaluation −#3, Black is better');
    expect(en.evalLabel('0.0', 'equal')).toBe('Evaluation 0.0, equal');
    expect(th.evalLabel('+2.5', 'white')).toBe('ค่าประเมิน +2.5 ฝั่งขาวได้เปรียบ');
    expect(th.evalLabel('−0.3', 'black')).toBe('ค่าประเมิน −0.3 ฝั่งดำได้เปรียบ');
    expect(th.evalLabel('0.0', 'equal')).toBe('ค่าประเมิน 0.0 เท่ากัน');
    expect(en.evalPending).toBe('Evaluation not ready yet');
    expect(th.evalPending).toBe('ยังไม่มีค่าประเมิน');
  });
});

describe('try your own move (owner, 2026-11-16)', () => {
  it('has the agreed words in both languages', () => {
    const en = getMessages('en').review.tryLine;
    const th = getMessages('th').review.tryLine;
    expect(en.title(8)).toBe('Your line · from move 8');
    expect(en.back).toBe('Back to game');
    expect(en.checking).toBe('Checking');
    expect(en.checkingMove).toBe('Checking this move');
    expect(en.gameMoveWas('8... d5?')).toBe('Game move was 8... d5?');
    expect(en.better('8... d5?')).toBe('Better than the game move 8... d5?');
    expect(en.same).toBe('As good as the game move');
    expect(en.worse('8... d5?')).toBe('Worse than the game move 8... d5?');
    expect(en.bestReply).toBe('Best reply');
    expect(th.title(8)).toBe('เส้นของคุณ · จากตา 8');
    expect(th.back).toBe('กลับไปที่เกม');
    expect(th.checking).toBe('กำลังตรวจ');
    expect(th.checkingMove).toBe('กำลังตรวจตานี้');
    expect(th.gameMoveWas('8... d5?')).toBe('ตาในเกมคือ 8... d5?');
    expect(th.better('8... d5?')).toBe('ดีกว่าตาในเกม 8... d5?');
    expect(th.same).toBe('ดีพอๆ กับตาในเกม');
    expect(th.worse('8... d5?')).toBe('แย่กว่าตาในเกม 8... d5?');
    expect(th.bestReply).toBe('ตาตอบที่ดีที่สุด');
  });
});

describe('Move panel under 1% (owner, 2026-11-15)', () => {
  it('has the agreed words in both languages', () => {
    const en = getMessages('en').review;
    const th = getMessages('th').review;
    expect(en.alreadyLost).toBe("Already lost. This move doesn't change the result.");
    expect(en.stillWinning).toBe('Still winning.');
    expect(en.missedMate(1)).toBe('Missed mate in 1.');
    expect(th.alreadyLost).toBe('แพ้อยู่แล้ว ตานี้ไม่ได้ทำให้ผลเปลี่ยน');
    expect(th.stillWinning).toBe('ยังชนะอยู่');
    expect(th.missedMate(2)).toBe('พลาดรุกจนใน 2 ตา');
  });
});
