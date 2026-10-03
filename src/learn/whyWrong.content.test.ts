// Opt-in: runs over a whole content folder. CONTENT_DIR=<content-dir> npx vitest run src/learn/whyWrong.content.test.ts
import { describe, expect, it } from 'vitest';
import type { Game, Side } from '../content/types';
import { materialChange } from '../pause/material';
import { playLine as playedLine } from '../pause/position';
import { playLine } from './board';
import { whyWrong, type WrongMove } from './whyWrong';

const CONTENT_DIR: string | undefined = import.meta.env.CONTENT_DIR;

interface Fs {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync(path: string): { isDirectory(): boolean };
}

async function loadGames(dir: string): Promise<Game[]> {
  // Kept out of the app's types: node only runs here.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const sets = fs.readdirSync(dir).filter((set) => fs.statSync(`${dir}/${set}`).isDirectory());
  return sets.flatMap((set) =>
    fs.readdirSync(`${dir}/${set}/games`).map((file) => JSON.parse(fs.readFileSync(`${dir}/${set}/games/${file}`, 'utf8')) as Game),
  );
}

/** Whether the text names `san` as a move: not as a square ("your pawn on e4"), nor as the start of a longer move ("Bxf2+"). */
function namesMove(text: string, san: string): boolean {
  const escaped = san.replace(/[+#=]/g, (c) => `\\${c}`);
  return new RegExp(`(?<!on |[\\w-])${escaped}(?![\\w+#=-])`).test(text);
}

const PIECES: Record<string, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };

/** The piece a text says the user loses: "wins your rook", "taking your knight on g4", "traps your bishop on b5". */
function claimedPiece(text: string): string | null {
  const found = text.match(/\b(?:wins|taking|traps) (?:your |a |the |two |three |four )?(pawn|knight|bishop|rook|queen)/);
  return found ? PIECES[found[1]] : null;
}

/** The line takes a piece of this type from the user and leaves the user's material lower. */
function losesPiece(fen: string, line: string[], side: Side, type: string): boolean {
  const moves = playedLine(fen, line);
  // A promoted piece taken back was only a pawn.
  const promoted = new Set(moves.filter((m) => m.side === side && m.uci.length === 5).map((m) => m.uci.slice(2, 4)));
  const taken = moves.some((m) => m.side !== side && (promoted.has(m.uci.slice(2, 4)) ? 'p' : m.captured) === type);
  return taken && materialChange(fen, moves.at(-1)!.after, side) < 0;
}

describe.skipIf(!CONTENT_DIR)('whyWrong over a whole content folder', () => {
  it('never gives the answer away, and every blunder names a piece its line really wins', async () => {
    const games = await loadGames(CONTENT_DIR!);
    let checked = 0;
    for (const game of games) {
      game.turns.forEach((turn, i) => {
        if (turn.label !== 'critical') return;
        const best = playLine(turn.fen, turn.lines.best ?? [])[0]?.san;
        const answers = [best, game.moves[turn.ply]].filter((san): san is string => Boolean(san));
        for (const uci of Object.keys(turn.grades)) {
          const move = playLine(turn.fen, [uci])[0];
          if (!move || answers.includes(move.san)) continue;
          const lines = [[uci, ...(turn.refutations[uci] ?? [])], uci === turn.mistakeMove ? (turn.lines.mistake ?? []) : []];
          // The opponent may play a move written the same way, which names nothing of the user's.
          const played = lines.flatMap((line) => playLine(turn.fen, line));
          const theirs = new Set(played.filter((m) => m.color !== game.side).flatMap((m) => [m.san, m.san.replace(/[+#]$/, '')]));
          const first = whyWrong(game, i, uci, 0);
          const told: WrongMove[] = first.kind === 'ignores-threat' ? [first, whyWrong(game, i, uci, 2)] : [first];
          for (const why of told) {
            const where = `${game.id} turn ${i} ${move.san}: ${why.text}`;
            for (const san of answers) if (!theirs.has(san)) expect(namesMove(why.text, san), where).toBe(false);
            if (why.kind !== 'blunder') continue;
            const piece = claimedPiece(why.text);
            if (piece) expect(losesPiece(turn.fen, [uci, ...turn.refutations[uci]], game.side, piece), where).toBe(true);
            else expect(why.text, where).toMatch(/checkmate|forced mate|wins material/);
          }
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  }, 3_600_000);
});
