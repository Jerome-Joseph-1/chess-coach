import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { lessonFor } from '../learn';
import { shake } from '../ui/motion';
import { celebrate, nudge } from '../ui/rewards';
import { COPY, continuesWith, holdMissHeadline, resultLine } from './copy';
import { CrossFade } from './CrossFade';
import {
  flowReducer,
  flowResult,
  initialState,
  replyUci,
  revealTurn,
  scriptedUci,
  stepNumber,
  stepTotal,
  type Feedback,
  type FlowContext,
  type FlowEvent,
  type FlowState,
  type Phase,
  type Verdict,
} from './flow';
import { hintButtonLabel, hintLadder, pieceInTrouble } from './hints';
import { revealSequence } from './lines';
import { BoardMarks } from './marks';
import { patternIcon } from './patterns';
import { moveBefore, samePosition, squaresOf } from './position';
import { eyebrowFor, promptFor, spotPromptFor } from './prompt';
import { leavePanel, Sheet } from './Sheet';
import { PlayActions, RevealActions } from './steps/Actions';
import { Question } from './steps/Question';
import { QuietReveal } from './steps/QuietReveal';
import { RevealStep } from './steps/RevealStep';
import { SpotChoices } from './steps/SpotChoices';

export type { Verdict };

export interface PauseResult {
  outcomes: StepOutcome[];
  /**
   * Index into game.moves of the scripted move at the pause position. The sheet has put the board
   * back on that position without playing the move, whatever it showed or asked in between;
   * the game plays that move and everything after it.
   */
  resumePly: number;
}

/** The result, and how it went for the mark on the pause's move. */
export interface PauseOutcome extends PauseResult {
  verdict: Verdict;
}

/** What the panel shows: a question, the answer, or the engine's look at a move of the answer. */
export type PauseStage = 'ask' | 'answer' | 'explore';

export interface PauseSheetProps {
  game: Game;
  /** Index into game.turns. */
  turnIndex: number;
  type: 'pause' | 'nothing';
  /** How far this player takes a pause: spot and play at 1 to 3, plus a follow-up move at 4, the whole line at 5. */
  depth: Depth;
  board: BoardController;
  onDone: (result: PauseOutcome) => void;
  /** Told whenever the panel changes stage, so the screen can make room for it. */
  onStage?: (stage: PauseStage) => void;
}

const REPLY_MS = 350;
/** A wrong answer's cross stays this long, then the piece snaps back. */
const WRONG_FLASH_MS = 600;
/** A right answer stays on screen this long before the flow moves on. */
const SETTLE_MS = 400;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function showPosition(board: BoardController, fen: string, animate: boolean): Promise<void> {
  return samePosition(board.fen(), fen) ? Promise.resolve() : board.setPosition(fen, animate);
}

function lessonLabel(game: Game, turnIndex: number) {
  const lesson = lessonFor(game, turnIndex);
  return { lesson, pattern: { name: lesson.name, icon: patternIcon(lesson.theme) } };
}

function buildReveal(ctx: FlowContext, state: FlowState) {
  const { game } = ctx;
  const index = revealTurn(ctx, state);
  const missedLate = state.missedUci !== null && index !== ctx.turnIndex;
  const scripted = game.moves[game.turns[state.turn].ply];
  const { lesson, pattern } = lessonLabel(game, ctx.turnIndex);
  return {
    sequence: revealSequence(game, index, state.missedUci),
    text: missedLate && state.missedUci ? holdMissHeadline(game, index, state.missedUci) : lesson.idea,
    lesson: missedLate ? undefined : { pattern, remember: lesson.remember },
    note: state.alt ? `${COPY.altNote} ${continuesWith(scripted)}` : undefined,
  };
}

/** The squares of the move that led into the pause: they stay bright while the board dims. */
function lastMoveSquares(game: Game, turnIndex: number): string[] {
  const move = moveBefore(game, game.turns[turnIndex].ply);
  return move ? [move.from, move.to] : [];
}

