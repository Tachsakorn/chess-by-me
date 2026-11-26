import type { GameResult, Termination } from '@/contract';
import { en, type Messages } from './en';

// Thai from the table in docs/ui-redesign/BRIEF-UI.md section 7 (a draft the owner checks on
// screenshots). Lines marked "new" are not in that table: spoken labels and the like.

const siteNames = en.sites;

const endingWords: Record<Termination, string> = {
  checkmate: 'รุกจน',
  resignation: 'ยอมแพ้',
  timeout: 'หมดเวลา',
  abandonment: 'ทิ้งเกม', // new
  stalemate: 'อับ',
  repetition: 'เดินซ้ำ', // new
  'fifty-move': 'กฎ 50 ตา', // new
  'insufficient-material': 'หมากไม่พอรุกจน', // new
  'timeout-vs-insufficient-material': 'หมดเวลา หมากไม่พอรุกจน', // new
  agreement: 'ตกลงเสมอ',
  unknown: '',
};

export const th: Messages = {
  app: en.app,
  sites: en.sites,
  timeClass: en.timeClass,
  category: en.category,
  game: {
    outcome: { win: 'ชนะ', loss: 'แพ้', draw: 'เสมอ' },
    outcomeAndClass: (outcome, timeClass) => `${outcome} · ${timeClass}`,
    players: (white, black) => `${white} – ${black}`,
    ending: (result: GameResult, termination: Termination) => {
      const how = endingWords[termination];
      return how ? `${result} ${how}` : result;
    },
    accuracyPair: (white, black) => `ความแม่นยำ ${white} / ${black}`,
    noValue: '—',
  },
  nav: {
    mainMenu: 'เมนูหลัก', // new
    home: 'หน้าแรก',
    games: 'เกมของฉัน',
    courses: 'คอร์ส',
    search: 'ค้นหา',
    back: 'ย้อนกลับ', // new
    account: 'บัญชีของฉัน', // new
  },
  home: {
    title: 'หน้าแรก',
    ratingsLabel: (site) => `เรตติ้ง ${siteNames[site]} ของคุณ`, // new
    ratingsSwitch: (site, other) => `เรตติ้ง ${siteNames[site]} ของคุณ แตะเพื่อดู ${siteNames[other]}`, // owner, 2026-11-15
    updates: 'อัปเดตทุกครั้งที่เปิดแอป',
    updateFailed: 'อัปเดตไม่ได้ กำลังแสดงข้อมูลที่เก็บไว้', // new
    updateBusy: 'ลองใหม่อีกครู่ กำลังแสดงข้อมูลที่เก็บไว้',
    accountLine: (site, username, note) => `${siteNames[site]} · ${username} · ${note}`,
    accountLineAfterSite: (username, note) => ` · ${username} · ${note}`, // owner, 2026-11-15
    continue: 'ดูต่อ',
    pausedAt: (move) => `หยุดไว้ที่ ${move}`,
    latestReview: 'รีวิวล่าสุด',
    notAnalyzed: 'ยังไม่ได้วิเคราะห์',
    recentGames: 'เกมล่าสุด',
    ratingUp: (n) => `ขึ้น ${n}`, // new
    ratingDown: (n) => `ลง ${n}`, // new
  },
  games: {
    title: 'เกมของฉัน',
    accountLine: (site, username) => `${siteNames[site]} · ${username}`,
    accountLineFailed: (site, username) => `${siteNames[site]} · ${username} · อัปเดตไม่ได้`, // new
    tryLater: 'ลองใหม่อีกครู่',
    accountsLine: (accounts) =>
      accounts.map((a) => `${siteNames[a.site]} · ${a.username}`).join(' · '), // owner, 2026-11-15
    accountsLineFailed: (accounts, failed) => {
      const line = accounts.map((a) => `${siteNames[a.site]} · ${a.username}`).join(' · ');
      const all = accounts.every((a) => failed.includes(a.site));
      return all
        ? `${line} · อัปเดตไม่ได้`
        : `${line} · อัปเดต ${failed.map((s) => siteNames[s]).join(', ')} ไม่ได้`;
    }, // owner, 2026-11-15
    filterLabel: 'กรองเกม', // new
    filter: { all: 'ทั้งหมด', analyzed: 'วิเคราะห์แล้ว', notYet: 'ยังไม่ได้', others: 'เกมอื่น' }, // others: owner, 2026-11-15
    recentlyOpened: 'เปิดดูล่าสุด', // owner, 2026-11-15
    from: { lichess: 'Lichess', chesscom: 'Chess.com', pgn: 'วาง PGN' }, // owner, 2026-11-15
    otherMeta: (timeClass, from, date) => [timeClass, from, date].filter(Boolean).join(' · '),
    whiteBlack: 'ขาว · ดำ', // owner, 2026-11-15
    noOthers: 'ยังไม่มีเกมอื่น', // owner, 2026-11-15
    noOthersHint: 'เกมที่เปิดจากหน้าค้นหา ลิงก์เกม หรือวาง PGN จะอยู่ที่นี่', // owner, 2026-11-15
    thisWeek: 'สัปดาห์นี้',
    lastWeek: 'สัปดาห์ที่แล้ว',
    meta: (opponent, date) => `${opponent} · ${date}`,
    accuracy: 'ความแม่นยำ',
    analyze: 'วิเคราะห์',
    analyzing: (percent) => `${percent}%`,
    noGames: 'ยังไม่มีเกม',
    noGamesHint: (site) => `เล่นสักเกมบน ${siteNames[site]} แล้วเกมจะขึ้นที่นี่`,
    noGamesHintBoth: 'เล่นสักเกมบน Lichess หรือ Chess.com แล้วเกมจะขึ้นที่นี่', // new
    nothingHere: 'ไม่มีเกมในหมวดนี้',
    tryAnotherFilter: 'ลองเลือกหมวดอื่น',
    analyzeGame: (players) => `วิเคราะห์ ${players}`, // new
  },
  review: {
    title: 'รีวิวเกม',
    tabsLabel: 'รายละเอียดการรีวิว', // new
    tabs: { move: 'ตานี้', summary: 'สรุป', moves: 'ทุกตา' },
    boardAt: 'กระดานตอนเริ่มเกม', // new
    evalLabel: (figure, leader) =>
      `ค่าประเมิน ${figure} ${leader === 'equal' ? 'เท่ากัน' : leader === 'white' ? 'ฝั่งขาวได้เปรียบ' : 'ฝั่งดำได้เปรียบ'}`, // owner, 2026-11-15
    evalPending: 'ยังไม่มีค่าประเมิน', // new
    alreadyLost: 'แพ้อยู่แล้ว ตานี้ไม่ได้ทำให้ผลเปลี่ยน', // owner, 2026-11-15
    stillWinning: 'ยังชนะอยู่', // owner, 2026-11-15
    missedMate: (moves) => `พลาดรุกจนใน ${moves} ตา`, // owner, 2026-11-15
    boardAfter: (move) => `กระดานหลัง ${move}`, // new
    boardAfterCategory: (move, category) => `กระดานหลัง ${move} เป็นตา ${en.category[category]}`, // new
    graphLabel: 'ค่าประเมินตลอดเกม แตะเพื่อไปที่ตานั้น', // new
    winDropped: (n) => `โอกาสชนะลดลง ${n}%`,
    winHeld: 'โอกาสชนะเท่าเดิม',
    betterWas: 'ตาที่ดีกว่าคือ',
    bestWas: 'ตาที่ดีที่สุดคือ',
    bestMove: 'ตาที่ดีที่สุด',
    bookMove: 'ตาตามตำรา',
    start: 'เริ่มเกม',
    startHint: 'แตะ › เพื่อดูทีละตา',
    analyzing: (n) => `กำลังวิเคราะห์… ${n}%`,
    downloading: (n) => `กำลังโหลดเอนจิน… ${n}%`,
    loadingEngine: 'กำลังเตรียมเครื่องวิเคราะห์…', // new (owner, 1.1.1)
    accuracyOf: (name) => `ความแม่นยำของ ${name}`,
    stopped: 'วิเคราะห์ไม่สำเร็จ แตะเพื่อลองใหม่',
    details: (code) => `รายละเอียด: ${code}`, // new
    // new (1.2)
    depth: {
      pill: (depth) => `ความลึก ${depth}`,
      pillButton: (depth) => `วิเคราะห์ที่ความลึก ${depth} แตะเพื่อวิเคราะห์ใหม่`,
      againTitle: (depth) => `วิเคราะห์ใหม่ที่ความลึก ${depth}?`,
      againBody: (from) => `เกมนี้วิเคราะห์ไว้ที่ความลึก ${from} ผลใหม่จะแทนผลเดิม`,
      sameTitle: (depth) => `วิเคราะห์ที่ความลึก ${depth} แล้ว`,
      sameBody: 'เป็นความลึกเดียวกับที่ตั้งไว้ วิเคราะห์ใหม่ก็ได้ผลเท่าเดิม เลือกความลึกอื่นในหน้าตั้งค่าก่อน',
      again: 'วิเคราะห์ใหม่',
      openSettings: 'ไปที่ตั้งค่า',
      cancel: 'ยกเลิก',
    },
    stepper: {
      label: 'เดินดูทีละตา', // new
      start: 'ไปตาแรก', // new
      previous: 'ตาก่อนหน้า', // new
      next: 'ตาถัดไป', // new
      end: 'ไปตาสุดท้าย', // new
      flip: 'หมุนกระดาน', // new
    },
    white: 'ขาว', // new
    black: 'ดำ', // new
    // owner, 2026-11-16, except the lines marked new
    tryLine: {
      title: (move) => `เส้นของคุณ · จากตา ${move}`,
      back: 'กลับไปที่เกม',
      checking: 'กำลังตรวจ',
      checkingMove: 'กำลังตรวจตานี้',
      gameMoveWas: (move) => `ตาในเกมคือ ${move}`,
      better: (move) => `ดีกว่าตาในเกม ${move}`,
      same: 'ดีพอๆ กับตาในเกม',
      worse: (move) => `แย่กว่าตาในเกม ${move}`,
      bestReply: 'ตาตอบที่ดีที่สุด',
      startHint: 'ลากหมากเพื่อลองเดินตาของคุณเอง', // new
      promote: 'เลือกหมากที่จะเลื่อนขั้น', // new
      pieces: { q: 'ควีน', r: 'เรือ', b: 'บิชอป', n: 'ม้า' }, // new
    },
  },
  courses: {
    title: 'คอร์ส',
    intro: 'บทเรียนสั้นๆ ที่ได้ลงมือจริง กำลังทำอยู่',
    startHere: 'เริ่มที่นี่',
    comingSoon: 'เร็วๆ นี้',
    byPhase: 'ตามช่วงเกม',
    names: {
      basics: 'Basics', // the word on the cover; the drawing keeps it in English
      openings: 'การเปิดเกม',
      tactics: 'แท็กติก',
      middlegame: 'กลางเกม',
      endgame: 'ท้ายเกม',
      mates: 'รูปแบบการรุกจน',
    },
  },
  search: {
    title: 'ค้นหา',
    placeholder: 'ชื่อผู้เล่นหรือลิงก์เกม',
    fieldLabel: 'ค้นหาผู้เล่นหรือเกม', // new
    reviewAny: 'รีวิวเกมไหนก็ได้',
    findPlayer: 'หาผู้เล่น',
    findPlayerSub: 'ดูเกมล่าสุดของเขาบน Chess.com หรือ Lichess',
    pasteLink: 'วางลิงก์เกม',
    pasteLinkSub: 'จาก Chess.com หรือ Lichess',
    pastePgn: 'วาง PGN',
    pastePgnSub: 'เกมไหนก็ได้ จากที่ไหนก็ได้',
    analysisBoard: 'กระดานวิเคราะห์', // new (2026-11-26)
    analysisBoardSub: 'เดินหมากได้อิสระ พร้อมเอนจิน', // new (2026-11-26)
    publicNote: 'เกมบน Chess.com และ Lichess เป็นข้อมูลสาธารณะ จึงรีวิวเกมของใครก็ได้',
    review: 'รีวิว', // new
    pgnLabel: 'PGN',
    pgnInvalid: 'อ่าน PGN นี้ไม่ได้', // new
    pgnUnsupported: 'เกมนี้เป็นหมากรุกแบบอื่นหรือเริ่มจากตำแหน่งที่ตั้งเอง ยังไม่รองรับ', // owner, 1.1 round 2
    pgnMany: (count, players) => `PGN นี้มี ${count} เกม จะเปิดเกมแรก (${players})`, // owner, 2026-11-15
    noPlayer: (name) => `ไม่พบผู้เล่นชื่อ “${name}” บน Lichess หรือ Chess.com`, // new
    close: 'ปิด', // new
    // new (1.2)
    chesscomWho: 'ลิงก์ Chess.com เปิดผ่านเกมของผู้เล่น พิมพ์ชื่อผู้ใช้ของผู้เล่นคนใดคนหนึ่ง',
    chesscomNotFound: (names) => `ไม่พบเกมนี้ในเกมของ ${names} ลองชื่อของผู้เล่นอีกคน หรือวาง PGN แทน`,
    chesscomNoPlayer: (name) => `ไม่มีผู้เล่นชื่อ “${name}” บน Chess.com`,
    chesscomName: 'ชื่อผู้ใช้ Chess.com',
    chesscomFind: 'หาเกม',
    and: 'และ',
    gameNotLoaded: 'โหลดเกมนี้ไม่ได้', // new
    notAGameLink: 'นี่ไม่ใช่ลิงก์เกม',
    offline: 'ติดต่อ Lichess หรือ Chess.com ไม่ได้ตอนนี้', // new
    busy: 'Lichess หรือ Chess.com ขอให้รอสักครู่ ลองใหม่อีกครู่',
    searching: 'กำลังค้นหา…', // new
  },
  settings: {
    title: 'ตั้งค่า',
    groups: {
      accounts: 'บัญชี',
      general: 'ทั่วไป',
      analysis: 'การวิเคราะห์',
      storage: 'ข้อมูลในเครื่อง',
      about: 'เกี่ยวกับ',
    },
    storageUsed: 'พื้นที่ที่ใช้ในเครื่องนี้',
    megabytes: (mb) => `${mb.toFixed(1)} MB`,
    storageUnknown: 'ไม่ทราบ',
    clearData: 'ล้างข้อมูลที่เก็บไว้',
    clearTitle: 'ล้างข้อมูลทั้งหมดที่เก็บไว้?',
    clearBody:
      'บัญชีที่เชื่อมไว้ เกม และผลวิเคราะห์ จะถูกลบออกจากเครื่องนี้ ข้อมูลบน Lichess และ Chess.com ไม่เปลี่ยน',
    clearConfirm: 'ล้างทั้งหมด',
    clearCancel: 'ยังไม่ล้าง',
    connect: 'เชื่อมต่อ',
    accountsNote: 'ชื่อผู้ใช้ เกม และผลวิเคราะห์ เก็บไว้ในเครื่องนี้เท่านั้น',
    language: 'ภาษา',
    languageAuto: (current) => `อัตโนมัติ · ${current}`,
    languageNames: en.settings.languageNames,
    automatic: 'อัตโนมัติ',
    appearance: 'ธีม',
    sound: 'เสียง', // new (owner, 2026-11-16)
    languageNote: 'อัตโนมัติจะใช้ภาษาตามเครื่อง',
    engine: 'เอนจิน',
    depth: 'ความลึก', // owner, 1.1 round 1
    depthDefault: (depth) => `${depth} · ค่าเริ่มต้น`, // owner, 1.1 round 1
    analysisNote: 'ยิ่งลึกยิ่งแม่นแต่ช้าลง เกมที่วิเคราะห์แล้วจะใช้ผลเดิม', // owner, 1.1 round 1
    depthSlow: (depth) =>
      `ความลึก ${depth} ใช้เวลาราว ${depth >= 22 ? '4–5 เท่า' : '2 เท่า'}ของความลึก 18`, // new (1.2)
    buyCoffee: 'เลี้ยงกาแฟผู้พัฒนา',
    contact: 'ติดต่อเรา', // owner, 2026-11-15
    version: 'เวอร์ชัน',
    licenses: 'ไลเซนส์โอเพนซอร์ส',
    privacy: 'ความเป็นส่วนตัว',
    homeScreen: 'เพิ่มลงหน้าจอโฮม', // new (1.2)
    connected: 'เชื่อมแล้ว', // new
    engineValue: en.settings.engineValue,
  },
  // owner, 2026-11-15
  contact: {
    subject: 'ความคิดเห็นเกี่ยวกับ Chess by me',
    prompt: 'เล่าให้เราฟังว่าเกิดอะไรขึ้น:',
    appVersion: 'เวอร์ชันแอป',
    language: 'ภาษา',
    screen: 'ขนาดจอ',
    game: 'เกม',
    move: 'ตา',
    lastError: 'ข้อผิดพลาดล่าสุด', // new
  },
  update: {
    ready: 'มีเวอร์ชันใหม่แล้ว แตะเพื่อโหลดใหม่', // new
    note: 'มีเวอร์ชันใหม่แล้ว', // new
    reload: 'โหลดใหม่', // new
  },
  storage: {
    title: 'เบราว์เซอร์นี้ไม่ให้ Chess by me เก็บข้อมูล',
    body: 'Chess by me เก็บเกมและผลวิเคราะห์ไว้ในเบราว์เซอร์นี้ ให้อนุญาตการเก็บข้อมูลเว็บไซต์ (คุกกี้และข้อมูลเว็บ) สำหรับเว็บนี้ ออกจากโหมดส่วนตัว หรือเปิดด้วยเบราว์เซอร์อื่น',
    retry: 'ลองอีกครั้ง',
    saveFailed: 'บันทึกลงเครื่องไม่ได้ พื้นที่อาจเต็ม ลองเคลียร์พื้นที่ในเครื่อง หรือล้างข้อมูลที่เก็บไว้ในตั้งค่า',
    dismiss: 'ปิด',
  },
  // new (1.2)
  open: {
    opening: 'กำลังเปิดเกม…',
    from: (site) => `จาก ${siteNames[site]}`,
    failed: 'โหลดเกมนี้ไม่ได้',
    toSearch: 'ไปที่ค้นหา',
  },
  // new (1.2) · Safari's labels in quotes to be checked on an iPhone set to Thai
  homeScreen: {
    title: 'เพิ่มลงหน้าจอโฮม',
    why: 'แล้ว Chess by me จะเปิดจากไอคอนของตัวเอง เต็มจอ และเกมที่อยู่ในเครื่องแล้วเปิดได้แม้ไม่มีเน็ต',
    stepsTitle: 'ใน Safari บน iPhone',
    steps: [
      'เปิด chessby.me ใน Safari',
      'แตะปุ่ม แชร์ (สี่เหลี่ยมที่มีลูกศรชี้ขึ้น) ถ้าไม่เห็น ให้แตะ ⋯ ก่อน',
      'แตะ “เพิ่มไปยังหน้าจอโฮม” ถ้าไม่เห็น ให้แตะ “ดูเพิ่มเติม” ก่อน',
      'เปิด “เปิดเป็นเว็บแอป” ไว้ แล้วแตะ “เพิ่ม”',
    ],
    otherTitle: 'เบราว์เซอร์อื่น',
    other:
      'Chrome และเบราว์เซอร์อื่นบน iPhone ใช้ แชร์ › เพิ่มไปยังหน้าจอโฮม เหมือนกัน ส่วน Android เบราว์เซอร์จะเสนอให้ติดตั้งแอปเอง',
  },
  // new (1.2)
  share: {
    nothing: 'ไม่ใช่เกมหมากรุก',
    hint: 'แชร์เกมจาก Lichess หรือ Chess.com หรือ PGN มาที่นี่เพื่อรีวิว',
  },
  error: {
    title: 'มีบางอย่างผิดพลาด',
    body: 'แสดงหน้านี้ไม่ได้ ข้อมูลที่เก็บในเครื่องนี้ยังอยู่ครบ',
    home: 'กลับหน้าแรก',
  },
  privacy: {
    title: 'ความเป็นส่วนตัว',
    sections: [
      {
        title: 'เก็บไว้ในเครื่องนี้',
        body: 'ชื่อผู้ใช้ เกมที่แอปโหลดมา ผลวิเคราะห์ เรตติ้ง และตำแหน่งที่ดูค้างไว้ในแต่ละเกม ทั้งหมดอยู่ในเบราว์เซอร์นี้ และไม่เคยส่งมาที่เรา',
      },
      {
        title: 'ส่งไปที่ Lichess และ Chess.com',
        body: 'เพื่อโหลดเกม เบราว์เซอร์จะขอข้อมูลจาก Lichess และ Chess.com โดยตรง ด้วยชื่อผู้ใช้ที่คุณเชื่อมหรือค้นหา และเกมจากลิงก์ที่คุณวางหรือแชร์ (เกม Chess.com หาจากเกมของผู้เล่นด้วยชื่อผู้ใช้) เว็บเหล่านั้นเห็นหมายเลข IP ของคุณเหมือนเว็บทั่วไป นอกจากนี้ไม่มีอะไรถูกส่งออกไป',
      },
      {
        title: 'สิ่งที่แอปนี้ไม่มี',
        body: 'ไม่มีระบบติดตาม ไม่มีเก็บสถิติการใช้งาน ไม่มีโฆษณา ไม่มีคุกกี้ ตัวเว็บส่งถึงคุณผ่าน Cloudflare เหมือนผู้ให้บริการเว็บทั่วไป',
      },
    ],
    contactTitle: 'มีคำถาม',
    contactBody: 'เขียนถึงเราได้ที่',
  },
  licenses: {
    title: 'ไลเซนส์โอเพนซอร์ส',
    note: 'Chess by me เป็นซอฟต์แวร์เสรีภายใต้ GPL-3.0 และสร้างด้วยสิ่งเหล่านี้', // new
    notices: 'ข้อความไลเซนส์และประกาศลิขสิทธิ์ฉบับเต็ม',
    source: 'ซอร์สโค้ด',
  },
  // The analysis board (owner, 2026-11-26): all new, for the owner to check on screenshots.
  analysis: {
    title: 'วิเคราะห์',
    settingsButton: 'ตั้งค่าการวิเคราะห์',
    tabsLabel: 'รายละเอียดการวิเคราะห์',
    tabs: { move: 'ตาเดิน', lines: 'เส้น', moves: 'ทุกตา' },
    startPosition: 'ตำแหน่งเริ่มต้น',
    start: 'ตำแหน่งเริ่มต้น เดินหมากบนกระดานได้เลย',
    thinking: 'กำลังคิด…',
    bookMove: 'ตาเปิดเกมที่รู้จักกันดี',
    nextInBook: (moves) => `ตาต่อไปในตำรา: ${moves}`,
    noMoves: 'ยังไม่มีตาเดิน เดินหมากบนกระดานได้เลย',
    gameOver: 'เกมจบแล้วในตำแหน่งนี้',
    linesFoot: (depth, seconds) => `ความลึก ${depth} · ${seconds} วินาทีต่อตา`,
    changeInSettings: 'เปลี่ยนได้ในการตั้งค่า',
    linesOff: 'ปิดการแสดงเส้นของเอนจินอยู่',
    turnOnInSettings: 'เปิดได้ในการตั้งค่า',
    stopped: 'เอนจินหยุดทำงาน แตะเพื่อลองอีกครั้ง',
    settings: {
      title: 'ตั้งค่า',
      close: 'ปิด',
      onBoard: 'บนกระดาน',
      evalBar: 'แถบค่าประเมิน',
      suggestion: 'ลูกศรตาที่แนะนำ',
      threat: 'ลูกศรภัยคุกคาม',
      labels: 'ป้ายคุณภาพตาเดิน',
      engine: 'เอนจิน',
      lines: 'แสดงเส้นของเอนจิน',
      time: 'เวลาต่อตา',
      seconds: (seconds) => `${seconds} วินาที`,
      timeNote: 'นานขึ้นแม่นขึ้น แต่ช้าลง',
      general: 'ทั่วไป',
      sound: 'เสียง',
    },
  },
  connect: {
    title: 'เชื่อมบัญชีหมากรุกของคุณ',
    intro: 'เกมล่าสุดจะเข้ามาเองทุกครั้งที่เปิดแอป ไม่ต้องใช้รหัสผ่าน',
    sitesLabel: 'คุณเล่นที่ไหน', // new
    placeholder: (site) => `ชื่อผู้ใช้ ${siteNames[site]} ของคุณ`, // owner, 2026-11-15
    username: (site) => `ชื่อผู้ใช้ ${siteNames[site]}`,
    continue: 'ต่อไป',
    checking: 'กำลังตรวจสอบ…',
    pasteInstead: 'วาง PGN แทน',
    laterNote: 'เชื่อมอีกเว็บทีหลังได้ในตั้งค่า',
    notFound: (name, site) => `ไม่พบ “${name}” บน ${siteNames[site]}`,
    offline: (site) => `ติดต่อ ${siteNames[site]} ไม่ได้ตอนนี้ ตรวจการเชื่อมต่อแล้วลองใหม่`, // new
    busy: (site) => `${siteNames[site]} ขอให้รอสักครู่ ลองใหม่อีกครู่`,
    disconnect: 'ยกเลิกการเชื่อมต่อ',
    disconnectTitle: (site) => `ยกเลิกการเชื่อมต่อ ${siteNames[site]}?`,
    disconnectBody: (name) => `เกมและผลวิเคราะห์ของ ${name} ที่เก็บในเครื่องนี้จะถูกลบ`,
    disconnectConfirm: 'ยกเลิกการเชื่อมต่อและลบ',
    disconnectCancel: 'ยังไม่ลบ',
  },
};
