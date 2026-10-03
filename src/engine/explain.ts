import type { Side } from '../content/types';
import { capturesIn } from '../pause/captures';
import { piecesPhrase } from '../pause/copy';
import { materialChange, pieceValue } from '../pause/material';
import { playLine, sanOf, type PlayedMove } from '../pause/position';
import { numberedSan } from '../pause/sequence';
import type { Line } from './engine';
import { isMate, isMated, mates, pawns, scoreValue, signedPawns } from './score';

/** Captures are looked for in this many first moves of a line. */
const CAPTURE_WINDOW = 8;
/** Moves closer than this, in centipawns, are as good as each other. */
const SAME_CP = 30;
/** A material loss is only named when the engine also rates the move this much worse. */
const NAMED_LOSS_CP = 50;
const MUCH_WORSE_CP = 150;
const CONTINUATION_MOVES = 3;

export const sideToMove = (fen: string): Side => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

const mateIn = (line: Line): number => (isMate(line.score) ? Math.abs(line.score.mate) : 0);

/** The start of a line up to where its captures stop: two quiet moves in a row, or the window's end and any recaptures. */
export function untilCapturesStop(line: PlayedMove[]): PlayedMove[] {
  let end = 0;
  let quiet = 0;
  for (let i = 0; i < Math.min(line.length, CAPTURE_WINDOW) && quiet < 2; i++) {
    if (line[i].captured) {
      end = i + 1;
      quiet = 0;
    } else if (end > 0) {
      quiet += 1;
    }
  }
  while (line[end]?.captured) end += 1;
  return line.slice(0, end);
}

interface Outcome {
  /** Material the side to move has gained, in pawns, once the captures stop. */
  gain: number;
  moves: PlayedMove[];
}

function outcome(fen: string, line: Line): Outcome {
  const moves = untilCapturesStop(playLine(fen, line.pv));
  return { gain: materialChange(fen, moves.at(-1)?.after ?? fen, sideToMove(fen)), moves };
}

function lossPhrase(lost: string[], won: string[]): string {
  if (lost.length === 1 && lost[0] === 'r' && won.length === 1 && (won[0] === 'n' || won[0] === 'b')) return 'loses the exchange';
  if (lost.length === 0) return 'loses material';
  if (won.length === 0 && lost.every((type) => type === 'p')) return `drops ${piecesPhrase(lost)}`;
  return won.length ? `loses ${piecesPhrase(lost)} for ${piecesPhrase(won)}` : `loses ${piecesPhrase(lost)}`;
}

interface Shortfall {
  /** "loses the exchange", "drops a pawn", "doesn't win a knight". */
  phrase: string;
  /** The opponent's capture that takes the biggest piece lost. */
  key: PlayedMove | null;
  /** Captures after the move itself, up to where they stop. */
  captures: PlayedMove[];
}

/** `types` with one of each of `removed` taken out. */
function without(types: string[], removed: string[]): string[] {
  const rest = [...types];
  for (const type of removed) {
    const at = rest.indexOf(type);
    if (at >= 0) rest.splice(at, 1);
  }
  return rest;
}

/** What `alt` gives up in material compared with `ref`, read from the two lines; null when it gives up none. */
export function shortfall(fen: string, ref: Line, alt: Line): Shortfall | null {
  const side = sideToMove(fen);
  const mine = outcome(fen, alt);
  const best = outcome(fen, ref);
  if (best.gain - mine.gain < 1) return null;
  const { won, lost } = capturesIn(mine.moves, side);
  const missed = best.gain > 0 ? without(capturesIn(best.moves, side).won, won) : [];
  const losing = mine.gain < 0;
  const phrases = [missed.length ? `doesn't win ${piecesPhrase(missed)}` : '', losing ? lossPhrase(lost, won) : ''].filter(Boolean);
  const [biggest] = [...lost].sort((a, b) => pieceValue(b) - pieceValue(a));
  return {
    phrase: phrases.join(' and ') || 'wins less material',
    key: losing ? (mine.moves.find((move) => move.side !== side && move.captured === biggest) ?? null) : null,
    captures: losing ? mine.moves.slice(1).filter((move) => move.captured) : [],
  };
}

/** Centipawns `alt` is behind `ref`, for the side to move; negative when it is ahead. */
function behind(ref: Line, alt: Line): number {
  return scoreValue(ref.score) - scoreValue(alt.score);
}

