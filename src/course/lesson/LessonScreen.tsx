import { useEffect, useMemo, useState } from 'preact/hooks';
import { Board } from '../../board/Board';
import type { BoardController } from '../../board/types';
import type { OpeningId } from '../../content/types';
import { CrossFade } from '../../pause/CrossFade';
import { boardSize } from '../../pause/fit';
import type { PauseOutcome, PauseStage } from '../../pause/PauseSheet';
import { Icon } from '../../pause/steps/icons';
import { OPENING_SHORT } from '../../screens/shared/labels';
import { getLessons, getSettings, recordDrill, recordLearned, recordLessonDone, recordLessonPlace, scheduleDrill } from '../../progress/store';
import { navigate } from '../../router';
import { lessonInfo } from '../lessonInfo';
import { openLesson, type Answer, type LessonStage, type OpenedLesson } from '../open';
import { morePractice } from '../path';
import { positionKey, type CourseFile, type LessonId, type LessonPlace, type UnitId } from '../types';
import { useCourse } from '../useCourse';
import { Example, type ExampleLayout } from './Example';
import { Intro, Notice, Summary } from './Pages';
import { Practice } from './Practice';
import { lessonRemember, openingExample, practiceTeaching } from './teaching';
import '../../screens/game.css';
import './lesson.css';

export interface LessonScreenProps {
  opening: OpeningId;
  /** A tactic unit, or one of the opening's own lessons. */
  unit: LessonId;
  /** A round of practice positions not answered before, for a lesson already done. */
  more?: boolean;
}

/** What the screen shows, which sets the board's size, as on the game screen. */
type Layout = 'intro' | ExampleLayout | PauseStage | 'summary';

const LAYOUT_OF: Record<LessonStage, Layout> = { intro: 'intro', example: 'example', practice: 'ask', summary: 'summary' };
const NONE_LEFT = 'You have answered every practice position of this lesson.';

const back = () => navigate('/course');

/** The progress store and course helpers still name tactic units; an opening lesson's id works in them all the same. */
const asUnit = (lesson: LessonId) => lesson as UnitId;

/** The lesson as it opens: undefined while it loads, null when there is no lesson to give. */
function useOpened(course: CourseFile | null | undefined, opening: OpeningId, unit: LessonId, round: number): OpenedLesson | null | undefined {
  const [opened, setOpened] = useState<{ round: number; lesson: OpenedLesson | null }>();
  useEffect(() => {
    if (course === undefined) return;
    let current = true;
    const lesson = course ? openLesson(course, asUnit(unit), getLessons(opening)[unit], round > 0).catch(() => null) : Promise.resolve(null);
    void lesson.then((found) => current && setOpened({ round, lesson: found }));
    return () => {
      current = false;
    };
  }, [course, round]);
  return opened?.round === round ? opened.lesson : undefined;
}

/** The page a lesson opens on, known before it loads: the intro, or the page the user left. */
function startingStage(opening: OpeningId, unit: LessonId, more: boolean): LessonStage {
  return more ? 'practice' : (getLessons(opening)[unit]?.place?.page ?? 'intro');
}

/** A unit's lesson, or a round of more practice; each round starts afresh, the lesson where the user left it. */
export function LessonScreen({ opening, unit, more = false }: LessonScreenProps) {
  const course = useCourse(opening, getSettings().levels[opening]);
  const [round, setRound] = useState(more ? 1 : 0);
  const opened = useOpened(course, opening, unit, round);
  return (
    <LessonRun
      key={round}
      opening={opening}
      unit={unit}
      more={round > 0}
      course={course ?? null}
      opened={opened}
      onMore={() => setRound(round + 1)}
    />
  );
}

interface LessonRunProps {
  opening: OpeningId;
  unit: LessonId;
  more: boolean;
  course: CourseFile | null;
  opened: OpenedLesson | null | undefined;
  onMore: () => void;
}

/** What the pattern is, a worked example, then practice positions and a summary. Leaving keeps the page for next time. */
function LessonRun({ opening, unit, more, course, opened, onMore }: LessonRunProps) {
  const [entered, setEntered] = useState<LessonStage | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [given, setGiven] = useState<Answer[]>([]);
  const [board, setBoard] = useState<BoardController | null>(null);
  const stage = entered ?? opened?.stage ?? startingStage(opening, unit, more);
  const answers = [...(opened?.answers ?? []), ...given];
  const ownExample = useMemo(() => opened && openingExample(unit, opened.example), [opened]);
  const drill = stage === 'practice' ? opened?.drills[given.length] : undefined;
  const teaching = useMemo(() => drill && practiceTeaching(unit, drill), [drill]);

  useEffect(() => {
    if (stage === 'summary' && opened && !more) recordLessonDone(opening, asUnit(unit), Date.now());
  }, [stage, opened]);

  function enter(next: LessonStage, place?: LessonPlace) {
    if (place && !more) recordLessonPlace(opening, asUnit(unit), place);
    setEntered(next);
    setLayout(LAYOUT_OF[next]);
  }

  function exampleDone({ drills }: OpenedLesson) {
    const at = Date.now();
    recordLearned(opening, asUnit(unit), at);
    enter(drills.length > 0 ? 'practice' : 'summary', { page: 'practice', since: at, drills: drills.map((d) => positionKey(d.ref)) });
  }

  function drillDone(lesson: OpenedLesson, result: PauseOutcome) {
    const position = lesson.drills[given.length];
    const correct = result.verdict === 'found';
    const { ref } = position;
    const at = Date.now();
    recordDrill(opening, asUnit(unit), { key: positionKey(ref), correct, at });
    scheduleDrill({ opening, level: getSettings().levels[opening], drillSet: ref.set, gameId: ref.gameId, ply: ref.ply }, correct, at);
    setGiven([...given, { position, correct }]);
    if (given.length + 1 < lesson.drills.length) setLayout('ask');
    else enter('summary');
  }

  function body(lesson: OpenedLesson) {
    const { example, drills } = lesson;
    if (stage === 'summary') {
      const count = morePractice(course, asUnit(unit), getLessons(opening)[unit]);
      return (
        <Summary
          answers={answers}
          more={more}
          remember={lessonRemember(unit, example)}
          moreAction={count > 0 ? { label: `Practice ${count} more`, onClick: onMore } : undefined}
          onContinue={back}
        />
      );
    }
    if (stage === 'practice' && drills.length === 0) return <Notice text={NONE_LEFT} action={{ label: 'Back to the course', onClick: back }} />;
    const position = stage === 'example' ? example : drills[given.length];
    return (
      <>
        <div class="game-board">
          <Board fen={example.game.turns[example.turnIndex].fen} orientation={position.game.side} onReady={setBoard} />
        </div>
        <section class="game-slot">
          {board && stage === 'example' && (
            <Example
              board={board}
              position={example}
              beats={ownExample?.beats}
              label={ownExample?.label}
              onLayout={setLayout}
              onDone={() => exampleDone(lesson)}
            />
          )}
          {board && stage === 'practice' && (
            <Practice
              key={given.length}
              board={board}
              position={position}
              teaching={teaching}
              onStage={setLayout}
              onDone={(result) => drillDone(lesson, result)}
            />
          )}
        </section>
      </>
    );
  }

  const asked = answers.length + 1;
  const total = (opened?.answers.length ?? 0) + (opened?.drills.length ?? 0);
  const subtitle = {
    intro: `${OPENING_SHORT[opening]} lesson`,
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
          <h1 class="game-title">{lessonInfo(unit).title}</h1>
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
