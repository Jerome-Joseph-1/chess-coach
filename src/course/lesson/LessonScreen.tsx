import { useEffect, useState } from 'preact/hooks';
import { Board } from '../../board/Board';
import type { BoardController } from '../../board/types';
import type { OpeningId } from '../../content/types';
import { lessonFor } from '../../learn';
import { CrossFade } from '../../pause/CrossFade';
import { boardSize } from '../../pause/fit';
import type { PauseOutcome, PauseStage } from '../../pause/PauseSheet';
import { Icon } from '../../pause/steps/icons';
import { getLessons, getSettings, recordDrill, recordLearned, recordLessonDone, recordLessonPlace, scheduleDrill } from '../../progress/store';
import { navigate } from '../../router';
import { openLesson, type Answer, type LessonStage, type OpenedLesson } from '../open';
import { positionKey, type LessonPlace, type UnitId } from '../types';
import { UNITS } from '../units';
import { useCourse } from '../useCourse';
import { Example, type ExampleLayout } from './Example';
import { Intro, Notice, Summary } from './Pages';
import { Practice } from './Practice';
import '../../screens/game.css';
import './lesson.css';

export interface LessonScreenProps {
  opening: OpeningId;
  unit: UnitId;
}

/** What the screen shows, which sets the board's size, as on the game screen. */
type Layout = 'intro' | ExampleLayout | PauseStage | 'summary';

const LAYOUT_OF: Record<LessonStage, Layout> = { intro: 'intro', example: 'example', practice: 'ask', summary: 'summary' };

const back = () => navigate('/course');

/** The lesson as it opens: undefined while it loads, null when there is no lesson to give. */
function useOpened(opening: OpeningId, unit: UnitId): OpenedLesson | null | undefined {
  const course = useCourse(opening, getSettings().levels[opening]);
  const [opened, setOpened] = useState<OpenedLesson | null>();
  useEffect(() => {
    if (course === undefined) return;
    let current = true;
    const lesson = course ? openLesson(course, unit, getLessons(opening)[unit]).catch(() => null) : Promise.resolve(null);
    void lesson.then((found) => current && setOpened(found));
    return () => {
      current = false;
    };
  }, [course]);
  return opened;
}

/** The page a lesson opens on, known before it loads: the intro, or the page the user left. */
function startingStage(opening: OpeningId, unit: UnitId): LessonStage {
  return getLessons(opening)[unit]?.place?.page ?? 'intro';
}

/** A unit's lesson: what the pattern is, a worked example, then practice positions and a summary. Leaving keeps the page for next time. */
export function LessonScreen({ opening, unit }: LessonScreenProps) {
  const opened = useOpened(opening, unit);
  const [entered, setEntered] = useState<LessonStage | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [given, setGiven] = useState<Answer[]>([]);
  const [board, setBoard] = useState<BoardController | null>(null);
  const stage = entered ?? opened?.stage ?? startingStage(opening, unit);
  const answers = [...(opened?.answers ?? []), ...given];

  useEffect(() => {
    if (stage === 'summary' && opened) recordLessonDone(opening, unit, Date.now());
  }, [stage, opened]);

  function enter(next: LessonStage, place?: LessonPlace) {
    if (place) recordLessonPlace(opening, unit, place);
    setEntered(next);
    setLayout(LAYOUT_OF[next]);
  }

  function exampleDone({ drills }: OpenedLesson) {
    const at = Date.now();
    recordLearned(opening, unit, at);
    enter(drills.length > 0 ? 'practice' : 'summary', { page: 'practice', since: at, drills: drills.map((d) => positionKey(d.ref)) });
  }

  function drillDone(lesson: OpenedLesson, result: PauseOutcome) {
    const position = lesson.drills[given.length];
    const correct = result.verdict === 'found';
    const { ref } = position;
    const at = Date.now();
    recordDrill(opening, unit, { key: positionKey(ref), correct, at });
    scheduleDrill({ opening, level: getSettings().levels[opening], drillSet: ref.set, gameId: ref.gameId, ply: ref.ply }, correct, at);
    setGiven([...given, { position, correct }]);
    if (given.length + 1 < lesson.drills.length) setLayout('ask');
    else enter('summary');
  }

  function body(lesson: OpenedLesson) {
    const { example, drills } = lesson;
    if (stage === 'summary') return <Summary answers={answers} remember={lessonFor(example.game, example.turnIndex).remember} onContinue={back} />;
    const position = stage === 'example' ? example : drills[given.length];
    return (
      <>
        <div class="game-board">
          <Board fen={example.game.turns[example.turnIndex].fen} orientation={position.game.side} onReady={setBoard} />
        </div>
        <section class="game-slot">
          {board && stage === 'example' && (
            <Example board={board} position={example} onLayout={setLayout} onDone={() => exampleDone(lesson)} />
          )}
          {board && stage === 'practice' && (
            <Practice key={given.length} board={board} position={position} onStage={setLayout} onDone={(result) => drillDone(lesson, result)} />
          )}
        </section>
      </>
    );
  }

  const asked = answers.length + 1;
  const total = (opened?.answers.length ?? 0) + (opened?.drills.length ?? 0);
  const subtitle = {
    intro: 'Lesson',
    example: 'Worked example',
    practice: opened ? `Practice ${asked} of ${total}` : 'Practice',
    summary: 'Summary',
  }[stage];
  const mode = opened === null ? 'intro' : (layout ?? LAYOUT_OF[stage]);
  return (
    <main class="game lesson" data-mode={mode} data-size={boardSize(mode)}>
      <header class="game-top">
        <button class="game-back" type="button" aria-label="Back" onClick={back}>
          <Icon name="chevron-left" />
        </button>
        <div class="game-heading">
          <h1 class="game-title">{UNITS[unit].title}</h1>
          <p class="game-sub">
            <CrossFade value={subtitle}>{subtitle}</CrossFade>
          </p>
        </div>
        <span class="game-top-end" aria-hidden="true" />
      </header>
      {opened === null ? (
        <Notice text="This lesson could not be loaded. Check your connection, then try again." action={{ label: 'Back to the course', onClick: back }} />
      ) : stage === 'intro' ? (
        <Intro unit={unit} action={opened && { label: 'Show me an example', onClick: () => enter('example', { page: 'example' }) }} />
      ) : opened ? (
        body(opened)
      ) : (
        <section class="lesson-page" aria-busy="true" />
      )}
    </main>
  );
}
