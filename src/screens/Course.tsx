import type { OpeningId } from '../content/types';
import { OPENING_LESSONS_IN_PATH, gamesUntilLesson, morePractice, sectionRows, unitRows, type UnitRow } from '../course/path';
import { lessonInfo } from '../course/lessonInfo';
import { isOpeningLessonId, type CourseFile } from '../course/types';
import { gamesSinceLastLesson, useCourse } from '../course/useCourse';
import { VariationsMet } from '../opening/VariationsMet';
import { getLessons, getSettings } from '../progress/store';
import { TabBar } from '../ui/TabBar';
import { Icon } from './shared/icons';
import { EmptyCard } from './shared/EmptyCard';
import { lessonPath, morePracticePath, OPENING_SHORT, plural } from './shared/labels';
import { OpeningSwitch, useOpening } from './shared/OpeningSwitch';
import './shared/screen.css';
import './course.css';

/** The one line under the title; short enough to stay on one line on the narrowest phone. */
function introLine(rows: UnitRow[] | null, gamesLeft: number): string {
  if (rows?.length && rows.every((r) => r.status === 'done')) return 'Every lesson done: open one to go over it.';
  if (rows?.length && gamesLeft > 0) return `Next lesson after ${plural(gamesLeft, 'more game')}.`;
  return 'Learn a pattern, then use it in two games.';
}

function Status({ row }: { row: UnitRow }) {
  if (row.status === 'next') return <span class="unit-next">Next</span>;
  if (row.status === 'later') return <span class="unit-later">Later</span>;
  if (row.status === 'open') return null;
  return (
    <>
      <span class="level level--strong">
        <Icon name="check" size={14} />
        Done
      </span>
      {row.score && row.score.total > 0 && (
        <span class="unit-score">
          {row.score.right} of {row.score.total} right
        </span>
      )}
    </>
  );
}

function UnitItem({ row, opening, index, more }: { row: UnitRow; opening: OpeningId; index: number; more: number }) {
  const { title, line, icon } = lessonInfo(row.id);
  const later = row.status === 'later';
  const content = (
    <>
      <span class="tile" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span class="row-main unit-main">
        <span class="row-title">{title}</span>
        <span class="row-sub">{line}</span>
        <span class="unit-status">
          {isOpeningLessonId(row.id) && <span class="unit-tag">Opening</span>}
          <Status row={row} />
        </span>
      </span>
      <Icon name="chevron" class="chevron" />
    </>
  );
  // Today offers lessons in order, but any of them opens from here.
  return (
    <li class="rise-in" style={{ '--i': index }}>
      <a class={`row unit-row${later ? ' unit-row--later' : ''}`} href={`#${lessonPath(opening, row.id)}`}>
        {content}
      </a>
      {more > 0 && (
        <a class="unit-more" href={`#${morePracticePath(opening, row.id)}`}>
          Practice {more} more
        </a>
      )}
    </li>
  );
}

function LessonList({ rows, opening, course }: { rows: UnitRow[]; opening: OpeningId; course: CourseFile | null }) {
  const lessons = getLessons(opening);
  const moreOf = (row: UnitRow) => (row.status === 'done' ? morePractice(course, row.id, lessons[row.id]) : 0);
  return (
    <ul class="card list">
      {rows.map((row, i) => (
        <UnitItem key={row.id} row={row} opening={opening} index={i} more={moreOf(row)} />
      ))}
    </ul>
  );
}

const doneCount = (rows: UnitRow[]) => rows.filter((r) => r.status === 'done').length;

function Lessons({ rows, opening, course }: { rows: UnitRow[]; opening: OpeningId; course: CourseFile | null }) {
  if (!rows.length) return <EmptyCard text="Lessons for this level are on the way." />;
  return (
    <section class="section-block" aria-labelledby="lessons-title">
      <div class="section-head">
        <h2 id="lessons-title" class="section-label">
          {OPENING_SHORT[opening]} lessons
        </h2>
        <span class="section-note">
          {doneCount(rows)} of {rows.length} done
        </span>
      </div>
      <p class="course-own">Each opening has its own lessons.</p>
      <LessonList rows={rows} opening={opening} course={course} />
    </section>
  );
}

/** The opening's own lessons, when they are not in the path: open at any time, in their own order. */
function OpeningLessons({ opening, course }: { opening: OpeningId; course: CourseFile | null }) {
  const rows = sectionRows(course, getLessons(opening));
  if (!rows.length) return null;
  return (
    <section class="section-block" aria-labelledby="opening-lessons-title">
      <div class="section-head">
        <h2 id="opening-lessons-title" class="section-label">
          {OPENING_SHORT[opening]} plans and traps
        </h2>
        <span class="section-note">
          {doneCount(rows)} of {rows.length} done
        </span>
      </div>
      <LessonList rows={rows} opening={opening} course={course} />
    </section>
  );
}

export function Course() {
  const [opening, setOpening] = useOpening();
  const course = useCourse(opening, getSettings().levels[opening]);
  const lessons = getLessons(opening);
  const rows = course === undefined ? null : unitRows(course, lessons);
  return (
    <main class="screen screen--tabs">
      <header class="large-head">
        <h1 class="large-title">Course</h1>
        <p class="large-sub">{introLine(rows, gamesUntilLesson(lessons, gamesSinceLastLesson(opening)))}</p>
      </header>
      <div class="stack">
        <OpeningSwitch value={opening} onChange={setOpening} />
        {rows && <Lessons key={opening} rows={rows} opening={opening} course={course ?? null} />}
        {rows && !OPENING_LESSONS_IN_PATH && <OpeningLessons key={opening} opening={opening} course={course ?? null} />}
        <VariationsMet opening={opening} />
      </div>
      <TabBar current="course" />
    </main>
  );
}
