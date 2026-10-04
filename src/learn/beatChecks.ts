// Checks any worked example's beats the way the tactic walkthrough's are checked: shape, words, squares, moves and claims.
import { Chess, type Color, type Square } from 'chess.js';
import { expect, it } from 'vitest';
import { withTurn } from '../game/position';
import { VALUE, exchangeGain, isLoose, playLine } from './board';
import type { Beat, Claim } from './walkthrough';

/** A worked example's beats, named for the failure messages. */
export interface Walk {
  id: string;
  beats: Beat[];
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');
const sameSet = (a: Square[], b: Square[]) => [...a].sort().join() === [...b].sort().join();

/** The squares strictly between two squares on one line, or null when they share none. */
function between(a: Square, b: Square): Square[] | null {
  const [af, ar, bf, br] = [a.charCodeAt(0), Number(a[1]), b.charCodeAt(0), Number(b[1])];
  const [df, dr] = [Math.sign(bf - af), Math.sign(br - ar)];
  if (af !== bf && ar !== br && Math.abs(bf - af) !== Math.abs(br - ar)) return null;
  const squares: Square[] = [];
  for (let f = af + df, r = ar + dr; f !== bf || r !== br; f += df, r += dr) squares.push(`${String.fromCharCode(f)}${r}` as Square);
  return squares;
}

function around(square: Square): Square[] {
  const [file, rank] = [square.charCodeAt(0), Number(square[1])];
  return [-1, 0, 1].flatMap((df) =>
    [-1, 0, 1].flatMap((dr) => {
      const [f, r] = [file + df, rank + dr];
      return (df || dr) && f >= 97 && f <= 104 && r >= 1 && r <= 8 ? [`${String.fromCharCode(f)}${r}` as Square] : [];
    }),
  );
}

/** Checks a claim straight on the board, without the walkthrough's own helpers. */
export function holds(fen: string, claim: Claim): boolean {
  const board = new Chess(fen);
  const colorOf = (square: Square) => board.get(square)!.color;
  const empty = (squares: Square[] | null) => squares !== null && squares.every((s) => !board.get(s));
  switch (claim.claim) {
    case 'undefended':
      return board.attackers(claim.square, colorOf(claim.square)).length === 0;
    case 'hangs':
      return isLoose(fen, claim.square);
    case 'safe':
      return Boolean(board.get(claim.square)) && !isLoose(fen, claim.square);
    case 'mates': {
      const [move] = playLine(fen, [claim.move]);
      return move !== undefined && new Chess(move.after).isCheckmate();
    }
    case 'attackers':
      return sameSet(board.attackers(claim.square, other(colorOf(claim.square))), claim.squares);
    case 'guards':
      return sameSet(board.attackers(claim.square, colorOf(claim.square)), claim.squares);
    case 'attacks':
      return claim.squares.every((s) => board.attackers(s, colorOf(claim.square)).includes(claim.square));
    case 'escape-squares': {
      const color = colorOf(claim.square);
      const moves = new Chess(withTurn(fen, color)).moves({ square: claim.square, verbose: true });
      const lost = moves.filter((m) => exchangeGain(new Chess(m.after), m.to) > (m.captured ? VALUE[m.captured] : 0));
      return sameSet([...new Set(moves.map((m) => m.to))], claim.squares) && sameSet([...new Set(lost.map((m) => m.to))], claim.covered);
    }
    case 'boxed': {
      const color = colorOf(claim.square);
      const near = around(claim.square);
      const blocked = near.filter((s) => board.get(s)?.color === color);
      const covered = near.filter((s) => !blocked.includes(s) && board.attackers(s, other(color)).length > 0);
      const free = near.filter((s) => !blocked.includes(s) && !covered.includes(s));
      return sameSet(blocked, claim.blocked) && sameSet(covered, claim.covered) && sameSet(free, claim.free);
    }
    case 'in-line':
      return empty(between(...claim.squares));
    case 'blocks': {
      const line = between(claim.from, claim.to);
      return line !== null && line.includes(claim.square) && empty(line.filter((s) => s !== claim.square));
    }
    case 'backs': {
      const line = between(claim.square, claim.target);
      const own = colorOf(claim.square) === colorOf(claim.front);
      return own && line !== null && line.includes(claim.front) && empty(line.filter((s) => s !== claim.front));
    }
    case 'pin': {
      const { pinner, square, behind } = claim;
      const aligned = between(pinner, behind)?.includes(square) ?? false;
      const slides = board.attackers(square, colorOf(pinner)).includes(pinner);
      return aligned && slides && empty(between(square, behind)) && colorOf(behind) === colorOf(square) && colorOf(pinner) !== colorOf(square);
    }
  }
}

/** The position a beat's move starts from: the beat before it, or after the move that beat asked for. */
function startOf(beat: Beat, previous: Beat): string | undefined {
  const asked = previous.answer ? playLine(previous.fen, [previous.answer])[0]?.after : undefined;
  return [previous.fen, asked].find((fen) => fen && playLine(fen, [beat.move!])[0]?.after === beat.fen);
}

/** The checks every worked example must pass, as tests; `minClaims` is how many board claims they must check at least. */
export function checkBeats(all: Walk[], minClaims = 0): void {
  it('steps through a few beats and ends on the line', () => {
    for (const { id, beats } of all) {
      expect(beats.length, id).toBeGreaterThanOrEqual(1);
      expect(beats.length, id).toBeLessThanOrEqual(5);
      expect(beats.at(-1)!.line, id).toBeDefined();
      expect(beats.slice(0, -1).every((b) => b.line === undefined), id).toBe(true);
      expect(beats.filter((b) => b.ask).length, id).toBeLessThanOrEqual(1);
    }
  });

  it('speaks in clean, short sentences', () => {
    for (const { id, beats } of all) {
      for (const text of beats.flatMap((b) => [b.text, b.ask ?? 'Ask.'])) {
        expect(text, id).toMatch(/^([A-Z]|[a-h][1-8x])/);
        expect(text, id).toMatch(/[.]$/);
        expect(text, id).not.toMatch(/undefined|null|NaN|\s{2}|\s[,.]/);
      }
      for (const beat of beats.slice(0, -1)) {
        expect(beat.text.split(' ').length, id).toBeLessThanOrEqual(28);
        // A mate is said in words, not with the sign.
        expect(beat.text, id).not.toMatch(/#/);
      }
    }
  });

  it('marks and draws on real squares only', () => {
    for (const { id, beats } of all) {
      for (const beat of beats) {
        const squares = [...beat.marks.map((m) => m.square), ...beat.arrows.flatMap((a) => [a.from, a.to])];
        for (const square of squares) expect(square, id).toMatch(/^[a-h][1-8]$/);
        expect(new Set(beat.marks.map((m) => m.square)).size, id).toBe(beat.marks.length);
      }
    }
  });

  it('asks only for legal moves, and slides each beat in from the one before', () => {
    for (const { id, beats } of all) {
      beats.forEach((beat, i) => {
        if (beat.ask) expect(playLine(beat.fen, [beat.answer!]), id).toHaveLength(1);
        if (beat.move) expect(startOf(beat, beats[i - 1]), `${id} beat ${i}`).toBeDefined();
      });
      const last = beats.at(-1)!;
      expect(playLine(last.fen, last.line!), id).toHaveLength(last.line!.length);
    }
  });

  it('gives concrete reasons in plain words', () => {
    const vague = /leaves nothing of yours hanging|^Instead, play |^The best answer is |^\S+ (guards it|moves it (to safety|away)|takes the attacker)\.$|\bhangs\b|uncovers|opens the line|^O-O|the king is behind it/;
    for (const { id, beats } of all) for (const beat of beats) expect(beat.text, id).not.toMatch(vague);
  });

  it('says only what is true on the board', () => {
    let checked = 0;
    for (const { id, beats } of all) {
      for (const beat of beats) {
        for (const claim of beat.claims ?? []) {
          expect(holds(claim.fen ?? beat.fen, claim), `${id}: ${JSON.stringify(claim)}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(minClaims);
  });
}
