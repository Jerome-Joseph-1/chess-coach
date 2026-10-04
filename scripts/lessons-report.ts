// Prints every opening lesson's texts, and per set its worked example and a practice position, for a reader to review.
// Usage: npx vite-node scripts/lessons-report.ts <content-dir> > lessons-report.txt
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPENINGS } from '../src/content/catalog';
import type { Game } from '../src/content/types';
import { playLine } from '../src/learn/board';
import type { Beat } from '../src/learn/walkthrough';
import { openingLessonsOf, type OpeningLesson } from '../src/course/openings';
import { openingBeats, teachingFor } from '../src/course/openings/teach';
import type { CourseFile, PositionRef } from '../src/course/types';

const [contentDir] = process.argv.slice(2);
if (!contentDir) {
  console.error('Usage: npx vite-node scripts/lessons-report.ts <content-dir>');
  process.exit(1);
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const gameOf = (ref: PositionRef) => readJson<Game>(join(contentDir, ref.set, 'games', `${ref.gameId}.json`));
const turnIndexOf = (game: Game, ref: PositionRef) => game.turns.findIndex((t) => t.ply === ref.ply);

function lessonTexts(lesson: OpeningLesson): string[] {
  return [
    `## ${lesson.title} (${lesson.id})`,
    `Line: ${lesson.line}`,
    `Intro: ${lesson.intro}`,
    `${lesson.spotTitle ?? 'How to spot it'}:`,
    ...lesson.spot.map((s) => `  - ${s}`),
    `Chip: ${lesson.name}`,
    `Hint: ${lesson.hint}`,
    `Ask: ${lesson.ask ?? '(the usual question)'}`,
    `Idea: ${lesson.idea}`,
    `Remember: ${lesson.remember}`,
    ...(lesson.kind === 'plan' ? [`Off plan: ${lesson.offPlan}`] : []),
  ];
}

/** The move a game plays at a turn, in SAN, with the move number. */
function movePlayed(game: Game, turnIndex: number): string {
  const turn = game.turns[turnIndex];
  return `move ${turn.moveNo}${game.side === 'b' ? '...' : '.'}${game.moves[turn.ply]}`;
}

function sanOf(fen: string, uci: string): string {
  return playLine(fen, [uci])[0]?.san ?? uci;
}

/** The move a beat slides in, in SAN: from the beat before, or after the move that beat asked for. */
function slidIn(beat: Beat, before: Beat): string {
  const asked = before.answer ? fenAfter(before.fen, [before.answer]) : before.fen;
  const from = [before.fen, asked].find((fen) => playLine(fen, [beat.move!]).length === 1) ?? before.fen;
  return sanOf(from, beat.move!);
}

function beatLines(beats: Beat[]): string[] {
  return beats.flatMap((beat, i) => {
    const played = beat.move && i > 0 ? `(the board plays ${slidIn(beat, beats[i - 1])}) ` : '';
    const arrows = beat.arrows.length ? `  Arrows: ${beat.arrows.map((a) => `${a.from}-${a.to}`).join(', ')}` : '';
    return [
      `  ${i + 1}. ${played}${beat.text}`,
      ...(beat.ask ? [`     ${beat.ask} (answer: ${sanOf(beat.fen, beat.answer!)})`] : []),
      ...(arrows ? [`   ${arrows}`] : []),
      ...(beat.line ? [`     Then the line: ${beat.line.length ? beat.line.map((m, k) => sanOf(fenAfter(beat.fen, beat.line!.slice(0, k)), m)).join(' ') : '(none)'}`] : []),
    ];
  });
}

function fenAfter(fen: string, ucis: string[]): string {
  return playLine(fen, ucis).at(-1)?.after ?? fen;
}

function exampleLines(lesson: OpeningLesson, ref: PositionRef | undefined): string[] {
  if (!ref) return ['  Worked example: none'];
  const game = gameOf(ref);
  const index = turnIndexOf(game, ref);
  const beats = openingBeats(lesson.id, game, index);
  const head = `  Worked example: ${ref.set}/${ref.gameId} at ${movePlayed(game, index)}  FEN ${game.turns[index].fen}`;
  return [head, ...(beats ? beatLines(beats) : ['  (no steps: falls back to the tactic walkthrough)'])];
}

function practiceLines(lesson: OpeningLesson, ref: PositionRef | undefined): string[] {
  if (!ref) return ['  Practice: none'];
  const game = gameOf(ref);
  const index = turnIndexOf(game, ref);
  const teaching = teachingFor(lesson.id, game, index);
  const fen = game.turns[index].fen;
  const head = `  Practice sample: ${ref.set}/${ref.gameId} at ${movePlayed(game, index)}  FEN ${fen}`;
  if (!teaching) return [head, '  (no teaching: the lesson does not fit this position)'];
  return [
    head,
    `    Chip: ${teaching.name}`,
    `    Question: ${teaching.ask ?? '(the usual question)'}`,
    `    Hint 1: ${teaching.hint}`,
    `    Counts as found: ${teaching.planMoves.map((m) => sanOf(fen, m)).join(', ')}`,
    ...(teaching.offPlan ? [`    Another good move: ${teaching.offPlan}`] : []),
    `    Once found: ${teaching.idea}`,
    `    Remember: ${teaching.remember}`,
  ];
}

const sets = readdirSync(contentDir)
  .filter((set) => existsSync(join(contentDir, set, 'course.json')))
  .sort();
const courses = new Map(sets.map((set) => [set, readJson<CourseFile>(join(contentDir, set, 'course.json'))]));
const out: string[] = [`Opening lessons in ${contentDir}`, `Each lesson's texts, then per set its worked example and one practice position.`];
for (const { id: opening, name } of OPENINGS) {
  const own = sets.filter((set) => courses.get(set)!.opening === opening);
  if (!own.length) continue;
  out.push('', `# ${name}`);
  for (const lesson of openingLessonsOf(opening)) {
    out.push('', ...lessonTexts(lesson));
    for (const set of own) {
      const entry = courses.get(set)!.units.find((u) => u.id === lesson.id);
      out.push('', `  [${set}] ${entry ? `${entry.examples.length} examples, ${entry.drills.length} practice positions` : 'no lesson'}`);
      if (entry) out.push(...exampleLines(lesson, entry.examples[0]), ...practiceLines(lesson, entry.drills[0]));
    }
  }
}
console.log(out.join('\n'));
