import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { OpeningLessonId } from '../types';
import type { PlanLesson, PlanRule } from './types';

export type PlanLessonId = Exclude<OpeningLessonId, 'italian-traps' | 'caro-kann-traps'>;

// Practice texts (hint, ask, idea, remember, offPlan) say only what `fits` guarantees; `why` may also use what `textbook` checks.

function isPiece(board: Chess, square: Square, type: PieceSymbol, color: Color): boolean {
  const piece = board.get(square);
  return piece?.type === type && piece.color === color;
}

const pawnOn = (board: Chess, square: Square, color: Color) => isPiece(board, square, 'p', color);

function noPawnOnFile(board: Chess, file: string, color: Color): boolean {
  return [...'12345678'].every((rank) => !pawnOn(board, `${file}${rank}` as Square, color));
}

/** A move of `piece` to `to` that takes nothing, from a square that starts with `from`: a square, a file, or anywhere. */
function quiet(move: Move, piece: PieceSymbol, to: Square, from = ''): boolean {
  return move.piece === piece && move.to === to && !move.captured && move.from.startsWith(from);
}

/** The squares of the mover's pieces that attack `target` once the move is played. */
function attackersAfter(move: Move, target: Square): Square[] {
  return new Chess(move.after).attackers(target, move.color);
}

const attacksAfter = (move: Move, target: Square) => attackersAfter(move, target).includes(move.to);

// --- The Italian: you play White.

/** Castling short. */
const italianIdea: PlanRule = {
  byMove: 10,
  fits: (move) => (move.isKingsideCastle() ? 'castle' : null),
  // Your bishop aims at the pawn on f7 and your knight is on f3.
  textbook: (_move, board) => {
    const bishop = board.attackers('f7', 'w').some((s) => isPiece(board, s, 'b', 'w'));
    return bishop && pawnOn(board, 'f7', 'b') && isPiece(board, 'f3', 'n', 'w');
  },
};

/** The d-pawn to d4 with your pawns on c3 and e4: c3 then guards d4, beside e4. */
const italianCentre: PlanRule = {
  byMove: 12,
  fits: (move, board) => (quiet(move, 'p', 'd4', 'd') && pawnOn(board, 'c3', 'w') && pawnOn(board, 'e4', 'w') ? 'd4' : null),
  // d4 attacks a pawn on e5.
  textbook: (_move, board) => pawnOn(board, 'e5', 'b'),
};

/** d3, Re1 after castling, or Bb3, with the pawns on e4 and e5 blocking each other and a pawn on d3 once the move is played. */
function slowStep(move: Move, board: Chess): string | null {
  const blocked = pawnOn(board, 'e4', 'w') && pawnOn(board, 'e5', 'b');
  if (!blocked) return null;
  if (quiet(move, 'p', 'd3', 'd2')) return 'd3';
  if (!pawnOn(board, 'd3', 'w')) return null;
  if (quiet(move, 'r', 'e1', 'f1') && isPiece(board, 'g1', 'k', 'w')) return 'Re1';
  if (quiet(move, 'b', 'b3', 'c4')) return 'Bb3';
  return null;
}

const italianSlow: PlanRule = {
  byMove: 12,
  fits: slowStep,
  textbook: (move, board) => {
    switch (slowStep(move, board)) {
      // A knight on f6 attacks e4, and your bishop on c1 is behind the d-pawn.
      case 'd3':
        return isPiece(board, 'f6', 'n', 'b') && isPiece(board, 'c1', 'b', 'w');
      // Nothing stands between the rook and e4.
      case 'Re1':
        return !board.get('e2') && !board.get('e3');
      // A pawn attacks the bishop on c4, and from b3 it attacks the pawn on f7.
      case 'Bb3':
        return board.attackers('c4', 'b').some((s) => pawnOn(board, s, 'b')) && pawnOn(board, 'f7', 'b') && attacksAfter(move, 'f7');
      default:
        return false;
    }
  },
};

