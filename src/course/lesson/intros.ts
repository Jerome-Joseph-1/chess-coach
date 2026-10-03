import type { UnitId } from '../types';

export interface Intro {
  /** What the pattern is, in two short sentences. */
  intro: string;
  /** How to spot it over the board. */
  spot: string[];
}

export const INTROS: Record<UnitId, Intro> = {
  'free-piece': {
    intro: 'A free piece is an enemy piece you can take without losing anything back. Either nothing guards it, or it is not guarded well enough.',
    spot: [
      'After every move, check each enemy piece: what guards it?',
      'Count your attackers against its guards.',
      'A smaller piece can take a bigger one even if it is guarded.',
    ],
  },
  'piece-in-danger': {
    intro: 'Every enemy move can attack one of your pieces. Before you play your own idea, make sure nothing of yours can be taken for free.',
    spot: [
      'After each enemy move, ask: what does that piece attack now?',
      'Count the attackers and guards on your piece.',
      'Move it, guard it, block the attack or take the attacker.',
    ],
  },
  fork: {
    intro: 'A fork is one piece attacking two enemy pieces at once. Your opponent can save only one of them.',
    spot: [
      'Look for two enemy pieces one move could hit, above all the king and queen.',
      'Check every square your knight can jump to.',
      'A fork with check is the strongest: the king must move first.',
    ],
  },
  pin: {
    intro: 'A pin is an attack on a piece that cannot move without exposing a bigger piece behind it. Pinned to the king, it cannot move at all.',
    spot: [
      'Look for an enemy piece standing in front of its king or queen.',
      'Put a bishop, rook or queen on that line.',
      'Then attack the pinned piece again, ideally with a pawn.',
    ],
  },
  checkmate: {
    intro: 'Checkmate is a check with no answer: the king cannot step away, and nothing can block the check or take the checking piece. A threat of mate is strong too, because it must be answered.',
    spot: [
      'Look at every check you have, even the ones that give up material.',
      "Count the king's free squares; often its own pawns block them.",
      'A king on its back rank behind its pawns can be mated by a rook or queen.',
    ],
  },
  'remove-defender': {
    intro: 'Sometimes a piece is safe only because one piece guards it. Take that guard, chase it or lure it away, and the piece falls.',
    spot: [
      'Find an enemy piece you attack that has only one guard.',
      'Can you take the guard, attack it, or pull it away?',
      'Once the guard is gone, take the piece.',
    ],
  },
  discovered: {
    intro: 'A discovered attack happens when one of your pieces moves out of the way and opens a line for another. One move makes two threats.',
    spot: [
      'Look for one of your pieces between your bishop, rook or queen and an enemy piece.',
      'Move it with a threat of its own, ideally a check.',
      'Your opponent can answer only one threat.',
    ],
  },
  skewer: {
    intro: 'A skewer attacks a big piece with a smaller one behind it on the same line. When the big piece steps aside, you take the one behind.',
    spot: [
      'Look for the enemy king or queen on a line with another piece.',
      'Attack the front piece with a bishop, rook or queen.',
      'When it moves, take the piece behind it.',
    ],
  },
  trapped: {
    intro: 'A trapped piece is attacked and has no safe square to go to. Knights on the edge and pieces deep in your half are the usual victims.',
    spot: [
      'Count the squares an enemy piece can go to.',
      'Check whether you cover all of them.',
      'Then attack it, often with a pawn.',
    ],
  },
  traps: {
    intro: 'Some moves look natural or win a pawn, but walk into a strong reply. Before you play, check what your opponent can do next.',
    spot: [
      'When a capture looks free, ask why it was left there.',
      "Look at your opponent's checks, captures and threats after your move.",
      'Make sure the piece you move was not guarding something.',
    ],
  },
  threats: {
    intro: 'Your opponent has plans too: a fork, a pin, a mate. Spot the threat before it lands and let your move stop it.',
    spot: [
      'After each enemy move, ask: what does it want to do next?',
      'Look at their checks and captures as if it were their move.',
      'Choose a move that stops the threat.',
    ],
  },
};
