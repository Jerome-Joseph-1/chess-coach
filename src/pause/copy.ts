import type { Game, Kind, Level, Side, StepOutcome, Turn } from '../content/types';
import { holdShare } from '../game/grading';
import { SITUATIONS, mainSituation, type Situation } from '../learn/situation';
import { capturesIn, materialLoss, valueOf } from './captures';
import { material, pieceValue } from './material';
import { flipTurn, moveBefore, playLine, sanOf, type OpponentMove, type PlayedMove } from './position';

export const COPY = {
  spotTitle: "What's going on here?",
  solveTitle: 'Your move',
  solveSub: 'Play the best move on the board.',
  tryAgain: 'Not quite. Try again.',
  retry: 'Try again',
  showSolution: 'Show solution',
  hintPiece: 'Move the highlighted piece.',
  hintMove: 'Play the move shown.',
  right: 'Right.',
  altNote: 'That works too.',
  holdTitle: 'Keep going',
  next: 'Continue',
  watchAgain: 'Watch again',
  lineIntro: 'Watch how it plays out.',
  remember: 'Remember',
  whyMove: 'Why this move?',
  backToLine: 'Back to the line',
} as const;

export function stepLabel(step: number, total: number): string {
  return `Step ${step} of ${total}`;
}

const PIECES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

const COUNTS = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

function pieceCount(type: string, count: number): string {
  if (count === 1) return type === 'q' ? 'the queen' : `a ${PIECES[type]}`;
  return `${COUNTS[count]} ${PIECES[type]}s`;
}

