import type { Game, Kind, Level, Turn } from '../content/types';
import { HOLD_MAX } from './flow';
import { material } from './material';
import { flipTurn, playLine, sanOf, type PlayedMove } from './position';

export const COPY = {
  spotQuestion: 'Anything here?',
  spotHelp: 'Look at the board before you move.',
  spotYes: "Something's up",
  spotNo: 'All quiet',
  spotRight: 'Right!',
  spotWrong: 'Not this time.',
  findPrompt: 'Where? Tap the piece that matters.',
  findRetry: 'Not there. Try again.',
  findDone: 'That one!',
  findHint: "It's here.",
  solvePrompt: 'Your move.',
  holdPrompt: 'Keep going. Your move.',
  retry: 'Not that one — one more try',
  solved: 'Yes!',
  missed: 'Not quite. Let’s look.',
  replying: 'Watch the reply.',
  altToast: 'That works too',
  tryAgain: 'Try again',
  next: 'Continue',
  practice: 'Practice round. Your first try counts.',
  playItForMe: 'Play it for me',
  missTitle: 'You missed something',
  backToPosition: 'Back to position',
} as const;

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

/** Share of what players at this level choose that holds the position. */
export function holdShare(turn: Turn): number {
  return turn.human.reduce((sum, h) => ((turn.grades[h.uci] ?? Infinity) <= HOLD_MAX ? sum + h.share : sum), 0);
}

export function findToast(turn: Turn, level: Level): string {
  const share = holdShare(turn);
  return share < 0.5 ? `Only ${percent(share)}% of ${level} players find this` : 'Nice find!';
}

export function guidedPrompt(san: string): string {
  return `Play it: ${san}`;
}

export function continuesWith(san: string): string {
  return `This game continues with ${san}.`;
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
  if (mate >= 0) return `You could checkmate: ${listMoves(mine(mate))}.`;

  const lastTake = lastIndexWhere(line, (m) => m.captured !== null);
  const before = material(turn.fen, game.side);
  const gain = lastTake < 0 ? 0 : material(line[lastTake].after, game.side) - before;
  if (gain <= 0) return strongMove(turn);
  const verb = before < 0 && gain <= -before ? 'win back' : 'win';
  return `You could ${verb} ${gainPhrase(gain)}: ${listMoves(mine(lastTake))}.`;
}

/** The first move in the threat line that takes one of the user's pieces. */
function threatTake(game: Game, turn: Turn): PlayedMove | undefined {
  return playLine(flipTurn(turn.fen), turn.lines.threat ?? []).find((m) => m.side !== game.side && m.captured);
}

function defendSentence(game: Game, turn: Turn, also: boolean): string {
  const take = threatTake(game, turn);
  const opponent = opponentName(game);
  if (!take) return strongMove(turn);
  const threat = `...${take.san}, winning your ${PIECES[take.captured!]}`;
  if (also) return `${opponent} also threatened ${threat}.`;
  const best = turn.lines.best?.[0];
  return best ? `${opponent} threatened ${threat}. ${sanOf(turn.fen, best)} deals with it.` : `${opponent} threatened ${threat}.`;
}

function trapSentence(game: Game, turn: Turn, also: boolean): string {
  const line = playLine(turn.fen, turn.lines.mistake ?? (turn.mistakeMove ? [turn.mistakeMove] : []));
  const [bait, reply] = line;
  if (!bait) return strongMove(turn);
  if (also) return `${bait.san} looks natural but loses material.`;
  const share = turn.human.find((h) => h.uci === bait.uci)?.share;
  const popular = share ? ` — ${percent(share)}% of ${game.level} players play it —` : ',';
  const answer = reply
    ? `...${reply.san} ${reply.captured ? `wins your ${PIECES[reply.captured]}` : 'punishes it'}`
    : 'it loses material';
  return `${bait.san} looks natural${popular} but ${answer}.`;
}

function quietSentence(game: Game, turn: Turn): string {
  return `All quiet: ${percent(1 - turn.wrongShare)}% of the moves ${game.level} players choose here are fine.`;
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
  if (turn.label === 'nothing') return quietSentence(game, turn);
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
