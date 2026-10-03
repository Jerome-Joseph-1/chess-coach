import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController, Tone } from '../../board/types';
import { lessonFor } from '../../learn';
import { walkthrough, type Beat } from '../../learn/walkthrough';
import { CoachBubble, PatternLabel, StepDots } from '../../pause/Coach';
import { COPY } from '../../pause/copy';
import { CrossFade } from '../../pause/CrossFade';
import { DockButton, RoundButton } from '../../pause/Dock';
import { LineStepper } from '../../pause/LineStepper';
import { lineSequence } from '../../pause/lines';
import { BoardMarks } from '../../pause/marks';
import { patternIcon } from '../../pause/patterns';
import { fenAfter, samePosition, squaresOf } from '../../pause/position';
import { Sheet } from '../../pause/Sheet';
import { Remember } from '../../pause/steps/Result';
import { shake } from '../../ui/motion';
import { celebrate, nudge } from '../../ui/rewards';
import type { LessonPosition } from '../select';

/** The steps of the example, or the line that ends it: the board steps back for the line, as on the answer. */
export type ExampleLayout = 'example' | 'line';

export interface ExampleProps {
  board: BoardController;
  position: LessonPosition;
  onLayout: (layout: ExampleLayout) => void;
  onDone: () => void;
}

const TONES: Tone[] = ['focus', 'good', 'bad', 'hint'];
/** A wrong move's cross stays this long, then the piece goes back. */
const WRONG_FLASH_MS = 600;
/** A right move stays on screen this long before the next step. */
const SETTLE_MS = 400;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Brings the board to the beat's position: slides its move when one move away, else moves the pieces across. */
function reach(board: BoardController, beat: Beat): Promise<void> {
  const now = board.fen();
  if (samePosition(now, beat.fen)) return Promise.resolve();
  if (beat.move && samePosition(fenAfter(now, [beat.move]), beat.fen)) return board.playMove(beat.move);
  return board.setPosition(beat.fen, true);
}

function draw(board: BoardController, beat: Beat): void {
  for (const tone of TONES) {
    const squares = beat.marks.filter((m) => m.tone === tone).map((m) => m.square);
    if (squares.length) board.highlight(squares, tone);
  }
  for (const { from, to, tone } of beat.arrows) board.arrow(from, to, tone);
}

/**
 * The worked example: the coach steps through what to see on the board, waits for the key move when a step
 * asks for it, then plays the line on like the answer screen and gives the takeaway.
 */
export function Example({ board, position, onLayout, onDone }: ExampleProps) {
  const { game, turnIndex } = position;
  const beats = useMemo(() => walkthrough(game, turnIndex), [game, turnIndex]);
  const lesson = useMemo(() => lessonFor(game, turnIndex), [game, turnIndex]);
  const marks = useMemo(() => new BoardMarks(board), [board]);
  const [at, setAt] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [lineDone, setLineDone] = useState(false);
  const [lineAt, setLineAt] = useState(0);
  const busy = useRef(false);
  /** A wrong move on its way back; the board takes nothing else until it is. */
  const refusing = useRef<Promise<unknown>>(Promise.resolve());
  const atRef = useRef(at);
  atRef.current = at;
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const beat = beats[at];
  const line = beat.line;
  const sequence = useMemo(() => line && lineSequence(beat.fen, line, 'best'), [beat]);
  const playable = sequence !== undefined && sequence.steps.length > 0;
  // Until the line stands played at its end, the stepper's next button is the one to press.
  const lineOver = !playable || (lineDone && lineAt === sequence.steps.length);

  useEffect(() => onLayout(line ? 'line' : 'example'), [line !== undefined]);

  useEffect(() => {
    let current = true;
    board.disableInput();
    marks.clear();
    void reach(board, beat).then(() => {
      if (!current || line) return;
      draw(board, beat);
      if (beat.ask) board.enableMoves(game.side, tryMove);
    });
    return () => {
      current = false;
    };
  }, [at]);

  useEffect(
    () => () => {
      board.disableInput();
      marks.clear();
    },
    [],
  );

  function goTo(next: number) {
    busy.current = false;
    setWrong(false);
    setLineDone(false);
    setLineAt(0);
    setAt(Math.max(0, Math.min(beats.length - 1, next)));
  }

  /** Board callback for an asking step: the right move stays and the example moves on; any other goes back. */
  function tryMove(uci: string): boolean | Promise<boolean> {
    const [, to] = squaresOf(uci);
    if (uci !== beat.answer) {
      marks.badge(to, 'bad');
      setWrong(true);
      nudge();
      shake(bubbleRef.current);
      const back = wait(WRONG_FLASH_MS).then(() => {
        marks.clearBadges();
        return false;
      });
      refusing.current = back;
      return back;
    }
    board.disableInput();
    board.clearArrows();
    board.clearHighlights();
    marks.badge(to, 'good');
    celebrate('move', board.squareCenter(to));
    busy.current = true;
    window.setTimeout(() => atRef.current === at && goTo(at + 1), SETTLE_MS);
    return true;
  }

  async function showMe() {
    if (busy.current || !beat.answer) return;
    busy.current = true;
    board.disableInput();
    board.clearArrows();
    await refusing.current;
    await reach(board, beat);
    await board.playMove(beat.answer);
    if (atRef.current === at) goTo(at + 1);
  }

  function steps() {
    return (
      <CoachBubble
        tone={wrong ? 'error' : 'neutral'}
        eyebrow={wrong ? COPY.tryAgain : 'Worked example'}
        result={wrong}
        aside={<StepDots step={at + 1} total={beats.length} />}
        body={beat.text}
        live
        innerRef={bubbleRef}
      >
        {beat.ask && <p class="lesson-ask rise-in">{beat.ask}</p>}
      </CoachBubble>
    );
  }

  function ending() {
    const pattern = { name: lesson.name, icon: patternIcon(lesson.theme) };
    return (
      <div class="pause-answer">
        {playable && (
          <LineStepper board={board} userSide={game.side} sequence={sequence} replayable onStep={setLineAt} onFinished={() => setLineDone(true)} />
        )}
        <CoachBubble
          tone="neutral"
          eyebrow="Worked example"
          aside={
            <span class="pattern-in">
              <PatternLabel {...pattern} />
            </span>
          }
          body={beat.text}
        />
        <Remember text={lesson.remember} shown={lineDone || !playable} />
      </div>
    );
  }

  function actions() {
    const back = <RoundButton icon="chevron-left" label="Previous step" disabled={at === 0} onClick={() => goTo(at - 1)} />;
    if (line) {
      return (
        <div class="dock-row">
          {back}
          <DockButton look="primary" wide nudge={lineOver} label={COPY.next} onClick={onDone} />
        </div>
      );
    }
    return (
      <div class="dock-row">
        {back}
        {beat.ask ? (
          <DockButton look="secondary" wide icon="eye" label="Show me" onClick={showMe} />
        ) : (
          <DockButton look="primary" wide nudge label="Next" onClick={() => goTo(at + 1)} />
        )}
      </div>
    );
  }

  const dock = line ? 'line' : beat.ask ? 'ask' : 'step';
  return (
    <Sheet
      innerRef={panelRef}
      label="Worked example"
      stage={line ? 'line' : 'steps'}
      footer={
        <CrossFade value={dock} class="dock-fade">
          {actions()}
        </CrossFade>
      }
    >
      {line ? ending() : steps()}
    </Sheet>
  );
}
