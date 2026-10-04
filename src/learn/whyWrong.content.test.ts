// Opt-in: runs over a whole content folder. CONTENT_DIR=<content-dir> npx vitest run src/learn/whyWrong.content.test.ts
import { describe, expect, it } from 'vitest';
import type { Game, Side, Turn } from '../content/types';
import { materialChange } from '../pause/material';
import { moveBefore, playLine as playedLine } from '../pause/position';
import { playLine } from './board';
import { nothingHangs, settled } from './loss';
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

const PIECE = '(pawn|knight|bishop|rook|queen)s?';

/**
 * The pieces a text says the user loses: "takes your rook", "can take your knight on g4", "your queen can't escape",
 * and each piece of "You lose a rook and a pawn" or "costs you a rook". What the user takes is no claim.
 */
function claimedPieces(text: string): string[] {
  const said = text.replace(/You take the \w+ on \w\d|Taking the \w+ on \w\d/g, '');
  const takes = [...said.matchAll(new RegExp(`\\b(?:wins|takes|taking|take|traps) (?:your |a |the )?${PIECE}`, 'g'))].map((m) => m[1]);
  const trapped = [...said.matchAll(new RegExp(`your ${PIECE}(?: on \\w\\d)? can't escape`, 'g'))].map((m) => m[1]);
  const lost = [...said.matchAll(/(?:[Yy]ou lose|costs you) (.+?)(?: and only get| for |, |\.)/g)].flatMap((m) =>
    [...m[1].matchAll(new RegExp(`\\b(?:your|a|two|three|four) ${PIECE}`, 'g'))].map((p) => p[1]),
  );
  return [...takes, ...trapped, ...lost].map((piece) => PIECES[piece]);
}

const NOTATION = /\b[KQRBN][a-h1-8]?x?[a-h][1-8]|\b[a-h]x[a-h][1-8]|O-O/;
const sentencesOf = (text: string) => text.split(/(?<=[.?])\s+(?=[A-Z])/);

/** The opponent takes a piece of this type in the line; a piece promoted before it is taken back was only a pawn. */
function takes(moves: ReturnType<typeof playedLine>, side: Side, type: string): boolean {
  const promoted = new Set<string>();
  return moves.some((m) => {
    if (m.side === side && m.uci.length === 5) promoted.add(m.uci.slice(2, 4));
    return m.side !== side && (promoted.has(m.uci.slice(2, 4)) ? 'p' : m.captured) === type;
  });
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
          const lineMoves = playedLine(turn.fen, line);
          const told: WrongMove[] = [0, 1, 2].map((hint) => whyWrong(game, i, uci, hint as 0 | 1 | 2));
          for (const why of told) {
            const where = `${game.id} turn ${i} ${move.san}: ${why.text}`;
            for (const san of answers) if (!theirs.has(san)) expect(namesMove(why.text, san), where).toBe(false);
            expect(why.text, where).not.toMatch(/line that follows|the exchange|stronger move here|natural move|trade on|\bpin|every way/);
            // Plain words for a beginner: no notation, at most two short sentences.
            expect(why.text, where).not.toMatch(NOTATION);
            expect(sentencesOf(why.text).length, where).toBeLessThanOrEqual(2);
            for (const sentence of sentencesOf(why.text)) expect(sentence.split(/\s+/).length, where).toBeLessThanOrEqual(26);
            if (/That's safe/.test(why.text)) expect(nothingHangs(move), where).toBe(true);
            const down = why.text.match(/you are still a (\w+) down/);
            if (down) expect(moveBefore(game, turn.ply)?.captured, where).toBe(PIECES[down[1]]);
            // The reply on the board, with the exchange it starts: the line a giveaway in the stored one is cut back to.
            const shown = playedLine(turn.fen, why.reply ? [uci, ...settled(move.after, [why.reply])] : []);
            for (const piece of claimedPieces(why.text.replace(/you are still a \w+ down/, ''))) {
              expect(takes(lineMoves, game.side, piece) || takes(shown, game.side, piece), where).toBe(true);
            }
            if (why.kind === 'blunder' && !down && !/checkmate|forced mate/.test(why.text)) {
              expect(materialChange(turn.fen, lineMoves.at(-1)!.after, game.side), where).toBeLessThan(0);
            }
          }
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  }, 3_600_000);
});
