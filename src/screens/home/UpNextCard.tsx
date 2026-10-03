import { openingById } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import { courseUnits, nextStep } from '../../course/path';
import type { UnitId } from '../../course/types';
import { UNITS } from '../../course/units';
import { gamesSinceLastLesson, useCourse } from '../../course/useCourse';
import { getDepth, getLessons, getSetStats, getStageProgress } from '../../progress/store';
import { navigate } from '../../router';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { Icon } from '../shared/icons';
import { lessonPath, OPENING_TITLES, playPath, sideLine } from '../shared/labels';
import { UNIT_ICONS } from '../shared/unitIcons';
import { MiniBoard } from './MiniBoard';
import { StageProgress } from './StageProgress';
import type { SetStatus } from './useSetStatus';

interface UpNextCardProps {
  opening: OpeningId;
  level: Level;
  status: SetStatus;
}

/** The one next step: the next lesson of the course, or a game. */
export function UpNextCard(props: UpNextCardProps) {
  const course = useCourse(props.opening, props.level);
  // Holds the card's place while the course loads, so a game card never flashes before a lesson.
  if (course === undefined) return <div class="card up-next up-next--waiting" aria-hidden="true" />;
  const step = nextStep(course, getLessons(props.opening), gamesSinceLastLesson(props.opening));
  if (step.kind === 'game') return <GameCard {...props} />;
  return <LessonCard {...props} unit={step.unit} number={courseUnits(course).indexOf(step.unit) + 1} />;
}

/** The next lesson, with a quiet way to play a game instead. */
function LessonCard({ opening, level, status, unit, number }: UpNextCardProps & { unit: UnitId; number: number }) {
  const { title, line } = UNITS[unit];
  return (
    <section class="card up-next" aria-labelledby="up-next-title">
      <div class="up-next-top">
        <span class="tile up-next-tile" aria-hidden="true">
          <Icon name={UNIT_ICONS[unit]} size={28} />
        </span>
        <div class="up-next-text">
          <p class="eyebrow up-next-eyebrow">Up next · Lesson {number}</p>
          <h2 id="up-next-title" class="up-next-title">
            {title}
          </h2>
          <p class="up-next-line">{line}</p>
        </div>
      </div>
      <Button size="lg" onClick={() => navigate(lessonPath(opening, unit))}>
        Start lesson
      </Button>
      {status === 'ready' && (
        <a class="up-next-instead" href={`#${playPath(opening, level)}`}>
          Start a game instead
        </a>
      )}
    </section>
  );
}

/** Which game comes up, how far along the stage is, and Play. */
function GameCard({ opening, level, status }: UpNextCardProps) {
  const { start, side } = openingById(opening);
  const gameNumber = getSetStats(opening, level).games + 1;
  return (
    <section class="card up-next" aria-labelledby="up-next-title">
      <div class="up-next-top">
        <MiniBoard moves={start} side={side} />
        <div class="up-next-text">
          <p class="eyebrow up-next-eyebrow">Up next · Game {gameNumber}</p>
          <h2 id="up-next-title" class="up-next-title">
            {OPENING_TITLES[opening]}
          </h2>
          <p class="up-next-line">
            {sideLine(opening)} · opponents {level}
          </p>
        </div>
      </div>
      <p class="up-next-how">The coach plays both sides and stops when it's your turn to find a move.</p>
      <StageProgress depth={getDepth(opening, level)} progress={getStageProgress(opening, level)} />
      {status === 'error' && <p class="up-next-line">Can't reach the games right now. Check your connection.</p>}
      <Button size="lg" class="btn-with-icon" {...disabledIf(status !== 'ready')} onClick={() => navigate(playPath(opening, level))}>
        {status !== 'soon' && <Icon name="play" />}
        {status === 'soon' ? 'Coming soon' : 'Start game'}
      </Button>
    </section>
  );
}
