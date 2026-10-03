// Builds src/opening/names.json from the Lichess openings list (CC0), keeping the Italian and Caro-Kann lines.
// Usage: npx vite-node scripts/build-openings.ts
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { epd } from '../src/opening/epd';

const SOURCE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const FILES = ['a', 'b', 'c', 'd', 'e'];
const ROOTS = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  ['e4', 'c6'],
];
const OUT = 'src/opening/names.json';
// Deeper names are rarely reached by the games and would double the file.
const MAX_PLIES = 18;

interface Line {
  eco: string;
  name: string;
  sans: string[];
}

function parseTsv(text: string): Line[] {
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((row) => {
      const [eco, name, pgn] = row.split('\t');
      return { eco, name, sans: pgn.split(' ').filter((token) => !/^\d+\.$/.test(token)) };
    });
}

/** The EPD of every position along the line, the start excluded. */
function positions(sans: string[]): string[] {
  const chess = new Chess();
  return sans.map((san) => {
    chess.move(san);
    return epd(chess.fen());
  });
}

const startsWith = (sans: string[], prefix: string[]) => prefix.every((san, i) => sans[i] === san);

/** On the way to a root, or past it. */
function onRootPath(sans: string[]): boolean {
  return ROOTS.some((root) => startsWith(sans, root) || startsWith(root, sans));
}

/** The positions of a line from its root on; none for a line that stops before its root. */
function familyPositions(sans: string[]): string[] {
  const root = ROOTS.find((r) => startsWith(sans, r));
  return root ? positions(sans).slice(root.length - 1) : [];
}

async function download(): Promise<Line[]> {
  const texts = await Promise.all(
    FILES.map(async (file) => {
      const response = await fetch(`${SOURCE}/${file}.tsv`);
      if (!response.ok) throw new Error(`${file}.tsv: HTTP ${response.status}`);
      return response.text();
    }),
  );
  return texts.flatMap(parseTsv);
}

function build(lines: Line[]): Record<string, Line> {
  const named: Record<string, Line> = {};
  const direct = lines.filter((line) => onRootPath(line.sans));
  const family = new Set(direct.flatMap((line) => familyPositions(line.sans)));
  for (const line of direct) named[positions(line.sans).at(-1)!] = line;
  // Other move orders that pass through a family position transpose into it; the family's own name wins.
  for (const line of lines) {
    if (onRootPath(line.sans)) continue;
    const path = positions(line.sans);
    const final = path.at(-1)!;
    if (path.some((position) => family.has(position)) && !named[final]) named[final] = line;
  }
  return named;
}

/** Grouped by the name before the colon: { "Italian Game": { epd: "C55 Two Knights Defense" } }. */
function compact(named: Record<string, Line>): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {};
  for (const [position, { eco, name, sans }] of Object.entries(named)) {
    if (sans.length > MAX_PLIES) continue;
    const cut = name.indexOf(': ');
    const group = cut < 0 ? name : name.slice(0, cut);
    groups[group] ??= {};
    groups[group][position] = cut < 0 ? eco : `${eco} ${name.slice(cut + 2)}`;
  }
  return groups;
}

const groups = compact(build(await download()));
const json = JSON.stringify(groups);
writeFileSync(OUT, `${json}\n`);
const count = Object.values(groups).reduce((sum, group) => sum + Object.keys(group).length, 0);
console.log(`${count} positions, ${(json.length / 1024).toFixed(1)} KB -> ${OUT}`);
