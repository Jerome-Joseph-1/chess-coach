// Runs whyWrong over a stratified sample of wrong moves in a content folder and writes a report to review by eye,
// a JSONL file of the claims the texts make, and how many key positions fall under each answer to step 1.
// Usage: npx vite-node scripts/why-wrong-report.ts <content-dir> <report.md> [seed]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game } from '../src/content/types';
import { playLine } from '../src/learn/board';
import { SITUATIONS, situationsOf, type Situation } from '../src/learn/situation';
import { whyWrong, type WrongKind, type WrongMove } from '../src/learn/whyWrong';
import { HOLD_MAX, scriptedUci } from '../src/pause/flow';

const [contentDir, reportPath, seedArg] = process.argv.slice(2);
if (!contentDir || !reportPath) {
  console.error('Usage: npx vite-node scripts/why-wrong-report.ts <content-dir> <report.md> [seed]');
  process.exit(1);
}
const SAMPLES = 150;
const KINDS: WrongKind[] = ['blunder', 'bait', 'ignores-threat', 'missed', 'weaker'];

interface Candidate {
  set: string;
  game: Game;
  index: number;
  uci: string;
}

interface Row extends Candidate {
  why: WrongMove;
  /** What the coach says once the pattern is named, and once the piece in trouble is marked. */
  pattern: WrongMove;
  named: WrongMove;
}

