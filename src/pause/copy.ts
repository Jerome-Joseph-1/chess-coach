import type { Depth, Game, Kind, Level, StepOutcome, Turn } from '../content/types';
import { holdShare } from '../game/grading';
import { material } from './material';
import { flipTurn, moveBefore, playLine, sanOf, type OpponentMove, type PlayedMove } from './position';

export const COPY = {
  spotTitle: 'Is something important happening?',
  spotYes: "Yes, something's going on",
  spotNo: 'No, nothing special',
  findTitle: 'Which piece matters most?',
  findSub: 'Tap it on the board. You get two tries.',
  findRetry: 'Not quite. Try again.',
  findHint: "It's marked on the board.",
  notSure: "I'm not sure",
  solveTitle: "What's your move?",
  solveSub: 'Play it on the board.',
  showAnswer: 'Show me the answer',
  right: 'Right.',
  notQuite: 'Not quite.',
  oneMore: 'Not quite. One more try.',
  altNote: 'That works too.',
  holdTitle: 'Keep going',
  tryAgain: 'Try again',
  next: 'Continue',
  practice: 'Practice round. Your first try counts.',
  backToPosition: 'Back to the position',
} as const;

export function stepLabel(step: number, total: number): string {
  return `Step ${step} of ${total}`;
}

const PIECES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

const GAINS: Record<number, string> = {
  1: 'a pawn',
  2: 'two pawns',
  3: 'a piece',
  4: 'a piece and a pawn',
  5: 'a rook',
  6: 'a rook and a pawn',
  7: 'a rook and two pawns',
  8: 'a rook and a piece',
};

export function gainPhrase(gain: number): string {
  return gain >= 9 ? 'the queen' : (GAINS[gain] ?? 'material');
}

export function percent(share: number): number {
  return Math.round(share * 100);
}

export function opponentName(game: Game): string {
  return game.side === 'w' ? 'Black' : 'White';
}

/** Praise for the right move, or how few players find it when most miss it. */
export function findNote(turn: Turn, level: Level): string {
  const share = holdShare(turn);
  return share > 0 && share < 0.5 ? `Only ${percent(share)}% of players rated ${level} find this.` : COPY.right;
}

export function guidedTitle(san: string): string {
  return `Play it: ${san}`;
}

export function continuesWith(san: string): string {
  return `This game continues with ${san}.`;
}

export function holdSub(game: Game): string {
  return `${opponentName(game)} has answered. What's your next move?`;
}

export function replySub(game: Game): string {
  return `${opponentName(game)} is answering.`;
}

export type ResultKind = 'success' | 'danger' | 'quiet';

export interface ResultLine {
  kind: ResultKind;
  text: string;
}

export const MISSED: ResultLine = { kind: 'danger', text: 'Missed it' };

const FOUND: Record<Depth, string> = {
  1: 'You spotted it',
  2: 'You spotted it and found the piece',
  3: 'You spotted it and found the move',
  4: 'You spotted it and found the move',
  5: 'You spotted it and found the move',
};

/** The line that opens the reveal: how this attempt went. A quiet position is neither a win nor a miss. */
export function resultLine(type: 'pause' | 'nothing', depth: Depth, outcomes: StepOutcome[]): ResultLine {
  if (type === 'nothing') {
    return { kind: 'quiet', text: outcomes[0]?.correct ? 'You saw it was quiet' : 'This one was quiet' };
  }
  const allRight = outcomes.length > 0 && outcomes.every((o) => o.correct);
  return allRight ? { kind: 'success', text: FOUND[depth] } : MISSED;
}

/** What the opponent just did, as the sub line of step 1. */
export function spotSub(game: Game, turnIndex: number): string {
  const move = moveBefore(game, game.turns[turnIndex].ply);
  const look = 'Take a look before you move.';
  return move ? `${describeMove(opponentName(game), move)} ${look}` : look;
}

function describeMove(who: string, move: OpponentMove): string {
  if (move.recapture) return `${who} just took back on ${move.to}.`;
  if (move.captured) return `${who} just took your ${PIECES[move.captured]} on ${move.to}.`;
  if (move.promotion) return `${who} just promoted a pawn.`;
  if (move.castle) return `${who} just castled.`;
  if (move.check) return `${who} just put you in check.`;
  return `${who} just played ${move.san}.`;
}

function lastIndexWhere(moves: PlayedMove[], test: (m: PlayedMove) => boolean): number {
  for (let i = moves.length - 1; i >= 0; i--) if (test(moves[i])) return i;
  return -1;
}