/** Why `alt` is worse than `ref`, in a few words, or null when there is nothing honest to add. */
export function shortReason(fen: string, ref: Line, alt: Line): string | null {
  if (isMated(alt.score)) return `allows mate in ${mateIn(alt)}`;
  if (mates(ref.score) && !mates(alt.score)) return `misses mate in ${mateIn(ref)}`;
  const gap = behind(ref, alt);
  if (isMate(alt.score) || gap < SAME_CP) return null;
  const loss = gap >= NAMED_LOSS_CP ? shortfall(fen, ref, alt) : null;
  if (loss) return loss.key ? `${loss.phrase}: ${loss.key.san}` : loss.phrase;
  return gap >= MUCH_WORSE_CP ? 'much worse position' : 'slightly worse position';
}

export interface Row {
  line: Line;
  san: string;
  /** "Best", "Played", "−1.8", "mate in 3"; empty when the detail says it all. */
  score: string;
  /** The reason it is worse, else how the line goes on. */
  detail: string;
  /** The move every other row is compared with. */
  isRef: boolean;
}

function continuation(fen: string, line: Line): string {
  const sans = playLine(fen, line.pv.slice(0, CONTINUATION_MOVES + 1))
    .slice(1)
    .map((move) => move.san);
  return sans.length ? `then ${sans.join(' ')}` : '';
}

function scoreText(line: Line, ref: Line, top: Line): string {
  if (mates(line.score)) return `mate in ${mateIn(line)}`;
  if (line === ref) return line.pv[0] === top.pv[0] || behind(top, line) <= 0 ? 'Best' : 'Played';
  if (isMate(line.score) || isMate(ref.score)) return '';
  return signedPawns(-behind(ref, line));
}

/** One row per line, the reference first: scores and reasons are measured against it, from the mover's side. */
export function rowsFor(fen: string, ref: Line, others: Line[], top: Line): Row[] {
  return [ref, ...others].map((line) => ({
    line,
    san: sanOf(fen, line.pv[0]),
    score: scoreText(line, ref, top),
    detail: (line === ref ? null : shortReason(fen, ref, line)) ?? continuation(fen, line),
    isRef: line === ref,
  }));
}

const listSans = (moves: PlayedMove[]) => moves.map((move) => move.san).join(' ');

/** One sentence on a move the user tried, compared with `ref`, the line's move or the engine's best there. */
export function verdict(fen: string, ref: Line, mine: Line, refIsPlayed: boolean): string {
  const san = sanOf(fen, mine.pv[0]);
  const move = numberedSan(fen, san);
  const refSan = sanOf(fen, ref.pv[0]);
  if (mine.pv[0] === ref.pv[0]) return refIsPlayed ? `${move} is the move in the line.` : `${move} is the engine's choice.`;
  if (san.endsWith('#')) return `${move} is checkmate.`;
  if (mates(mine.score)) return `${move} mates in ${mateIn(mine)}.`;
  if (isMated(mine.score)) return `${move} allows mate in ${mateIn(mine)}.`;
  if (mates(ref.score)) return `${move} misses mate in ${mateIn(ref)} with ${refSan}.`;
  const gap = behind(ref, mine);
  if (gap <= -SAME_CP) return `The engine rates ${move} ${pawns(gap)} better than ${refSan}.`;
  if (gap < SAME_CP) return `${move} is about as good as ${refSan}.`;
  const worse = `${move} is ${pawns(gap)} worse than ${refSan}`;
  const loss = gap >= NAMED_LOSS_CP ? shortfall(fen, ref, mine) : null;
  if (!loss) return `${worse}.`;
  return loss.captures.length ? `${worse}: it ${loss.phrase} after ${listSans(loss.captures)}.` : `${worse}: it ${loss.phrase}.`;
}

/** What the engine makes of the line's move at this position, said plainly even when it disagrees. */
export function playedNote(fen: string, played: Line, top: Line): string {
  const san = sanOf(fen, played.pv[0]);
  const topSan = sanOf(fen, top.pv[0]);
  const gap = behind(top, played);
  if (played.pv[0] === top.pv[0] || gap <= 0) return `The engine picks ${san} here too.`;
  if (mates(top.score) && !mates(played.score)) return `The engine finds mate in ${mateIn(top)} with ${topSan} here.`;
  if (gap < SAME_CP) return `The engine slightly prefers ${topSan} here; both are fine.`;
  return `The engine prefers ${topSan} here, by ${pawns(gap)}.`;
}
