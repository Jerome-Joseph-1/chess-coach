import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Game, Kind, Turn } from '../content/types';
import { isBetween, kingOf, otherColor, passTurn, pieceOn, playLine, uciOf, type PieceAt } from './board';
import { tacticIn, wonInPlace, type Tactic, type TacticId } from './tactics';
import { capturedSquare } from './trade';

/** What a key position is about, from the user's side. Win themes share their ids with the tactics. */
export type ThemeId = TacticId | 'hanging-own' | 'threat-other' | 'bait' | 'quiet';

export type Role = 'attacker' | 'target' | 'pinned' | 'behind' | 'defender' | 'trapped' | 'mover';

/** A piece the idea is about, on the square it stands on when the tactic is played. */
export interface ThemePiece extends PieceAt {
  role: Role;
}

/** How a tempting move goes wrong. */
export type BaitKind = 'allows-mate' | 'grab' | 'walks-into' | 'opens-line' | 'unguards' | 'other';

export interface Bait {
  /** The tempting move, played from the turn's position. */
  move: Move;
  kind: BaitKind;
  /** The enemy piece whose line the tempting move opened, if it did. */
  opened: PieceAt | null;
}

export type QuietFocus = 'castle' | 'develop' | 'king' | 'improve';

export interface Quiet {
  focus: QuietFocus;
  /** Minor pieces still on their starting squares. */
  undeveloped: PieceAt[];
  /** The position was checked to be calm (label 'nothing'), not just left unlabelled. */
  calm: boolean;
}

export interface Theme {
  id: ThemeId;
  /** The tactic behind the theme: the user's for wins, the opponent's for threats and baits; null if none was found. */
  tactic: Tactic | null;
  /** For threat-other and bait: which pattern the opponent's tactic follows. */
  pattern?: TacticId;
  bait?: Bait;
  quiet?: Quiet;
  /** Pieces to highlight, with their part in the idea. */
  pieces: ThemePiece[];
  /** The moves that matter, in uci; they start from the turn's position (after the bait for a bait's reply). */
  moves: string[];
}

/** Classifies what the turn's position is about, using its stored lines. Turns that aren't critical are quiet. */
export function themeFor(game: Game, turnIndex: number): Theme {
  const turn = game.turns[turnIndex];
  if (turn.label !== 'critical') return quietTheme(turn, game.side);
  const has = (kind: Kind) => turn.kinds.includes(kind);
  const themes = [
    has('win') ? winTheme(turn, game.side) : null,
    has('defend') ? defendTheme(turn, game.side) : null,
    has('trap') ? baitTheme(turn, game.side) : null,
  ].filter((theme) => theme !== null);
  const fallback: Theme = { id: 'material-win', tactic: null, pieces: [], moves: turn.lines.best?.slice(0, 1) ?? [] };
  return themes.find((theme) => !isGeneral(theme)) ?? themes[0] ?? fallback;
}

/** A theme that names no pattern: a plain material win, or a threat or bait without a named tactic. */
function isGeneral(theme: Theme): boolean {
  return theme.id === 'material-win' || theme.pattern === 'material-win' || !theme.tactic;
}

function winTheme(turn: Turn, side: Color): Theme | null {
  const tactic = tacticIn(turn.fen, turn.lines.best ?? [], side);
  if (!tactic) return null;
  return { id: tactic.id, tactic, pieces: tacticPieces(tactic), moves: keyMoves(tactic) };
}

function defendTheme(turn: Turn, side: Color): Theme | null {
  const passed = passTurn(turn.fen);
  if (!passed || !turn.lines.threat?.length) return null;
  const tactic = tacticIn(passed, turn.lines.threat, otherColor(side));
  if (!tactic) return { id: 'threat-other', tactic: null, pieces: [], moves: turn.lines.threat.slice(0, 1) };
  const id = tactic.id === 'free-piece' ? 'hanging-own' : 'threat-other';
  return { id, tactic, pattern: tactic.id, pieces: tacticPieces(tactic), moves: keyMoves(tactic) };
}

function baitTheme(turn: Turn, side: Color): Theme | null {
  const line = turn.lines.mistake ?? (turn.mistakeMove ? [turn.mistakeMove] : []);
  const [move] = playLine(turn.fen, line.slice(0, 1));
  if (!move) return null;
  const tactic = tacticIn(move.after, line.slice(1), otherColor(side), [move]);
  const opened = tactic ? openedLine(move, tactic) : null;
  const bait: Bait = { move, kind: baitKind(move, tactic, opened), opened };
  const pieces: ThemePiece[] = [{ ...pieceOn(new Chess(move.after), move.to)!, role: 'mover' }];
  return {
    id: 'bait',
    tactic,
    pattern: tactic?.id,
    bait,
    pieces: tactic ? [...pieces, ...tacticPieces(tactic)] : pieces,
    moves: tactic ? keyMoves(tactic) : line.slice(1, 2),
  };
}

