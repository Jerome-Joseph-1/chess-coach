// Opt-in: runs over a whole content folder. CONTENT_DIR=<content-dir> npx vitest run src/learn/whyWrong.content.test.ts
import { describe, expect, it } from 'vitest';
import type { Game, Side, Turn } from '../content/types';
import { materialChange } from '../pause/material';
import { moveBefore, playLine as playedLine } from '../pause/position';
import { playLine } from './board';
import { settled } from './loss';
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

/** The pieces a text says the user loses: "wins your rook", "takes the queen", "can take your knight on g4", "traps your bishop". */
function claimedPieces(text: string): string[] {
  const claims = text.matchAll(/\b(?:wins|takes|taking|take|traps) (?:your |a |the )?(pawn|knight|bishop|rook|queen)/g);
  return [...claims].map((claim) => PIECES[claim[1]]);
}

/** The opponent takes a piece of this type in the line; a promoted piece taken back was only a pawn. */
function takes(fen: string, line: string[], side: Side, type: string): boolean {
  const moves = playedLine(fen, line);
  const promoted = new Set(moves.filter((m) => m.side === side && m.uci.length === 5).map((m) => m.uci.slice(2, 4)));
  return moves.some((m) => m.side !== side && (promoted.has(m.uci.slice(2, 4)) ? 'p' : m.captured) === type);
}

/** The line the coach reads for a wrong move: the common mistake's own line or the move's refutation, played to the end of its exchange. */
function punishingLine(turn: Turn, uci: string): string[] {
  const [move] = playLine(turn.fen, [uci]);
  const mistake = uci === turn.mistakeMove && turn.lines.mistake?.[0] === uci;
  const stored = mistake ? turn.lines.mistake!.slice(1) : (turn.refutations[uci] ?? []);
  return [uci, ...settled(move.after, stored)];
}

describe.skipIf(!CONTENT_DIR)('whyWrong over a whole content folder', () => {
  it('never gives the answer away, and every piece it says is lost really goes', async () => {
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
          const line = punishingLine(turn, uci);
          // The opponent may play a move written the same way, which names nothing of the user's.
          const played = playLine(turn.fen, line);
          const theirs = new Set(played.filter((m) => m.color !== game.side).flatMap((m) => [m.san, m.san.replace(/[+#]$/, '')]));
          const told: WrongMove[] = [0, 1, 2].map((hint) => whyWrong(game, i, uci, hint as 0 | 1 | 2));
          for (const why of told) {
            const where = `${game.id} turn ${i} ${move.san}: ${why.text}`;
            for (const san of answers) if (!theirs.has(san)) expect(namesMove(why.text, san), where).toBe(false);
            expect(why.text, where).not.toMatch(/\bsafe\b|line that follows/);
            const down = why.text.match(/you stay a (\w+) down/);
            if (down) expect(moveBefore(game, turn.ply)?.captured, where).toBe(PIECES[down[1]]);
            const shown = why.reply ? [uci, why.reply] : [];
            for (const piece of claimedPieces(why.text.replace(/you stay a \w+ down/, ''))) {
              expect(takes(turn.fen, line, game.side, piece) || takes(turn.fen, shown, game.side, piece), where).toBe(true);
            }
            if (why.kind === 'blunder' && !down && !/checkmate|forced mate/.test(why.text)) {
              expect(materialChange(turn.fen, playedLine(turn.fen, line).at(-1)!.after, game.side), where).toBeLessThan(0);
            }
          }
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  }, 3_600_000);
});