/** "Nd3", "Nd3, then Bxe6", "Nd3, then Bxe6 and Rxe6+". */
function listMoves(sans: string[]): string {
  const [first, ...rest] = sans;
  if (rest.length < 2) return rest.length ? `${first}, then ${rest[0]}` : first;
  return `${first}, then ${rest.slice(0, -1).join(', ')} and ${rest.at(-1)}`;
}

function strongMove(turn: Turn): string {
  const best = turn.lines.best?.[0];
  return best ? `The strong move here is ${sanOf(turn.fen, best)}.` : 'Something important is happening here.';
}

function winSentence(game: Game, turn: Turn): string {
  const line = playLine(turn.fen, turn.lines.best ?? []);
  // The user's first move, then the captures that win the material; quiet moves in between are left out.
  const mine = (upTo: number) =>
    line
      .slice(0, upTo + 1)
      .filter((m, i) => m.side === game.side && (i === 0 || i === upTo || m.captured))
      .slice(0, 3)
      .map((m) => m.san);

  const mate = lastIndexWhere(line, (m) => m.san.endsWith('#'));
  if (mate >= 0) return `You could checkmate with ${listMoves(mine(mate))}.`;

  const lastTake = lastIndexWhere(line, (m) => m.captured !== null);
  const before = material(turn.fen, game.side);
  const gain = lastTake < 0 ? 0 : material(line[lastTake].after, game.side) - before;
  if (gain <= 0) return strongMove(turn);
  const verb = before < 0 && gain <= -before ? 'win back' : 'win';
  return `You could ${verb} ${gainPhrase(gain)} with ${listMoves(mine(lastTake))}.`;
}

/** The first move in the threat line that takes one of the user's pieces. */
function threatTake(game: Game, turn: Turn): PlayedMove | undefined {
  return playLine(flipTurn(turn.fen), turn.lines.threat ?? []).find((m) => m.side !== game.side && m.captured);
}

function defendSentence(game: Game, turn: Turn, also: boolean): string {
  const take = threatTake(game, turn);
  if (!take) return strongMove(turn);
  const target = `take your ${PIECES[take.captured!]} on ${take.uci.slice(2, 4)}`;
  const lead = `${opponentName(game)} was ${also ? 'also ' : ''}threatening to ${target}.`;
  const best = turn.lines.best?.[0];
  return best && !also ? `${lead} ${sanOf(turn.fen, best)} saves it.` : lead;
}

function trapSentence(game: Game, turn: Turn, also: boolean): string {
  const line = playLine(turn.fen, turn.lines.mistake ?? (turn.mistakeMove ? [turn.mistakeMove] : []));
  const [bait, reply] = line;
  if (!bait) return strongMove(turn);
  if (also) return `${bait.san} looks natural but loses material.`;
  const share = turn.human.find((h) => h.uci === bait.uci)?.share;
  const opponent = opponentName(game);
  const look = bait.captured ? 'looks free' : 'looks fine';
  const answer = reply?.captured
    ? `${opponent} wins your ${PIECES[reply.captured]} with ...${reply.san}`
    : reply
      ? `${opponent} has ...${reply.san}`
      : `${opponent} comes out ahead`;
  const fall = share ? ` ${percent(share)}% of players rated ${game.level} fall for it.` : '';
  return `${bait.san} ${look}, but ${answer}.${fall}`;
}

function quietSentence(): string {
  return 'Nothing special. Any normal move is fine here.';
}

const SENTENCES: Record<Kind, (game: Game, turn: Turn, also: boolean) => string> = {
  win: (game, turn) => winSentence(game, turn),
  defend: defendSentence,
  trap: trapSentence,
};
const KIND_ORDER: Kind[] = ['win', 'defend', 'trap'];

/** One or two short sentences saying what the position asked for. Wins lead. */
export function headline(game: Game, turnIndex: number): string {
  const turn = game.turns[turnIndex];
  if (turn.label === 'nothing') return quietSentence();
  const [first, second] = KIND_ORDER.filter((kind) => turn.kinds.includes(kind));
  if (!first) return strongMove(turn);
  const lead = SENTENCES[first](game, turn, false);
  return second ? `${lead} ${SENTENCES[second](game, turn, true)}` : lead;
}

/** Reveal sentence when the user lost ground at a later move of the play-out. */
export function holdMissHeadline(game: Game, turnIndex: number, uci: string): string {
  const turn = game.turns[turnIndex];
  const [played, reply] = playLine(turn.fen, [uci, ...(turn.refutations[uci] ?? [])]);
  const best = turn.lines.best?.[0];
  const answer = reply ? `: ${opponentName(game)} plays ...${reply.san}.` : '.';
  const hold = best ? ` ${sanOf(turn.fen, best)} holds.` : '';
  return `${played?.san ?? uci} loses ground${answer}${hold}`;
}