function baitKind(move: Move, tactic: Tactic | null, opened: PieceAt | null): BaitKind {
  if (tactic?.id === 'checkmate') return 'allows-mate';
  if (move.captured && tactic) return 'grab';
  if (!tactic?.won) return 'other';
  if (tactic.won.square === move.to) return 'walks-into';
  if (opened) return 'opens-line';
  const guarded = (fen: string, from: Square) => new Chess(fen).attackers(tactic.won!.square, move.color).includes(from);
  const unguards = guarded(move.before, move.from) && !guarded(move.after, move.to);
  // A tactic that is itself about guards says it better.
  return unguards && wonInPlace(tactic) && tactic.id !== 'remove-defender' ? 'unguards' : 'other';
}

/** The enemy slider that takes the won piece through the square the tempting move left. */
function openedLine(move: Move, tactic: Tactic): PieceAt | null {
  const capture = tactic.moves[tactic.key];
  const capturer = pieceOn(new Chess(capture.before), capture.from);
  if (!capturer || !['b', 'r', 'q'].includes(capturer.type)) return null;
  // The slider must already stand there when the tempting move is played.
  if (tactic.moves.slice(0, tactic.key).some((m) => m.to === capture.from)) return null;
  const target = capturedSquare(capture);
  const blocked = isBetween(capture.from, move.from, target) && !isBetween(capture.from, move.to, target);
  return blocked && tactic.won?.square === target ? capturer : null;
}

function keyMoves(tactic: Tactic): string[] {
  return tactic.moves.slice(0, tactic.key + 1).map(uciOf);
}

const role = (piece: PieceAt, r: Role): ThemePiece => ({ ...piece, role: r });

function tacticPieces(tactic: Tactic): ThemePiece[] {
  const won = tactic.won ? [role(tactic.won, 'target')] : [];
  switch (tactic.id) {
    case 'fork':
      return [role(tactic.forker, 'attacker'), ...tactic.targets.map((t) => role(t, 'target'))];
    case 'skewer':
      return [role(tactic.attacker, 'attacker'), role(tactic.front, 'target'), role(tactic.back, 'target')];
    case 'discovered-attack':
      return [role(tactic.mover, 'mover'), role(tactic.slider, 'attacker'), role(tactic.target, 'target'), ...won];
    case 'pin':
      return [role(tactic.pin.pinner, 'attacker'), role(tactic.pin.pinned, 'pinned'), role(tactic.pin.behind, 'behind'), ...won];
    case 'trapped-piece':
      return [role(tactic.trapped, 'trapped'), role(tactic.attacker, 'attacker')];
    case 'remove-defender':
      return [role(tactic.defender, 'defender'), role(tactic.guarded, 'target')];
    case 'checkmate': {
      const mate = tactic.moves[tactic.key];
      const after = new Chess(mate.after);
      return [role(pieceOn(after, mate.to)!, 'attacker'), role(kingOf(after, otherColor(tactic.side)), 'target')];
    }
    case 'mate-threat': {
      const before = new Chess(tactic.mate.before);
      return [role(pieceOn(before, tactic.mate.from)!, 'attacker'), role(kingOf(before, otherColor(tactic.side)), 'target')];
    }
    default: {
      const first = tactic.moves[tactic.at];
      return [role(pieceOn(new Chess(first.before), first.from)!, 'attacker'), ...won];
    }
  }
}

const HOME: Record<Color, [Square, PieceSymbol][]> = {
  w: [['b1', 'n'], ['g1', 'n'], ['c1', 'b'], ['f1', 'b']],
  b: [['b8', 'n'], ['g8', 'n'], ['c8', 'b'], ['f8', 'b']],
};

// Past the opening, pieces left at home are a choice rather than a lesson.
const OPENING_MOVES = 15;

function quietTheme(turn: Turn, side: Color): Theme {
  const quiet = { ...quietFocus(turn, side), calm: turn.label === 'nothing' };
  const chess = new Chess(turn.fen);
  const pieces = quiet.focus === 'castle' ? [kingOf(chess, side)] : quiet.undeveloped;
  return { id: 'quiet', tactic: null, quiet, pieces: pieces.map((p) => role(p, 'target')), moves: [] };
}

function quietFocus(turn: Turn, side: Color): Omit<Quiet, 'calm'> {
  const chess = new Chess(turn.fen);
  const undeveloped = HOME[side].flatMap(([square, type]) => {
    const piece = pieceOn(chess, square);
    return piece?.type === type && piece.color === side ? [piece] : [];
  });
  const pieces = chess.board().flat().filter((p) => p !== null);
  const queens = pieces.some((p) => p.type === 'q');
  if (chess.turn() === side && chess.moves({ verbose: true }).some((m) => m.isKingsideCastle() || m.isQueensideCastle())) {
    return { focus: 'castle', undeveloped };
  }
  if (undeveloped.length && queens && turn.moveNo <= OPENING_MOVES) return { focus: 'develop', undeveloped };
  const officers = (color: Color) => pieces.filter((p) => p.color === color && p.type !== 'p' && p.type !== 'k').length;
  if (!queens && officers('w') <= 2 && officers('b') <= 2) return { focus: 'king', undeveloped: [] };
  return { focus: 'improve', undeveloped: [] };
}
