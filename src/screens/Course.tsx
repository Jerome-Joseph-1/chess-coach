import type { OpeningId } from '../content/types';
import { gamesUntilLesson, unitRows, type UnitRow } from '../course/path';
import { UNITS } from '../course/units';
import { gamesSinceLastLesson, useCourse } from '../course/useCourse';
import { VariationsMet } from '../opening/VariationsMet';
import { getLessons, getSettings } from '../progress/store';
import { TabBar } from '../ui/TabBar';
import { Icon } from './shared/icons';
import { EmptyCard } from './shared/EmptyCard';
import { lessonPath, plural } from './shared/labels';
import { OpeningSwitch, useOpening } from './shared/OpeningSwitch';
import { UNIT_ICONS } from './shared/unitIcons';
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

function UnitItem({ row, opening, index }: { row: UnitRow; opening: OpeningId; index: number }) {
  const { title, line } = UNITS[row.id];
  const later = row.status === 'later';
  const content = (
    <>
      <span class="tile" aria-hidden="true">
        <Icon name={UNIT_ICONS[row.id]} />
      </span>
      <span class="row-main unit-main">
        <span class="row-title">{title}</span>
        <span class="row-sub">{line}</span>
        <span class="unit-status">
          <Status row={row} />
        </span>
      </span>
      <Icon name="chevron" class={`chevron ${later ? 'unit-chevron--none' : ''}`} />
    </>
  );
  return (
    <li class="rise-in" style={{ '--i': index }}>
      {later ? (
        <div class="row unit-row unit-row--later">{content}</div>
      ) : (
        <a class="row unit-row" href={`#${lessonPath(opening, row.id)}`}>
          {content}
        </a>
      )}
    </li>
  );
}

function Lessons({ rows, opening }: { rows: UnitRow[]; opening: OpeningId }) {
  if (!rows.length) return <EmptyCard text="Lessons for this level are on the way." />;
  const done = rows.filter((r) => r.status === 'done').length;
  return (
    <section class="section-block" aria-labelledby="lessons-title">
      <div class="section-head">
        <h2 id="lessons-title" class="section-label">
          Lessons
        </h2>
        <span class="section-note">
          {done} of {rows.length} done
        </span>
      </div>
      <ul class="card list">
        {rows.map((row, i) => (
          <UnitItem key={row.id} row={row} opening={opening} index={i} />
        ))}
      </ul>
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
        {rows && <Lessons key={opening} rows={rows} opening={opening} />}
        <VariationsMet opening={opening} />
      </div>
      <TabBar current="course" />
    </main>
  );
}
