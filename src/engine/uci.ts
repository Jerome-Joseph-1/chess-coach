import type { Score } from './score';

/** One line from an `info` message. */
export interface Info {
  multipv: number;
  depth: number;
  score: Score;
  pv: string[];
  /** The score is only a bound, from a search that had not settled on it. */
  bound: boolean;
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function readInt(token: string | undefined): number | null {
  const value = Number(token);
  return token !== undefined && Number.isInteger(value) ? value : null;
}

/** Reads an `info … multipv … score cp|mate … pv …` message. Messages without a line, or with anything unreadable, give null. */
export function parseInfo(message: string): Info | null {
  const tokens = message.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  let depth: number | null = null;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  let bound = false;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'string') return null;
    if (token === 'depth') depth = readInt(tokens[++i]);
    else if (token === 'multipv') multipv = readInt(tokens[++i]) ?? multipv;
    else if (token === 'lowerbound' || token === 'upperbound') bound = true;
    else if (token === 'score') {
      const kind = tokens[++i];
      const value = readInt(tokens[++i]);
      if (value === null || (kind !== 'cp' && kind !== 'mate')) return null;
      score = kind === 'cp' ? { cp: value } : { mate: value };
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    }
  }
  if (depth === null || !score || pv.length === 0 || !pv.every((move) => UCI_MOVE.test(move))) return null;
  return { multipv, depth, score, pv, bound };
}

/**
 * Gathers a search's lines. The engine prints all of them, first to last, each time it finishes a depth or
 * stops; lines from different prints can repeat a move, so the result is the last whole print without bounds.
 */
export class LineCollector {
  private current: Info[] = [];
  private settled: Info[] = [];

  add(info: Info): void {
    if (info.multipv === 1) this.close();
    this.current.push(info);
  }

  lines(): Info[] {
    this.close();
    return this.settled;
  }

  private close(): void {
    const print = this.current;
    this.current = [];
    if (print.length && (!print.some((info) => info.bound) || !this.settled.length)) this.settled = print;
  }
}

/** The move of a `bestmove` message, null for `bestmove (none)`, undefined for any other message. */
export function parseBestMove(message: string): string | null | undefined {
  const [head, move] = message.trim().split(/\s+/);
  if (head !== 'bestmove') return undefined;
  return move && UCI_MOVE.test(move) ? move : null;
}