function loadSets(dir: string): { set: string; games: Game[] }[] {
  return readdirSync(dir)
    .filter((set) => statSync(join(dir, set)).isDirectory())
    .sort()
    .map((set) => ({
      set,
      games: readdirSync(join(dir, set, 'games'))
        .sort()
        .map((file) => JSON.parse(readFileSync(join(dir, set, 'games', file), 'utf8')) as Game),
    }));
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

function shuffled<T>(items: T[], next: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Every move of a critical turn that the pause would call wrong: not the game's move, the best one, or a fine alternative. */
function wrongMoves(set: string, game: Game): Candidate[] {
  return game.turns.flatMap((turn, index) => {
    if (turn.label !== 'critical') return [];
    const right = [scriptedUci(game, index), turn.lines.best?.[0]];
    return Object.keys(turn.grades)
      .filter((uci) => !right.includes(uci) && turn.grades[uci] > HOLD_MAX)
      .map((uci) => ({ set, game, index, uci }));
  });
}

/** Up to `quota` moves of each kind from one set, classified only as far as needed to fill them. */
function sampleSet(candidates: Candidate[], quota: number, next: () => number): Row[] {
  const rows: Row[] = [];
  const count = (kind: WrongKind) => rows.filter((r) => r.why.kind === kind).length;
  for (const candidate of shuffled(candidates, next)) {
    if (KINDS.every((kind) => count(kind) >= quota)) break;
    const why = whyWrong(candidate.game, candidate.index, candidate.uci, 0);
    if (!KINDS.includes(why.kind) || count(why.kind) >= quota) continue;
    const [pattern, named] = ([1, 2] as const).map((hint) => whyWrong(candidate.game, candidate.index, candidate.uci, hint));
    rows.push({ ...candidate, why, pattern, named });
  }
  return rows;
}

const PIECES: Record<string, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };

/** What a text says the user loses, read from its words: the biggest piece of "You lose ...", a piece taken, or mate. */
function claimOf(text: string): { claimedPiece: string } | { claimedMate: true } | null {
  // What the user takes is no claim.
  const said = text.replace(/You take the \w+ on \w\d|Taking the \w+ on \w\d/g, '');
  const piece =
    said.match(/(?:[Yy]ou lose|costs you) (?:your |a |two |three |four )?(pawn|knight|bishop|rook|queen)/) ??
    said.match(/\b(?:wins|takes|taking|take|traps) (?:your |a |the |two |three |four )?(pawn|knight|bishop|rook|queen)/) ??
    said.match(/your (pawn|knight|bishop|rook|queen)(?: on \w\d)? can't escape/);
  if (piece) return { claimedPiece: PIECES[piece[1]] };
  return /checkmate/.test(said) && !/threatens checkmate/.test(said) ? { claimedMate: true } : null;
}

function sanLine(fen: string, ucis: string[]): string {
  return playLine(fen, ucis)
    .map((m) => m.san)
    .join(' ');
}

function sample(row: Row): string {
  const { game, index, uci, why, pattern, named } = row;
  const turn = game.turns[index];
  const move = playLine(turn.fen, [uci])[0];
  const user = game.side === 'w' ? 'White' : 'Black';
  const reply = why.reply ? `${sanLine(move.after, [why.reply])}${why.targets.length ? `, marks ${why.targets.join(' ')}` : ''}` : 'none';
  return [
    `### ${game.id} turn ${index}: ${move.san} (${why.kind}${why.pattern ? `, ${why.pattern}` : ''})`,
    `- FEN: \`${turn.fen}\` (${turn.kinds.join('/')}, user ${user})`,
    `- Move: ${move.san} (${uci}), loses ${turn.grades[uci]}%`,
    `- Says: ${why.text}`,
    pattern.text !== why.text ? `- At hint 1: ${pattern.text}` : '',
    named.text !== pattern.text ? `- At hint 2: ${named.text}` : '',
    `- Board: ${reply}`,
    `- Line: ${sanLine(turn.fen, [uci, ...(turn.refutations[uci] ?? [])]) || move.san}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** One JSON line per thing the coach says, hints 1 and 2 included when they say something else. */
function claims(rows: Row[]): string {
  const said = rows.flatMap((row) => {
    const told = [row.why, row.pattern, row.named].filter((t, i, all) => all.findIndex((u) => u.text === t.text) === i);
    return told.map((t) => ({ row, told: t }));
  });
  return said
    .map(({ row: { game, index, uci }, told }) => {
      const turn = game.turns[index];
      const { kind, text } = told;
      return JSON.stringify({ fen: turn.fen, uci, kind, text, refutation: turn.refutations[uci] ?? [], ...claimOf(text) });
    })
    .join('\n');
}

const LABELS = Object.fromEntries(SITUATIONS.map((s) => [s.id, s.label])) as Record<Situation, string>;

/** Key positions under each answer to step 1; a position with two answers counts under both. */
function situationTable(sets: { set: string; games: Game[] }[]): string {
  const header = `| set | key positions | ${SITUATIONS.map((s) => s.label).join(' | ')} | two answers |\n|---|---:|${SITUATIONS.map(() => '---:').join('|')}|---:|`;
  const totals = new Map<string, number>();
  const add = (key: string, n = 1) => totals.set(key, (totals.get(key) ?? 0) + n);
  const lines = sets.map(({ set, games }) => {
    const answers = games.flatMap((game) => game.turns.flatMap((turn, i) => (turn.label === 'gray' ? [] : [situationsOf(game, i)])));
    const count = (id: Situation) => answers.filter((a) => a.includes(id)).length;
    const several = answers.filter((a) => a.length > 1).length;
    add('positions', answers.length);
    add('several', several);
    SITUATIONS.forEach((s) => add(s.id, count(s.id)));
    return `| ${set} | ${answers.length} | ${SITUATIONS.map((s) => count(s.id)).join(' | ')} | ${several} |`;
  });
  const all = `| all | ${totals.get('positions')} | ${SITUATIONS.map((s) => totals.get(s.id) ?? 0).join(' | ')} | ${totals.get('several')} |`;
  return [header, ...lines, all].join('\n');
}

const sets = loadSets(contentDir);
const next = random(Number(seedArg ?? 1));
const quota = Math.ceil(SAMPLES / (sets.length * KINDS.length));
const pools = sets.map(({ set, games }) => games.flatMap((game) => wrongMoves(set, game)));
const rows = pools.flatMap((pool) => sampleSet(pool, quota, next));
const games = sets.reduce((n, s) => n + s.games.length, 0);
const kindCounts = KINDS.map((kind) => `${kind} ${rows.filter((r) => r.why.kind === kind).length}`).join(', ');

const report = [
  '# Why-wrong report',
  `${games} games in ${sets.length} sets, ${pools.flat().length} wrong moves at critical turns. Seed ${seedArg ?? 1}.`,
  `Answers: ${SITUATIONS.map((s) => `${LABELS[s.id]} (${s.id})`).join(', ')}.`,
  '## Key positions by answer to step 1',
  situationTable(sets),
  `## ${rows.length} sampled wrong moves`,
  `Up to ${quota} of each kind per set: ${kindCounts}.`,
  ...rows.map(sample),
].join('\n\n');

const claimsPath = reportPath.replace(/\.md$/, '') + '.jsonl';
writeFileSync(reportPath, `${report}\n`);
writeFileSync(claimsPath, `${claims(rows)}\n`);
console.log(`Wrote ${reportPath} and ${claimsPath}: ${rows.length} samples (${kindCounts}).`);