/** The knight from f3 to g5, attacking a pawn on f7, with no pawn on h6 to chase it. */
const italianNg5: PlanRule = {
  byMove: 10,
  fits: (move, board) => (quiet(move, 'n', 'g5', 'f3') && pawnOn(board, 'f7', 'b') && !pawnOn(board, 'h6', 'b') ? 'Ng5' : null),
  // A bishop attacks f7 too, and only the king guards it.
  textbook: (move) => {
    const after = new Chess(move.after);
    const guards = after.attackers('f7', 'b');
    const bishop = attackersAfter(move, 'f7').some((s) => after.get(s)?.type === 'b');
    return bishop && guards.length === 1 && after.get(guards[0])?.type === 'k';
  },
};

// --- The Caro-Kann: you play Black.

/** A pawn reaches d5: the d-pawn by move 3, or the c-pawn taking. */
function caroIdeaStep(move: Move, board: Chess): string | null {
  if (quiet(move, 'p', 'd5', 'd') && board.moveNumber() <= 3) return 'd5';
  if (move.piece === 'p' && move.from === 'c6' && move.to === 'd5' && move.captured) return 'cxd5';
  return null;
}

const caroIdea: PlanRule = {
  byMove: 6,
  fits: caroIdeaStep,
  // d5 hits e4 and is backed by c6; the c-pawn takes back a pawn. Either way White has a pawn on d4.
  textbook: (move, board) => {
    const step = caroIdeaStep(move, board);
    if (step === 'd5') return pawnOn(board, 'c6', 'b') && pawnOn(board, 'e4', 'w') && pawnOn(board, 'd4', 'w');
    return step === 'cxd5' && move.captured === 'p' && pawnOn(board, 'd4', 'w');
  },
};

/** The bishop from c8 out to f5 or g4 while your e-pawn is still on e7, with a pawn on d5. */
const caroBishop: PlanRule = {
  byMove: 8,
  fits: (move, board) => {
    const out = quiet(move, 'b', 'f5', 'c8') || quiet(move, 'b', 'g4', 'c8');
    return out && pawnOn(board, 'e7', 'b') && pawnOn(board, 'd5', 'b') ? `B${move.to}` : null;
  },
  // Your pawns stand on c6 and d5; on g4 the bishop pins a knight on f3 to the queen on d1.
  textbook: (move, board) => {
    const pins = isPiece(board, 'f3', 'n', 'w') && isPiece(board, 'd1', 'q', 'w') && !board.get('e2');
    return pawnOn(board, 'c6', 'b') && (move.to === 'f5' || pins);
  },
};

/** The c-pawn to c5 against a White pawn on d4, which it then attacks. */
const caroC5: PlanRule = {
  byMove: 12,
  fits: (move, board) => (quiet(move, 'p', 'c5', 'c') && pawnOn(board, 'd4', 'w') ? 'c5' : null),
  // The Advance chain: White's d4 guards e5, against your d5 and e6.
  textbook: (_move, board) => pawnOn(board, 'e5', 'w') && pawnOn(board, 'd5', 'b') && pawnOn(board, 'e6', 'b'),
};

/** Pawns on d4 and d5, no White e-pawn, no c-pawn of yours, and White's c-pawn on c2 or c3. */
function exchangeStructure(board: Chess): boolean {
  const cPawn = pawnOn(board, 'c2', 'w') || pawnOn(board, 'c3', 'w');
  return pawnOn(board, 'd4', 'w') && pawnOn(board, 'd5', 'b') && noPawnOnFile(board, 'e', 'w') && noPawnOnFile(board, 'c', 'b') && cPawn;
}

const EXCHANGE_PIECE_STEPS = ['Nc6', 'Bg4', 'Bf5', 'Qc7', 'Qb6'];

/** In the Exchange structure: Nc6, Bg4, Bf5, Qc7, Qb6, or the b-pawn to b5 or b4, taking nothing. */
function exchangeStep(move: Move, board: Chess): string | null {
  if (move.captured || !exchangeStructure(board)) return null;
  const piece = `${move.piece.toUpperCase()}${move.to}`;
  if (EXCHANGE_PIECE_STEPS.includes(piece)) return piece;
  return move.piece === 'p' && move.from[0] === 'b' && (move.to === 'b5' || move.to === 'b4') ? move.to : null;
}

