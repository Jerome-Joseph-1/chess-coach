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
      'Watch for a queen move that attacks two things at once, like Qg5 against e5 and g2.',
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
      'Early on, only your king guards f7. A white knight on g5 and a bishop on c4 both attack it.',
      "If White's pawns close in on your bishop, give it a square to retreat to, like h7.",
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
    why: 'Nxe5 runs into Qg5. Through f5, the queen attacks your knight on e5. Through g4 and g3, it attacks g2. Taking the knight on d4 first keeps you safe.',
  },
  'trap-italian-shilling-f7': {
    title: 'The Blackburne Shilling trap',
    ask: "Your move. Black's queen on g5 attacks your knight on e5 and your pawn on g2. One tempting move loses fast.",
    why: "Nxf7 attacks the queen on g5 and the rook on h8. But Black ignores it: Qxg2 then attacks your rook on h1, and Black's attack wins. Castling puts your king on g1, guarding g2.",
  },
  'trap-italian-two-knights': {
    title: 'Black grabs e4',
    ask: 'Your move. Black just took your e-pawn. Punish it.',
    why: "Bxf7+ takes a pawn with check. Your knight on g5 guards your bishop on f7, so the king can't take it. It must go to e7, and Black can never castle.",
  },
  'trap-italian-bc5': {
    title: 'Taking on e5 too soon',
    ask: DODGE,
    why: 'Nxe5 gives up your knight for a pawn: the knight on c6 guards e5. A calm move like d3 keeps the game even.',
  },
  'trap-italian-legal': {
    title: "Légal's mate",
    ask: 'Your move. Black just took your queen. Strike back.',
    why: 'Bxf7+ forces the king to e7, as your knight on e5 guards f7. Then Nd5 is checkmate: your bishop and knights cover every free square around the king. Your queen was bait.',
  },
  'trap-italian-d6-ng5': {
    title: 'The fork on f7',
    ask: "Your move. Black's last move left f7 weak. Punish it.",
    why: "Nxf7 attacks the queen on d8 and the rook on h8 at once. The king can't take it: your bishop on c4 guards f7. Black can't save both.",
  },
  'trap-caro-kann-qe2': {
    title: 'The Nd6 mate trap',
    ask: DODGE,
    why: "Ngf6 would let Nd6 mate. Your pawn on e7 can't take: with e4 empty, it alone shields your king from the queen on e2. Ndf6 empties d7, so your queen on d8 guards d6.",
  },
  'trap-caro-kann-ng5': {
    title: 'Mate on f7',
    ask: "Your move. White's bishop on c4 and knight on g5 both attack f7. Stay safe.",
    why: "Playing h6 would allow Bxf7, which is checkmate. Playing e6 puts a pawn in the bishop's path, between c4 and f7.",
  },
  'trap-caro-kann-advance': {
    title: 'The trapped bishop',
    ask: "Your move. White's pawns on f3, g4 and h4 close in on your bishop on g6. Keep it safe.",
    why: 'If you play e6, White pushes h5 and traps your bishop on g6. Your pawn on h7 blocks its way back, and every other square is covered. Playing h5 yourself stops that pawn and frees h7 for your bishop.',
  },
  'trap-caro-kann-qe2-h6': {
    title: 'The knight jump to f7',
    ask: DODGE,
    why: 'Playing h6 would let Nxf7 attack your queen on d8 and your rook on h8 at once. If your king takes the knight, Qxe6+ leads to mate. Nb6 is safe.',
  },
  'trap-caro-kann-exchange': {
    title: 'Guard b7',
    ask: "Your move. White's queen on b3 attacks your pawns on b7 and d5. Check both.",
    why: 'The queen on b3 attacks b7 up the b-file, through b4, b5 and b6. Your bishop has left c8, so nothing guards b7. After e6, Qxb7 takes it. Qd7 guards b7 along the seventh rank.',
  },
  'trap-caro-kann-qd3': {
    title: 'The queen sacrifice trap',
    ask: 'Your move. The knight on e4 looks free. Is it?',
    why: 'Nxe4 loses to Qd8+, down the open d-file. After Kxd8, Bg5+ is double check: the rook on d1 and the bishop on g5 both check. Mate comes next. Be7 guards d8.',
  },
};
