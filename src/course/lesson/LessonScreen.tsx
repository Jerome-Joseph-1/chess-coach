import { useEffect, useState } from 'preact/hooks';
import { Board } from '../../board/Board';
import type { BoardController } from '../../board/types';
import type { OpeningId } from '../../content/types';
import { lessonFor } from '../../learn';
import { CrossFade } from '../../pause/CrossFade';
import { boardSize } from '../../pause/fit';
import type { PauseOutcome, PauseStage } from '../../pause/PauseSheet';
import { Icon } from '../../pause/steps/icons';
import { getSettings, recordDrill, recordLearned, recordLessonDone, scheduleDrill } from '../../progress/store';
import { navigate } from '../../router';
import { pickLesson, type LessonPositions } from '../select';
import { positionKey, type UnitId } from '../types';
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

type Stage = 'intro' | 'example' | 'practice' | 'summary';
/** What the screen shows, which sets the board's size, as on the game screen. */
type Layout = 'intro' | ExampleLayout | PauseStage | 'summary';

const LAYOUT_OF: Record<Stage, Layout> = { intro: 'intro', example: 'example', practice: 'ask', summary: 'summary' };

/** The unit's example and practice positions: undefined while they load, null when there is no lesson to give. */
function useLesson(opening: OpeningId, unit: UnitId): LessonPositions | null | undefined {
  const course = useCourse(opening, getSettings().levels[opening]);
  const [lesson, setLesson] = useState<LessonPositions | null>();
  useEffect(() => {
    if (course === undefined) return;
    let current = true;
    const picked = course ? pickLesson(course, unit).catch(() => null) : Promise.resolve(null);
    void picked.then((found) => current && setLesson(found));
    return () => {
      current = false;
    };
  }, [course]);
  return lesson;
}

const back = () => navigate('/course');

/** A unit's lesson: what the pattern is, a worked example, then practice positions and a summary. */
export function LessonScreen({ opening, unit }: LessonScreenProps) {
  const lesson = useLesson(opening, unit);
  const [stage, setStage] = useState<Stage>('intro');
  const [layout, setLayout] = useState<Layout>('intro');
  const [drillAt, setDrillAt] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [board, setBoard] = useState<BoardController | null>(null);

  useEffect(() => {
    if (stage === 'summary') recordLessonDone(opening, unit, Date.now());
  }, [stage]);

  function enter(next: Stage) {
    setStage(next);
    setLayout(LAYOUT_OF[next]);
  }

  function exampleDone(drills: number) {
    recordLearned(opening, unit, Date.now());
    enter(drills > 0 ? 'practice' : 'summary');
  }

  function drillDone({ drills }: LessonPositions, result: PauseOutcome) {
    const correct = result.verdict === 'found';
    const { ref } = drills[drillAt];
    const at = Date.now();
    recordDrill(opening, unit, { key: positionKey(ref), correct, at });
    scheduleDrill({ opening, level: getSettings().levels[opening], drillSet: ref.set, gameId: ref.gameId, ply: ref.ply }, correct, at);
    setResults((all) => [...all, correct]);
    if (drillAt + 1 < drills.length) {
      setDrillAt(drillAt + 1);
      setLayout('ask');
    } else {
      enter('summary');
    }
  }

  function body(found: LessonPositions) {
    const { example, drills } = found;
    if (stage === 'summary') {
      const score = { right: results.filter(Boolean).length, total: results.length };
      return <Summary score={score} remember={lessonFor(example.game, example.turnIndex).remember} onContinue={back} />;
    }
    const position = stage === 'example' ? example : drills[drillAt];
    return (
      <>
        <div class="game-board">
          <Board fen={example.game.turns[example.turnIndex].fen} orientation={position.game.side} onReady={setBoard} />
        </div>
        <section class="game-slot">
          {board && stage === 'example' && (
            <Example board={board} position={example} onLayout={setLayout} onDone={() => exampleDone(drills.length)} />
          )}
          {board && stage === 'practice' && (
            <Practice key={drillAt} board={board} position={position} onStage={setLayout} onDone={(result) => drillDone(found, result)} />
          )}
        </section>
      </>
    );
  }

  const subtitle = {
    intro: 'Lesson',
    example: 'Worked example',
    practice: `Practice ${drillAt + 1} of ${lesson?.drills.length ?? 0}`,
    summary: 'Summary',
  }[stage];
  const mode = lesson === null ? 'intro' : layout;
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
      {lesson === null ? (
        <Notice text="This lesson could not be loaded. Check your connection, then try again." action={{ label: 'Back to the course', onClick: back }} />
      ) : stage === 'intro' ? (
        <Intro unit={unit} action={lesson && { label: 'Show me an example', onClick: () => enter('example') }} />
      ) : (
        body(lesson!)
      )}
    </main>
  );
}