const caroExchange: PlanRule = {
  byMove: 16,
  fits: exchangeStep,
  textbook: (move, board) => {
    switch (exchangeStep(move, board)) {
      case 'Nc6':
      case 'Qc7':
        return true;
      // A knight on f3, which guards d4.
      case 'Bg4':
        return isPiece(board, 'f3', 'n', 'w');
      // A bishop on d3 with nothing in between.
      case 'Bf5':
        return isPiece(board, 'd3', 'b', 'w') && !board.get('e4');
      // The queen attacks the pawns on b2 and d4.
      case 'Qb6':
        return pawnOn(board, 'b2', 'w') && attacksAfter(move, 'b2') && attacksAfter(move, 'd4');
      // White's queenside pawns stand on b2 and c3, or the pawn on c3 is attacked.
      case 'b5':
        return pawnOn(board, 'b2', 'w') && pawnOn(board, 'c3', 'w');
      case 'b4':
        return pawnOn(board, 'c3', 'w');
      default:
        return false;
    }
  },
};

const ITALIAN_WHY: Record<string, string> = {
  castle: 'Your bishop already aims at f7 and your knight is out. Castling now gets your king safe and your rook into the game.',
  d4: 'd4 attacks the pawn on e5, and your pawn on c3 backs it up. Now you have two pawns side by side in the centre.',
  d3: 'd3 guards your pawn on e4 against the knight on f6, and it opens the way for your bishop on c1.',
  Re1: 'Re1 puts your rook right behind your pawn on e4. Now your rook and your pawn on d3 both guard it.',
  Bb3: "Bb3 steps your bishop away from the pawn's attack, and from b3 it still aims at f7.",
  Ng5: 'Ng5 and your bishop both attack f7, and only the king guards it.',
};

const CARO_WHY: Record<string, string> = {
  d5: 'd5 attacks the pawn on e4, and your pawn on c6 backs it up. Now you have your share of the centre too.',
  cxd5: 'cxd5 takes back with your c-pawn, so you keep a pawn on d5 in the centre.',
  Bf5: 'Bf5 brings your bishop out in front of your pawns. When you play e6 next, it stays free.',
  Bg4: 'Bg4 brings your bishop out before e6, and it pins the knight on f3 to the queen.',
  c5: "c5 attacks the pawn on d4, the pawn that guards e5. Hit the base of White's pawn chain and the whole chain gets shaky.",
};

const EXCHANGE_WHY: Record<string, string> = {
  Nc6: "Nc6 brings your knight out and attacks White's pawn on d4.",
  Bg4: 'Bg4 attacks the knight on f3, one of the pieces that guards the pawn on d4.',
  Bf5: 'Bf5 brings your bishop out and challenges the bishop on d3.',
  Qc7: 'Qc7 puts your queen on the c-file, where you have no pawn in its way.',
  Qb6: 'Qb6 attacks the pawns on b2 and d4 at the same time.',
  b5: "b5 starts your b-pawn's march. Next comes b4, to break up White's pawns on the queenside.",
  b4: "b4 attacks the pawn on c3, to break up White's pawns on the queenside.",
};

const whyFrom = (texts: Record<string, string>) => (step: string) => texts[step] ?? '';