/** "a pawn", "two pawns", "a knight and a bishop", "a rook, a knight and a pawn". */
export function piecesPhrase(types: string[]): string {
  const counts = new Map<string, number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
  const parts = [...counts]
    .sort(([a], [b]) => pieceValue(b) - pieceValue(a))
    .map(([type, count]) => pieceCount(type, count));
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
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

export function continuesWith(san: string): string {
  return `This game continues with ${san}.`;
}

export function holdSub(game: Game): string {
  return `${opponentName(game)} has answered. What's your next move?`;
}

export function replySub(game: Game): string {
  return `${opponentName(game)} is answering.`;
}

export type ResultKind = 'success' | 'danger' | 'hint' | 'quiet';

export interface ResultLine {
  kind: ResultKind;
  text: string;
}

export const MISSED: ResultLine = { kind: 'danger', text: 'Missed it' };
export const HINTED: ResultLine = { kind: 'hint', text: 'Solved with a hint' };

/** The line that opens the reveal: how this attempt went. A quiet position is neither a win nor a miss. */
export function resultLine(type: 'pause' | 'nothing', outcomes: StepOutcome[], hinted = false): ResultLine {
  if (type === 'nothing') {
    return { kind: 'quiet', text: outcomes[0]?.correct ? 'You saw it was quiet' : 'This one was quiet' };
  }
  const allRight = outcomes.length > 0 && outcomes.every((o) => o.correct);
  if (allRight) return { kind: 'success', text: 'You found the move' };
  return hinted ? HINTED : MISSED;
}

/** What the opponent just did, as the sub line of step 1. */
export function spotSub(game: Game, turnIndex: number): string {
  const move = moveBefore(game, game.turns[turnIndex].ply);
  return move ? describeMove(opponentName(game), move) : 'Take a look before you move.';
}

/** The right pick said back in general terms: what kind of position it is, never the move. */
const SPOT_RIGHT: Record<Situation, string> = {
  win: "Yes: there's material to win. Find the move.",
  attack: 'Yes: you can go after the king. Find the move.',
  defend: 'Yes: something of yours needs defending.',
  trap: 'Yes: the obvious move has a catch. Find a better one.',
  quiet: 'Yes: no threats and nothing to win, so improve a piece.',
};

export function spotRight(pick: Situation): string {
  return SPOT_RIGHT[pick];
}

const CHECK_TAKES = 'Look again: check every capture and every attack.';
const NOT_ATTACKED = 'Is anything of yours actually attacked? Count the attackers.';

/** A wrong pick, answered for what the position really is: NUDGES[real][picked]. */
const NUDGES: Record<Situation, Partial<Record<Situation, string>>> = {
  win: {
    attack: 'Look past the king: is anything of theirs loose?',
    defend: NOT_ATTACKED,
    trap: 'Check every capture: is one of them simply good?',
    quiet: CHECK_TAKES,
  },
  attack: {
    win: 'Look at their king first: check every check.',
    defend: NOT_ATTACKED,
    trap: 'Look at their king: which checks do you have?',
    quiet: 'Look again: check every check and every attack on the king.',
  },
  defend: {
    win: 'Before you grab, check what they threaten.',
    attack: 'Before you attack, check what they threaten.',
    trap: 'Look at their last move: what does it threaten?',
    quiet: 'Look again: what does their last move threaten?',
  },
  trap: {
    win: 'Before you grab, check their best reply.',
    attack: 'Before you go after the king, check their best reply.',
    defend: 'Is anything of yours actually attacked? Check what your natural move allows.',
    quiet: 'Look again: check what your natural move allows.',
  },
  quiet: {
    win: 'Is it really free? Count attackers and defenders.',
    attack: 'Is their king really in danger? Count attackers and defenders.',
    defend: NOT_ATTACKED,
    trap: 'Look again: does any natural move really lose something?',
  },
};

/** A nudge for a wrong pick that fits both the pick and what the position is really about; several right answers get the most urgent. */
export function spotNudge(pick: Situation, answers: Situation[]): string {
  return NUDGES[mainSituation(answers)][pick] ?? CHECK_TAKES;
}

/** Why the right answer to step 1 is right, in general terms: never the move. */
const SPOT_WHY: Record<Situation, string> = {
  win: 'One of your moves wins something.',
  attack: 'Their king is in danger.',
  defend: 'They threaten something of yours.',
  trap: 'The natural move here is a mistake.',
  quiet: 'No threats and nothing to win here.',
};

/** What the opponent threatens to take, e.g. "Black threatens to take your knight on e5." */
function threatNote(game: Game, turn: Turn): string | null {
  const take = threatTake(game, turn);
  return take ? `${opponentName(game)} threatens to take your ${PIECES[take.captured!]} on ${take.uci.slice(2, 4)}.` : null;
}

/** The right answer to step 1 and one line why, shown after the second wrong pick. */
export function spotShown(game: Game, turnIndex: number, answer: Situation): string {
  const label = SITUATIONS.find((s) => s.id === answer)!.label;
  const why = (answer === 'defend' && threatNote(game, game.turns[turnIndex])) || SPOT_WHY[answer];
  return `Right answer: ${label}. ${why}`;
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

function strongMove(turn: Pick<Turn, 'fen' | 'lines'>): string {
  const best = turn.lines.best?.[0];
  return best ? `The strong move here is ${sanOf(turn.fen, best)}.` : 'Something important is happening here.';
}

export function winSentence(side: Side, turn: Pick<Turn, 'fen' | 'lines'>): string {
  const line = playLine(turn.fen, turn.lines.best ?? []);
  // The user's first move, then the captures that win the material; quiet moves in between are left out.
  const mine = (upTo: number) =>
    line
      .slice(0, upTo + 1)
      .filter((m, i) => m.side === side && (i === 0 || i === upTo || m.captured))
      .slice(0, 3)
      .map((m) => m.san);

  const mate = lastIndexWhere(line, (m) => m.san.endsWith('#'));
  if (mate >= 0) return `You could checkmate with ${listMoves(mine(mate))}.`;

  const lastTake = lastIndexWhere(line, (m) => m.captured !== null);
  const { won, lost } = capturesIn(line.slice(0, lastTake + 1), side);
  const gain = valueOf(won) - valueOf(lost);
  if (gain <= 0) return strongMove(turn);
  const behind = material(turn.fen, side) < 0 && gain <= -material(turn.fen, side);
  const what = `${behind ? 'win back' : 'win'} ${piecesPhrase(won)}`;
  const moves = listMoves(mine(lastTake));
  return lost.length ? `You could ${what} for ${piecesPhrase(lost)}: ${moves}.` : `You could ${what} with ${moves}.`;
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

/** How a mistake ends: the piece the user loses, when the line shows one, else what the line honestly shows. */
function mistakeOutcome(game: Game, fen: string, line: PlayedMove[]): string {
  const loss = materialLoss(fen, line, game.side);
  const opponent = opponentName(game);
  return loss ? `${opponent} wins your ${PIECES[loss.piece]} with ...${loss.san}` : `it gives ${opponent} the upper hand`;
}

function trapSentence(game: Game, turn: Turn, also: boolean): string {
  const line = playLine(turn.fen, turn.lines.mistake ?? (turn.mistakeMove ? [turn.mistakeMove] : []));
  const [bait] = line;
  if (!bait) return strongMove(turn);
  const outcome = mistakeOutcome(game, turn.fen, line);
  if (also) return `${bait.san} looks natural, but ${outcome}.`;
  const share = turn.human.find((h) => h.uci === bait.uci)?.share;
  const look = bait.captured ? 'looks free' : 'looks fine';
  const fall = share ? ` ${percent(share)}% of players rated ${game.level} fall for it.` : '';
  return `${bait.san} ${look}, but ${outcome}.${fall}`;
}

/** The step of a mistake line to explain, and how: the piece lost when the line shows it, else an honest verdict. */
export function mistakeVerdict(game: Game, fen: string, line: PlayedMove[]): { at: number; text: string } {
  const loss = materialLoss(fen, line, game.side);
  if (loss) return { at: loss.at, text: `That loses your ${PIECES[loss.piece]}.` };
  return { at: Math.min(1, line.length - 1), text: `That's a mistake: it gives ${opponentName(game)} the upper hand.` };
}

function quietSentence(): string {
  return 'Nothing special. Any normal move is fine here.';
}

const SENTENCES: Record<Kind, (game: Game, turn: Turn, also: boolean) => string> = {
  win: (game, turn) => winSentence(game.side, turn),
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

/** Reveal sentence when the user went wrong at a later move of the play-out. */
export function holdMissHeadline(game: Game, turnIndex: number, uci: string): string {
  const turn = game.turns[turnIndex];
  const line = playLine(turn.fen, [uci, ...(turn.refutations[uci] ?? [])]);
  const [played, reply] = line;
  const name = played?.san ?? uci;
  const opponent = opponentName(game);
  const best = turn.lines.best?.[0];
  const hold = best ? ` ${sanOf(turn.fen, best)} holds.` : '';
  const loss = materialLoss(turn.fen, line, game.side);
  if (loss) return `${name} loses your ${PIECES[loss.piece]}: ${opponent} plays ...${loss.san}.${hold}`;
  return `${name} is a mistake${reply ? `: ${opponent} plays ...${reply.san}.` : '.'}${hold}`;
}
