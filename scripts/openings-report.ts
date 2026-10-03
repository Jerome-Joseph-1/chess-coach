// Measures how much of the games' openings the coach's notes cover, and lists the positions still without one.
// Usage: npx vite-node scripts/openings-report.ts <content-dir> <report.md>   (TOP=n lists more uncovered positions)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import type { OpeningId, SetIndex } from '../src/content/types';
import { epd } from '../src/opening/epd';
import { nameAt, noteFor, variationAt } from '../src/opening';

const [contentDir, reportPath] = process.argv.slice(2);
if (!contentDir || !reportPath) {
  console.error('Usage: npx vite-node scripts/openings-report.ts <content-dir> <report.md>');
  process.exit(1);
}
const MAX_PLIES = 16;
const TOP = Number(process.env.TOP ?? 60);

interface Ply {
  position: string;
  sans: string[];
  /** The id of the note shown on this position. */
  note: string | null;
  /** The variation the game is in by now, if it has reached one. */
  variation: string | null;
}

interface PositionRow {
  count: number;
  sans: string[];
  note: string | null;
}

function loadSets(dir: string): SetIndex[] {
  return readdirSync(dir)
    .filter((set) => statSync(join(dir, set)).isDirectory())
    .sort()
    .map((set) => JSON.parse(readFileSync(join(dir, set, 'index.json'), 'utf8')) as SetIndex);
}

function walk(moves: string[]): Ply[] {
  const chess = new Chess();
  let variation: string | null = null;
  return moves.slice(0, MAX_PLIES).map((san, i) => {
    chess.move(san);
    const fen = chess.fen();
    variation = variationAt(fen)?.name ?? variation;
    return { position: epd(fen), sans: moves.slice(0, i + 1), note: noteFor(fen, san)?.id ?? null, variation };
  });
}

const percent = (part: number, whole: number) => `${whole ? ((100 * part) / whole).toFixed(1) : '0.0'}%`;

/** "1.e4 c6 2.d4 d5" */
function numbered(sans: string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ');
}

function section(opening: OpeningId, games: string[][]): string {
  const plies = games.flatMap(walk);
  const positions = new Map<string, PositionRow>();
  for (const ply of plies) {
    const row = positions.get(ply.position) ?? { count: 0, sans: ply.sans, note: null };
    row.count++;
    row.note ??= ply.note;
    positions.set(ply.position, row);
  }
  const noted = plies.filter((p) => p.note).length;
  const covered = plies.filter((p) => p.note || p.variation).length;
  const families = new Map<string, number>();
  for (const game of games) {
    const last = walk(game).at(-1)?.variation ?? '(none)';
    families.set(last, (families.get(last) ?? 0) + 1);
  }
  const rows = [...positions.values()].sort((a, b) => b.count - a.count);
  const uncovered = rows.filter((r) => !r.note).slice(0, TOP);
  return [
    `## ${opening} (${games.length} games, ${plies.length} plies up to move ${MAX_PLIES / 2})`,
    '',
    `- Plies are counted from move 1, the set's fixed first moves included.`,
    `- Plies with a note: ${noted} (${percent(noted, plies.length)})`,
    `- Plies with a note or inside a variation with a plan: ${covered} (${percent(covered, plies.length)})`,
    `- Positions: ${positions.size}, with a note: ${rows.filter((r) => r.note).length}`,
    '',
    '### Variations reached by move 8',
    '',
    '| variation | games |',
    '|---|---:|',
    ...[...families].sort((a, b) => b[1] - a[1]).map(([name, count]) => `| ${name} | ${count} |`),
    '',
    `### Top positions without a note (${uncovered.length})`,
    '',
    '| plies | moves | name |',
    '|---:|---|---|',
    ...uncovered.map((r) => `| ${r.count} | ${numbered(r.sans)} | ${nameAt(r.sans)?.name ?? ''} |`),
    '',
    '### Positions with a note',
    '',
    '| plies | moves | note |',
    '|---:|---|---|',
    ...rows.filter((r) => r.note).map((r) => `| ${r.count} | ${numbered(r.sans)} | ${r.note} |`),
    '',
  ].join('\n');
}

const sets = loadSets(contentDir);
const byOpening = new Map<OpeningId, string[][]>();
for (const set of sets) {
  const games = byOpening.get(set.opening) ?? [];
  games.push(...set.games.map((g) => [...set.start, ...g.moves]));
  byOpening.set(set.opening, games);
}
const report = [
  `# Opening notes coverage`,
  '',
  `Content: ${contentDir}`,
  '',
  ...[...byOpening].map(([opening, games]) => section(opening, games)),
].join('\n');
writeFileSync(reportPath, report);
console.log(
  report
    .split('\n')
    .filter((line) => line.startsWith('- Plies') || line.startsWith('## '))
    .join('\n'),
);