/** The plan lessons, mined from the games' own moves. */
export const PLAN_LESSONS: Record<PlanLessonId, PlanLesson> = {
  'italian-idea': {
    id: 'italian-idea',
    opening: 'italian',
    kind: 'plan',
    title: 'The Italian idea',
    line: 'Your bishop aims at f7. Get your pieces out and castle early.',
    intro:
      "In the Italian your bishop on c4 aims at f7, the weak pawn next to Black's king. Bring your pieces out quickly and castle early, so your king is safe before the fight starts.",
    spotTitle: 'How to play it',
    spot: ['Knights and bishops out first, toward the centre.', 'Castle early: the king goes to g1 and the rook to f1.', 'Keep your bishop on its diagonal toward f7.'],
    name: 'Castle early',
    hint: 'Your king still stands in the middle. Get it safe.',
    ask: 'Your move: get your king safe.',
    idea: 'Castling takes your king from the middle to g1, and brings your rook to f1.',
    remember: 'Get your knights and bishops out, then castle early: your king is safer, and your rook joins the game.',
    offPlan: 'Good move, but the plan here is to castle and get your king safe.',
    icon: 'p-defend',
    listIcon: 'shield',
    plan: italianIdea,
    why: whyFrom(ITALIAN_WHY),
  },
  'italian-centre': {
    id: 'italian-centre',
    opening: 'italian',
    kind: 'plan',
    title: 'Build the centre',
    line: 'Play c3, then push your d-pawn to d4.',
    intro: 'With a pawn on c3, your c-pawn is ready to back up a pawn on d4. Then d4 gives you two pawns side by side in the centre.',
    spotTitle: 'How to play it',
    spot: ['Look for your pawns on c3 and e4.', 'Push your d-pawn to d4: the pawn on c3 guards it.', 'If Black takes on d4, you can take back with the c-pawn.'],
    name: 'Build the centre',
    hint: 'Your pawn on c3 is ready to back up a pawn on d4.',
    ask: 'Your move: build the centre.',
    idea: 'd4 puts a second pawn in the centre next to e4, and your pawn on c3 guards it.',
    remember: 'First c3, then d4: two pawns in the centre, with the c-pawn behind them.',
    offPlan: 'Good move, but the plan here is to push your d-pawn to d4, with the pawn on c3 behind it.',
    icon: 'arrow-right',
    listIcon: 'arrow',
    plan: italianCentre,
    why: whyFrom(ITALIAN_WHY),
  },
  'italian-slow': {
    id: 'italian-slow',
    opening: 'italian',
    kind: 'plan',
    title: 'The slow plan',
    line: 'Guard e4 with d3, castle, rook to e1, bishop back to b3.',
    intro:
      'When the pawns on e4 and e5 block each other, there is no rush. Guard e4 with d3, castle, put your rook on e1 and tuck your bishop back on b3.',
    spotTitle: 'How to play it',
    spot: ['Pawns on e4 and e5 block each other.', 'Guard your pawn on e4 with d3.', 'Then castle, put your rook on e1 and drop your bishop back to b3.'],
    name: 'The slow plan',
    hint: 'Your pawns on e4 and e5 block each other. Play it slow: d3, rook to e1, bishop back to b3.',
    ask: 'Your move: play the slow plan.',
    idea: 'Your pawns on d3 and e4 hold the centre, so you can build up one calm move at a time.',
    remember: 'When the pawns on e4 and e5 block each other, play it slow: d3, castle, rook to e1, bishop back to b3.',
    offPlan: 'Good move, but the plan here is a slow one: d3, a rook on e1, or the bishop back to b3.',
    icon: 'p-quiet',
    listIcon: 'quiet',
    plan: italianSlow,
    why: whyFrom(ITALIAN_WHY),
  },
  'italian-ng5': {
    id: 'italian-ng5',
    opening: 'italian',
    kind: 'plan',
    title: 'Ng5 against f7',
    line: 'Jump your knight to g5 to hit f7, but not when a pawn on h6 can chase it.',
    intro:
      "At the start only Black's king guards the pawn on f7, and your bishop on c4 already aims at it. Ng5 adds a second attacker, but a pawn on h6 would chase the knight away.",
    spotTitle: 'How to play it',
    spot: ['Your bishop on c4 aims at f7.', 'Ng5 brings your knight in to attack f7 as well.', "Don't play it when a pawn on h6 can chase the knight away."],
    name: 'Ng5 against f7',
    hint: 'Your knight on f3 can jump in and attack the pawn on f7.',
    ask: 'Your move: go after f7.',
    idea: 'Ng5 attacks the pawn on f7, and no pawn on h6 can chase your knight away.',
    remember: 'Ng5 hits f7. Play it only when no pawn on h6 can chase the knight away.',
    offPlan: 'Good move, but the plan here is to bring your knight to g5 and hit f7.',
    icon: 'p-loose',
    listIcon: 'loose',
    plan: italianNg5,
    why: whyFrom(ITALIAN_WHY),
  },
  'caro-kann-idea': {
    id: 'caro-kann-idea',
    opening: 'caro-kann',
    kind: 'plan',
    title: 'The Caro-Kann idea',
    line: 'c6 gets d5 ready. If White takes on d5, take back with the c-pawn.',
    intro: "In the Caro-Kann you play c6 first, so your c-pawn can back up a pawn on d5. That pawn fights White's pawn on e4 for the centre.",
    spotTitle: 'How to play it',
    spot: ['Play d5 early, backed by your pawn on c6.', 'If White takes on d5, take back with the c-pawn.', 'Either way you keep a pawn in the centre on d5.'],
    name: 'The Caro-Kann idea',
    hint: 'Fight for the centre: get a pawn to d5.',
    ask: 'Your move: claim the centre.',
    idea: 'Your pawn on d5 gives you your share of the centre.',
    remember: 'First c6, then d5. If White takes on d5, take back with the c-pawn.',
    offPlan: 'Good move, but the plan here is to get a pawn to d5.',
    icon: 'lightbulb',
    listIcon: 'bulb',
    plan: caroIdea,
    why: whyFrom(CARO_WHY),
  },
  'caro-kann-bishop': {
    id: 'caro-kann-bishop',
    opening: 'caro-kann',
    kind: 'plan',
    title: 'Your light bishop first',
    line: 'Bring your bishop from c8 out to f5 or g4 before you play e6.',
    intro: 'Once you play e6, your own pawns shut in the bishop on c8. So bring it out to f5 or g4 first, then play e6.',
    spotTitle: 'How to play it',
    spot: ['Your e-pawn is still on e7.', 'Bring your bishop from c8 out to f5 or g4.', 'Play e6 after it, so the bishop stays outside your pawns.'],
    name: 'Light bishop first',
    hint: 'Your e-pawn is still on e7. Get your bishop out before e6 shuts it in.',
    ask: 'Your move: get your bishop out before e6.',
    idea: "Your bishop is out before e6, so your own pawns won't shut it in.",
    remember: 'In the Caro-Kann, bring your bishop from c8 out to f5 or g4 first. Play e6 after it.',
    offPlan: 'Good move, but the plan here is to bring your bishop from c8 out before you play e6.',
    icon: 'p-discovered',
    listIcon: 'discovered',
    plan: caroBishop,
    why: whyFrom(CARO_WHY),
  },
  'caro-kann-c5': {
    id: 'caro-kann-c5',
    opening: 'caro-kann',
    kind: 'plan',
    title: 'The c5 break',
    line: "Hit White's pawn on d4 with your c-pawn.",
    intro: "White's pawn on d4 holds the centre. Pushing your c-pawn to c5 attacks it and fights for the centre.",
    spotTitle: 'How to play it',
    spot: ["Look for White's pawn on d4.", 'Push your c-pawn to c5 to attack it.', 'Against pawns on d4 and e5, c5 hits the pawn that guards e5.'],
    name: 'The c5 break',
    hint: "White's pawn on d4 holds the centre. Attack it with a pawn.",
    ask: 'Your move: hit the centre.',
    idea: "c5 attacks White's pawn on d4 and fights for the centre.",
    remember: 'When White has a pawn on d4, push your c-pawn to c5 and hit it.',
    offPlan: "Good move, but the plan here is to hit White's pawn on d4 with your c-pawn.",
    icon: 'arrow-right',
    listIcon: 'arrow',
    plan: caroC5,
    why: whyFrom(CARO_WHY),
  },
  'caro-kann-exchange': {
    id: 'caro-kann-exchange',
    opening: 'caro-kann',
    kind: 'plan',
    title: 'The Exchange structure',
    line: 'Knight to c6, bishop out, queen to c7 or b6, then the b-pawn forward.',
    intro:
      'After the pawns trade on d5, White has no e-pawn and you have no c-pawn. Put your pieces on active squares, then push your b-pawn up the board.',
    spotTitle: 'How to play it',
    spot: ['Pawns on d4 and d5, no White e-pawn, no c-pawn of yours.', 'Knight to c6, bishop out to f5 or g4, queen to c7 or b6.', 'Later, push your b-pawn to b5 and b4.'],
    name: 'The Exchange structure',
    hint: 'White has no e-pawn and you have no c-pawn. The plan: knight to c6, bishop out, queen to c7 or b6, b-pawn forward.',
    ask: 'Your move: follow the Exchange plan.',
    idea: 'In this structure your pieces go to active squares, and your b-pawn leads the way on the queenside.',
    remember: 'In the Exchange structure: knight to c6, bishop out, queen to c7 or b6, then push your b-pawn.',
    offPlan: 'Good move, but the plan here is a move from the Exchange plan: knight to c6, bishop out, queen to c7 or b6, or the b-pawn forward.',
    icon: 'p-quiet',
    listIcon: 'trend',
    plan: caroExchange,
    why: whyFrom(EXCHANGE_WHY),
  },
};
