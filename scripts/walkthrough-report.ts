// Writes the worked examples each set's lessons show, from its course.json or else built as at deploy, to read by eye,
// and next to the report a JSONL file of what their sentences claim about the board.
// Usage: npx vite-node scripts/walkthrough-report.ts <content-dir> <report.md> [examples per unit]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game, SetIndex } from '../src/content/types';
import type { CourseFile } from '../src/course/types';
import { buildCourse, candidatesOf } from '../src/course/select';
import { UNIT_IDS, type PositionRef } from '../src/course/types';
import { lessonFor } from '../src/learn';
import { playLine } from '../src/learn/board';
import { walkthrough, type Beat } from '../src/learn/walkthrough';

const [contentDir, reportPath, perUnitArg] = process.argv.slice(2);
if (!contentDir || !reportPath) {
  console.error('Usage: npx vite-node scripts/walkthrough-report.ts <content-dir> <report.md> [examples per unit]');
  process.exit(1);
}
const PER_UNIT = Number(perUnitArg ?? 2);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const sets = readdirSync(contentDir)
  .filter((set) => existsSync(join(contentDir, set, 'index.json')))
  .sort();
function readSet(set: string): Game[] {
  return readJson<SetIndex>(join(contentDir, set, 'index.json')).games.map(({ id }) => readJson<Game>(join(contentDir, set, 'games', `${id}.json`)));
}

const games = new Map(sets.map((set) => [set, readSet(set)]));
const candidates = new Map(sets.map((set) => [set, games.get(set)!.flatMap((game) => candidatesOf(set, game))]));

function courseOf(set: string): CourseFile {
  const path = join(contentDir, set, 'course.json');
  return existsSync(path) ? readJson<CourseFile>(path) : buildCourse(set, candidates);
}

function sanLine(fen: string, ucis: string[] = []): string {
  return playLine(fen, ucis)
    .map((m) => m.san)
    .join(' ');
}

/** The beat's move in SAN, played from the previous beat's position or from after its answer. */
function moveSan(beat: Beat, previous: Beat | undefined): string {
  if (!beat.move || !previous) return '';
  const answered = previous.answer ? playLine(previous.fen, [previous.answer])[0]?.after : undefined;
  const from = [previous.fen, answered].find((fen) => fen && playLine(fen, [beat.move!])[0]?.after === beat.fen);
  return from ? sanLine(from, [beat.move]) : beat.move;
}

function beatLines(beat: Beat, previous: Beat | undefined, n: number): string[] {
  const marks = beat.marks.map((m) => `${m.square} ${m.tone}`).join(', ');
  const arrows = beat.arrows.map((a) => `${a.from}-${a.to} ${a.tone}`).join(', ');
  return [
    `${n}. ${beat.text}`,
    `   - fen \`${beat.fen}\`${beat.move ? `, after ${moveSan(beat, previous)}` : ''}`,
    marks && `   - marks: ${marks}`,
    arrows && `   - arrows: ${arrows}`,
    beat.ask ? `   - ask: ${beat.ask} (${beat.answer})` : '',
    beat.line ? `   - line: ${sanLine(beat.fen, beat.line) || 'none left'}` : '',
  ].filter(Boolean);
}

function example(ref: PositionRef): { text: string; claims: object[] } | null {
  const game = games.get(ref.set)?.find((g) => g.id === ref.gameId);
  const index = game?.turns.findIndex((t) => t.ply === ref.ply) ?? -1;
  if (!game || index < 0) return null;
  const turn = game.turns[index];
  const lesson = lessonFor(game, index);
  const beats = walkthrough(game, index);
  const side = game.side === 'w' ? 'White' : 'Black';
  const head = `### ${game.id} turn ${index} (move ${turn.moveNo}, ${side}, find ${Math.round(ref.findShare * 100)}%) ${lesson.name}`;
  const body = beats.flatMap((beat, i) => beatLines(beat, beats[i - 1], i + 1));
  const claims = beats.flatMap((beat) => (beat.claims ?? []).map((claim) => ({ id: `${game.id}#${index}`, fen: beat.fen, ...claim })));
  return { text: [head, `Best: ${sanLine(turn.fen, turn.lines.best)}`, '', ...body, `Remember: ${lesson.remember}`].join('\n'), claims };
}

const sections: string[] = [];
const claims: object[] = [];
for (const set of sets) {
  const course = courseOf(set);
  sections.push(`## ${set}`);
  for (const unit of UNIT_IDS) {
    const examples = (course.units.find((u) => u.id === unit)?.examples ?? []).map(example).filter((e) => e !== null);
    claims.push(...examples.flatMap((e) => e.claims));
    if (examples.length) sections.push(`#### ${unit}`, ...examples.slice(0, PER_UNIT).map((e) => e.text));
  }
}

const report = ['# Walkthrough report', 'The worked examples each lesson would show, first choice first.', ...sections].join('\n\n');
const claimsPath = `${reportPath.replace(/\.md$/, '')}.claims.jsonl`;
writeFileSync(reportPath, `${report}\n`);
writeFileSync(claimsPath, `${claims.map((claim) => JSON.stringify(claim)).join('\n')}\n`);
console.log(`Wrote ${reportPath} and ${claimsPath} (${claims.length} claims).`);
