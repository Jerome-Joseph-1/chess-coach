// Writes each set's course.json: the key positions that teach and practise each unit.
// Usage: npx vite-node scripts/build-course.ts <content-dir> [--strict]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game, SetIndex } from '../src/content/types';
import { buildCourse, candidatesOf, type Candidate } from '../src/course/select';
import { UNIT_IDS, type CourseFile, type PositionRef, type UnitId } from '../src/course/types';

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
  return index.games.flatMap(({ id }) => candidatesOf(set, readJson<Game>(join(contentDir, set, 'games', `${id}.json`))));
}

/** "own+borrowed", or just the own count when nothing was borrowed. */
function supply(refs: PositionRef[], set: string): string {
  const own = refs.filter((r) => r.set === set).length;
  const borrowed = refs.length - own;
  return borrowed ? `${own}+${borrowed}` : `${own}`;
}

function cell(course: CourseFile, set: string, unit: UnitId): string {
  const entry = course.units.find((u) => u.id === unit);
  return entry ? `${supply(entry.examples, set)}/${supply(entry.drills, set)}` : '-';
}

function printSupply(courses: Map<string, CourseFile>): void {
  const sets = [...courses.keys()];
  const width = Math.max(...sets.map((s) => s.length)) + 2;
  const row = (first: string, cells: string[]) => first.padEnd(17) + cells.map((c) => c.padEnd(width)).join('');
  console.log('Examples/drills per unit; own+borrowed from other levels; - means no lesson.');
  console.log(row('unit', sets));
  for (const unit of UNIT_IDS) console.log(row(unit, sets.map((set) => cell(courses.get(set)!, set, unit))));
}

const sets = readdirSync(contentDir)
  .filter((set) => existsSync(join(contentDir, set, 'index.json')))
  .sort();
const candidates = new Map(sets.map((set) => [set, setCandidates(set)]));
const courses = new Map(sets.map((set) => [set, buildCourse(set, candidates)]));
for (const [set, course] of courses) writeFileSync(join(contentDir, set, 'course.json'), `${JSON.stringify(course)}\n`);
printSupply(courses);

const missing = [...courses].flatMap(([set, course]) =>
  UNIT_IDS.filter((unit) => !course.units.some((u) => u.id === unit)).map((unit) => `${set} ${unit}`),
);
if (missing.length) console.warn(`No example for: ${missing.join(', ')}`);
if (strict && missing.length) process.exit(1);
