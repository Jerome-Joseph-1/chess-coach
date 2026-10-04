import type { TrapLesson, TrapTexts } from './types';

export type TrapLessonId = 'italian-traps' | 'caro-kann-traps';

const DODGE = 'Your move. One natural move here walks into a trap: find a safe one.';

/** The trap lessons, on curated lines analysed by pipeline/traps.py into traps.json. */
export const TRAP_LESSONS: Record<TrapLessonId, TrapLesson> = {
  'italian-traps': {
    id: 'italian-traps',
    opening: 'italian',
    kind: 'traps',
    title: 'Italian traps',
    line: 'Famous traps: when a free pawn is bait, and when to strike.',
    intro: 'Some moves look free but hide a trick. Learn the famous Italian traps: the ones to dodge, and the mistakes to punish.',
    spotTitle: 'How to stay safe',
    spot: [
      'Before you take a pawn, check what your opponent can do next.',
      'Watch for a queen move that attacks two things at once.',
      "When your opponent slips, look at f7: early on, only Black's king guards it.",
    ],
    name: 'Italian traps',
    hint: 'Before you take, check what your opponent can do next.',
    idea: 'You looked one move further than your opponent.',
    remember: "A free pawn is only free if nothing bad follows. Check your opponent's best reply before you take.",
    icon: 'eye',
    listIcon: 'eye',
  },
  'caro-kann-traps': {
    id: 'caro-kann-traps',
    opening: 'caro-kann',
    kind: 'traps',
    title: 'Caro-Kann traps',
    line: 'Famous traps that catch Black, and how to dodge them.',
    intro: 'Some natural moves walk into a trap. Learn the famous Caro-Kann traps, so you see them coming.',
    spotTitle: 'How to stay safe',
    spot: [
      "Before each move, look at White's checks and captures.",
      'Early on, only your king guards f7. Watch a white knight on g5 and a bishop on c4.',
      'If white pawns close in on your bishop, make room for it to step back.',
    ],
    name: 'Caro-Kann traps',
    hint: 'Before you move, check what White can do next.',
    idea: 'You checked what White could do next before you moved.',
    remember: "Many traps hide in natural moves. Before you move, look at White's checks, captures and attacks.",
    icon: 'eye',
    listIcon: 'eye',
  },
};

/** Each trap position's own name, question and explanation, by its game id; every chess claim checked with Stockfish. */
export const TRAP_TEXTS: Record<string, TrapTexts> = {
  'trap-italian-shilling': {
    title: 'The Blackburne Shilling trap',
    ask: 'Your move. The pawn on e5 looks free. Is it?',
    why: 'Nxe5 runs into Qg5, which attacks your knight and g2 at once. Taking the knight on d4 first keeps you safe.',
  },
  'trap-italian-shilling-f7': {
    title: 'The Blackburne Shilling trap',
    ask: "Your move. Black's queen attacks your knight and g2. One tempting move loses fast.",
    why: "Nxf7 attacks the queen and the rook, but Black ignores it: Qxg2 hits your rook, and Black's attack wins. Castling keeps g2 guarded.",
  },
  'trap-italian-two-knights': {
    title: 'Black grabs e4',
    ask: 'Your move. Black just took your e-pawn. Punish it.',
    why: 'Bxf7+ takes a pawn with check. Your knight guards f7, so the king must go to e7, and Black can never castle.',
  },
  'trap-italian-bc5': {
    title: 'Taking on e5 too soon',
    ask: DODGE,
    why: 'Nxe5 gives up your knight for a pawn: the knight on c6 guards e5. A calm move like d3 keeps the game even.',
  },
  'trap-italian-legal': {
    title: "Légal's mate",
    ask: 'Your move. Black just took your queen. Strike back.',
    why: 'Bxf7+ forces the king to e7, and Nd5 is checkmate. Your queen was bait.',
  },
  'trap-italian-d6-ng5': {
    title: 'The fork on f7',
    ask: "Your move. Black's last move left f7 weak. Punish it.",
    why: "Nxf7 attacks the queen and the rook on h8 at once, and nothing can take your knight. Black can't save both.",
  },
  'trap-caro-kann-qe2': {
    title: 'The Nd6 mate trap',
    ask: DODGE,
    why: "Ngf6 would let Nd6 mate: your e-pawn can't take it, and the knight on d7 blocks your queen. Ndf6 clears d7.",
  },
  'trap-caro-kann-ng5': {
    title: 'Mate on f7',
    ask: "Your move. White's bishop and knight both aim at f7. Stay safe.",
    why: "Playing h6 would allow Bxf7, which is checkmate. Playing e6 blocks the bishop's line to f7.",
  },
  'trap-caro-kann-advance': {
    title: 'The trapped bishop',
    ask: "Your move. White's pawns are closing in on your bishop. Keep it safe.",
    why: 'If you play e6, White pushes h5 and traps your bishop on g6: every square it could go to is covered. Playing h5 yourself stops that pawn and frees h7 for your bishop.',
  },
  'trap-caro-kann-qe2-h6': {
    title: 'The knight jump to f7',
    ask: DODGE,
    why: 'Playing h6 would let Nxf7 attack your queen and your rook on h8 at once. Taking that knight with your king walks into mate. Nb6 is safe.',
  },
  'trap-caro-kann-exchange': {
    title: 'Guard b7',
    ask: "Your move. Check what White's queen attacks.",
    why: 'Your bishop has left c8, so nothing guards b7, and e6 would let Qxb7. Qd7 guards it.',
  },
  'trap-caro-kann-qd3': {
    title: 'The queen sacrifice trap',
    ask: 'Your move. The knight on e4 looks free. Is it?',
    why: 'Nxe4 loses to Qd8+: after Kxd8, Bg5+ checks with two pieces at once, and mate comes next. Be7 guards d8.',
  },
};