export function PauseSheet({ game, turnIndex, type, depth, board, onDone, onStage }: PauseSheetProps) {
  const ctx = useMemo<FlowContext>(() => ({ game, turnIndex, type, depth }), [game, turnIndex, type, depth]);
  const [state, setState] = useState(() => initialState(ctx));
  const [why, setWhy] = useState<number | null>(null);
  const [lineAt, setLineAt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const latest = useRef(state);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const marks = useMemo(() => new BoardMarks(board), [board]);
  const turn = game.turns[turnIndex];

  // Keeps showing the last real phase once the flow is done and the parent has not yet removed the sheet.
  const shown = useRef<Phase>(state.phase);
  if (state.phase !== 'done') shown.current = state.phase;
  const view = shown.current;
  const stage: PauseStage = view !== 'reveal' ? 'ask' : why === null ? 'answer' : 'explore';

  function send(event: FlowEvent): FlowState {
    const next = flowReducer(ctx, latest.current, event);
    latest.current = next;
    setState(next);
    return next;
  }

  /** Board callback: keep the piece when the move was right; a wrong one shows a cross, then snaps back. */
  function tryMove(uci: string): boolean | Promise<boolean> {
    const before = latest.current;
    const next = send({ type: 'move', uci });
    if (next === before) return false;
    const [, to] = squaresOf(uci);
    if (next.feedback?.kind !== 'wrong') {
      marks.badge(to, 'good');
      return true;
    }
    marks.badge(to, 'bad');
    return wait(WRONG_FLASH_MS).then(() => {
      marks.clearBadges();
      return false;
    });
  }

  /** Marks what the hint in hand shows on the board: the piece in trouble, then the move itself. */
  function showHint(at: FlowState) {
    if (at.hint < 2) return;
    const [from, to] = squaresOf(scriptedUci(game, at.turn));
    if (at.hint === 3) return board.arrow(from, to, 'best');
    const trouble = at.phase === 'solve' ? pieceInTrouble(game, at.turn) : null;
    board.highlight(trouble?.squares ?? [from], 'hint');
  }

  function react(feedback: Feedback) {
    switch (feedback.kind) {
      case 'spot':
        if (feedback.correct) return celebrate('step');
        nudge();
        return shake(choicesRef.current?.querySelector('.is-wrong'));
      case 'move': {
        const [, to] = squaresOf(feedback.uci);
        board.disableInput();
        board.clearHighlights();
        board.clearArrows();
        board.burst(to);
        return celebrate('move', board.squareCenter(to));
      }
      case 'alt':
        board.disableInput();
        board.clearHighlights();
        board.clearArrows();
        return celebrate('alt');
      case 'wrong':
        nudge();
        return shake(bubbleRef.current);
    }
  }

  useEffect(() => {
    if (state.feedback) react(state.feedback);
  }, [state.feedback]);

  useEffect(() => {
    if (!state.answered) return;
    const id = window.setTimeout(() => send({ type: 'advance' }), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [state.answered]);

  useEffect(() => {
    let current = true;
    const timers: number[] = [];
    board.disableInput();
    marks.clear();
    // The board dims around the move that led here while the coach asks whether it matters.
    board.dim(state.phase === 'spot' ? lastMoveSquares(game, turnIndex) : null);

    switch (state.phase) {
      case 'spot':
        void showPosition(board, turn.fen, true);
        break;
      case 'solve':
      case 'hold':
        board.enableMoves(game.side, tryMove);
        break;
      case 'reply':
        timers.push(
          window.setTimeout(async () => {
            await board.playMove(replyUci(game, state.turn));
            if (current) send({ type: 'replied' });
          }, REPLY_MS),
        );
        break;
      case 'done':
        void showPosition(board, turn.fen, false).then(() => {
          if (current) doneRef.current(flowResult(ctx, latest.current));
        });
        break;
    }
    return () => {
      current = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [state.phase, state.turn]);

  useEffect(() => showHint(state), [state.hint]);
  useEffect(() => onStage?.(stage), [stage]);

  useEffect(
    () => () => {
      board.disableInput();
      board.dim(null);
      marks.clear();
    },
    [],
  );

  const reveal = useMemo(() => (view === 'reveal' ? buildReveal(ctx, state) : null), [view]);
  const watchable = type === 'pause' && reveal !== null && reveal.sequence.steps.length > 0;

  function carryOn() {
    if (leaving) return;
    setLeaving(true);
    leavePanel(panelRef.current, () => send({ type: 'continue' }));
  }

  function question() {
    const step = stepNumber(ctx, view, state.turn);
    const common = { eyebrow: eyebrowFor(game, turnIndex), step, total: stepTotal(ctx), innerRef: bubbleRef };
    if (view === 'spot') {
      return <Question {...common} title={COPY.spotTitle} {...spotPromptFor(game, turnIndex, state)} />;
    }
    const prompt = promptFor(game, state);
    const named = state.hint > 0 && view === 'solve';
    return (
      <Question
        {...common}
        {...prompt}
        pattern={named ? lessonLabel(game, state.turn).pattern : undefined}
        ladder={hintLadder(state)}
      />
    );
  }

  function answer() {
    const result = resultLine(type, state.outcomes, state.hinted);
    if (type === 'nothing') {
      const { lesson, pattern } = lessonLabel(game, turnIndex);
      return <QuietReveal result={result} text={lesson.idea} remember={lesson.remember} pattern={pattern} />;
    }
    if (!reveal) return null;
    return (
      <RevealStep
        board={board}
        userSide={game.side}
        sequence={reveal.sequence}
        result={result}
        headline={reveal.text}
        lesson={reveal.lesson}
        note={reveal.note}
        frozen={state.phase === 'done'}
        why={why}
        replayable={watchable}
        onStep={setLineAt}
        onLine={() => setWhy(null)}
      />
    );
  }

  function actions() {
    if (view === 'spot') {
      return (
        <SpotChoices
          innerRef={choicesRef}
          expectYes={type === 'pause'}
          picked={state.spotUp}
          settled={state.answered}
          onAnswer={(yes) => send({ type: 'spot', up: yes })}
        />
      );
    }
    if (view === 'reveal') {
      const onWhy = watchable && why === null ? () => setWhy(lineAt) : undefined;
      return <RevealActions onContinue={carryOn} onWhy={onWhy} whyDisabled={lineAt === 0} />;
    }
    const ladder = hintLadder(state);
    return (
      <PlayActions
        hintLabel={hintButtonLabel(ladder)}
        hintsLeft={ladder.used < ladder.stops.length}
        disabled={state.answered || view === 'reply'}
        onHint={() => send({ type: 'hint' })}
        onSolution={() => send({ type: 'solution' })}
      />
    );
  }

  const dockKind = view === 'reveal' ? `reveal-${stage}` : view === 'spot' ? 'spot' : 'play';
  return (
    <Sheet
      innerRef={panelRef}
      label="Pause"
      stage={stage}
      footer={
        <CrossFade value={dockKind} class="dock-fade">
          {actions()}
        </CrossFade>
      }
    >
      {view === 'reveal' ? answer() : question()}
    </Sheet>
  );
}
