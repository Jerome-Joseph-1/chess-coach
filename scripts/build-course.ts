// Writes each set's course.json: the key positions that teach and practise each lesson. Also copies the
// analysed trap games into each set's games folder, where the trap lessons load them from.
// Usage: npx vite-node scripts/build-course.ts <content-dir> [--strict]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPENINGS } from '../src/content/catalog';
import type { Game, SetIndex } from '../src/content/types';
import { planCandidatesOf } from '../src/course/openings/mine';
import { readTraps, trapGameFiles } from '../src/course/openings/trapGames';
import { buildCourses, candidatesOf, setOf, type Candidate } from '../src/course/select';
import { DRILLS_PER_LESSON, OPENING_LESSON_IDS, UNIT_IDS, type CourseFile, type LessonId, type PositionRef } from '../src/course/types';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const [contentDir] = args.filter((arg) => !arg.startsWith('--'));
if (!contentDir) {
  console.error('Usage: npx vite-node scripts/build-course.ts <content-dir> [--strict]');
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function setCandidates(set: string): Candidate[] {
  const index = readJson<SetIndex>(join(contentDir, set, 'index.json'));
  return index.games.flatMap(({ id }) => {
    const game = readJson<Game>(join(contentDir, set, 'games', `${id}.json`));
    return [...candidatesOf(set, game), ...planCandidatesOf(set, game)];
  });
}

/** "own+borrowed", or just the own count when nothing was borrowed. */
function supply(refs: PositionRef[], set: string): string {
  const own = refs.filter((r) => r.set === set).length;
  const borrowed = refs.length - own;
  return borrowed ? `${own}+${borrowed}` : `${own}`;
}

const entryOf = (course: CourseFile, lesson: LessonId) => course.units.find((u) => u.id === lesson);
const lessonsOf = (course: CourseFile): LessonId[] => [...UNIT_IDS, ...OPENING_LESSON_IDS[course.opening]];

function cell(course: CourseFile, set: string, lesson: LessonId): string {
  const entry = entryOf(course, lesson);
  return entry ? `${supply(entry.examples, set)}/${supply(entry.drills, set)}` : '-';
}

/** One table per opening: a row per lesson, a column per set. */
function printSupply(courses: Map<string, CourseFile>): void {
  console.log('Examples/drills per lesson; own+borrowed from other levels; - means no lesson.');
  for (const { id } of OPENINGS) {
    const entries = [...courses].filter(([, course]) => course.opening === id);
    if (!entries.length) continue;
    const width = Math.max(...entries.map(([set]) => set.length)) + 2;
    const row = (first: string, cells: string[]) => first.padEnd(20) + cells.map((c) => c.padEnd(width)).join('');
    console.log(`\n${row('lesson', entries.map(([set]) => set))}`);
    for (const lesson of lessonsOf(entries[0][1])) console.log(row(lesson, entries.map(([set, course]) => cell(course, set, lesson))));
  }
}

/** Every set and lesson as "set lesson", for those that pass `test`. */
function listWhere(courses: Map<string, CourseFile>, test: (course: CourseFile, lesson: LessonId) => boolean): string[] {
  return [...courses].flatMap(([set, course]) => lessonsOf(course).flatMap((lesson) => (test(course, lesson) ? [`${set} ${lesson}`] : [])));
}

function writeTrapGames(set: string, traps: ReturnType<typeof readTraps>): void {
  const { opening, level } = setOf(set)!;
  for (const { file, game } of trapGameFiles(opening, level, traps)) writeFileSync(join(contentDir, set, 'games', file), `${JSON.stringify(game)}\n`);
}

const sets = readdirSync(contentDir)
  .filter((set) => existsSync(join(contentDir, set, 'index.json')))
  .sort();
const traps = readTraps();
const candidates = new Map(sets.map((set) => [set, setCandidates(set)]));
const courses = buildCourses(candidates, traps);
for (const [set, course] of courses) {
  writeFileSync(join(contentDir, set, 'course.json'), `${JSON.stringify(course)}\n`);
  writeTrapGames(set, traps);
}
printSupply(courses);

const short = listWhere(courses, (course, lesson) => (entryOf(course, lesson)?.drills.length ?? DRILLS_PER_LESSON) < DRILLS_PER_LESSON);
if (short.length) console.warn(`\nFewer than ${DRILLS_PER_LESSON} practice positions: ${short.join(', ')}`);
const missing = listWhere(courses, (course, lesson) => !entryOf(course, lesson));
if (missing.length) console.warn(`\nNo example for: ${missing.join(', ')}`);
if (strict && missing.length) process.exit(1);
