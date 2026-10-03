// Runs the teaching layer over a content folder and writes a Markdown report to review by eye.
// Usage: npx vite-node scripts/themes-report.ts <content-dir> <report.md> [seed]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game, Turn } from '../src/content/types';
import { passTurn, playLine } from '../src/learn/board';
import { lessonFor, type Lesson } from '../src/learn';

const [contentDir, reportPath, seedArg] = process.argv.slice(2);
if (!contentDir || !reportPath) {
  console.error('Usage: npx vite-node scripts/themes-report.ts <content-dir> <report.md> [seed]');
  process.exit(1);
}
const SAMPLES = 40;
const QUIET_SAMPLES = 4;

interface Row {
  set: string;
  game: Game;
  index: number;
  turn: Turn;
  lesson: Lesson;
}

function loadGames(dir: string): { set: string; game: Game }[] {
  return readdirSync(dir)
    .filter((set) => statSync(join(dir, set)).isDirectory())
    .sort()
    .flatMap((set) =>
      readdirSync(join(dir, set, 'games'))
        .sort()
        .map((file) => ({ set, game: JSON.parse(readFileSync(join(dir, set, 'games', file), 'utf8')) as Game })),
    );
}

function sanLine(fen: string | null, ucis: string[] = []): string {
  return fen ? playLine(fen, ucis).map((m) => m.san).join(' ') : '';
}

/** `count` rows picked at random, without repeats. */
function pickRandom(rows: Row[], count: number, next: () => number): Row[] {
  const pool = [...rows];
  return Array.from({ length: Math.min(count, pool.length) }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]);
}

/** Small seeded generator so the samples are stable between runs. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function themeKey(row: Row): string {
  const { theme } = row.lesson;
  if (theme.id === 'quiet') return `quiet:${theme.quiet?.focus}`;
  return theme.pattern && theme.pattern !== theme.id ? `${theme.id}:${theme.pattern}` : theme.id;
}

function table(rows: Row[], sets: string[]): string {
  const keys = [...new Set(rows.map(themeKey))].sort();
  const count = (set: string | null, key: string) => rows.filter((r) => (!set || r.set === set) && themeKey(r) === key).length;
  const header = `| theme | ${sets.join(' | ')} | all |\n|---|${sets.map(() => '---:').join('|')}|---:|`;
  const lines = keys.map((key) => `| ${key} | ${sets.map((s) => count(s, key)).join(' | ')} | ${count(null, key)} |`);
  return [header, ...lines].join('\n');
}

function sample(row: Row): string {
  const { turn, lesson, game } = row;
  const lines = [
    `### ${game.id} turn ${row.index} (${turn.label}${turn.kinds.length ? `: ${turn.kinds.join('/')}` : ''}, user ${game.side === 'w' ? 'White' : 'Black'})`,
    `- FEN: \`${turn.fen}\``,
    turn.lines.best ? `- Best: ${sanLine(turn.fen, turn.lines.best)}` : '',
    turn.lines.threat ? `- Threat: ${sanLine(passTurn(turn.fen), turn.lines.threat)}` : '',
    turn.lines.mistake ? `- Mistake: ${sanLine(turn.fen, turn.lines.mistake)}` : '',
    `- Theme: **${themeKey(row)}** — ${lesson.name}`,
    `- Idea: ${lesson.idea}`,
    `- Hint: ${lesson.hint}`,
    `- Remember: ${lesson.remember}`,
    `- Squares: ${lesson.squares.join(' ')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

const games = loadGames(contentDir);
const rows: Row[] = games.flatMap(({ set, game }) =>
  game.turns.flatMap((turn, index) =>
    turn.label === 'gray' ? [] : [{ set, game, index, turn, lesson: lessonFor(game, index) }],
  ),
);
const sets = [...new Set(rows.map((r) => r.set))];
const critical = rows.filter((r) => r.turn.label === 'critical');
const quiet = rows.filter((r) => r.turn.label === 'nothing');
// A general explanation: no named pattern for the win, the threat or the bait.
const isFallback = ({ theme }: Lesson) =>
  theme.id === 'material-win' || theme.pattern === 'material-win' || !theme.tactic;
const fallback = critical.filter((r) => isFallback(r.lesson));

// Mostly critical turns: they carry the tactics worth checking.
const next = random(Number(seedArg ?? 1));
const picks = [...pickRandom(critical, SAMPLES - QUIET_SAMPLES, next), ...pickRandom(quiet, QUIET_SAMPLES, next)];

const report = [
  '# Themes report',
  `${games.length} games, ${critical.length} critical turns, ${quiet.length} quiet turns.`,
  `General fallbacks (material-win, unnamed threats and baits): ${fallback.length} of ${critical.length} critical turns (${Math.round((100 * fallback.length) / critical.length)}%).`,
  '## Critical turns by theme',
  table(critical, sets),
  '## Quiet turns by focus',
  table(quiet, sets),
  `## ${picks.length} samples`,
  ...picks.map(sample),
].join('\n\n');

writeFileSync(reportPath, `${report}\n`);
console.log(`Wrote ${reportPath}: ${critical.length} critical, ${fallback.length} fallbacks.`);
