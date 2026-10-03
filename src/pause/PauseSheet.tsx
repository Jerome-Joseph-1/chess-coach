import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { celebrate, nudge } from '../ui/rewards';
import { COPY, continuesWith, headline, holdMissHeadline, resultLine } from './copy';
import {
  finalFen,
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
} from './flow';
import { openingLine, revealLines } from './lines';
import { samePosition, squaresOf } from './position';
import { promptFor, skipLabel, spotPromptFor } from './prompt';
import { Sheet } from './Sheet';
import { RevealActions, SkipAction } from './steps/Actions';
import { PromptStep } from './steps/PromptStep';
import { QuietReveal } from './steps/QuietReveal';
import { RevealStep } from './steps/RevealStep';
import { SpotStep } from './steps/SpotStep';
import { StepHeader } from './steps/StepHeader';

export interface PauseResult {
  outcomes: StepOutcome[];
  /** Index into game.moves where the game resumes after the pause and its play-out. */
  resumePly: number;
}

export interface PauseSheetProps {
  game: Game;
  /** Index into game.turns. */
  turnIndex: number;
  type: 'pause' | 'nothing';
  /** How far this player takes a pause: 1 Notice, 2 Point, 3 Play, 4 Follow through, 5 Finish. */
  depth: Depth;
  board: BoardController;
  onDone: (result: PauseResult) => void;
}

const REPLY_MS = 500;
const WRONG_FLASH_MS = 450;

function showPosition(board: BoardController, fen: string, animate: boolean): Promise<void> {
  return samePosition(board.fen(), fen) ? Promise.resolve() : board.setPosition(fen, animate);
}

/** How long a settled answer stays on screen before the flow moves on. */
function settleMs(state: FlowState): number {
  switch (state.feedback?.kind) {
    case 'hint':
      return 1300;
    case 'alt':
      return 1500;
    case 'move':
      return state.next === 'reply' ? 550 : 1400;
    case 'wrong':
      return 900;
    default:
      return 700;
  }
}

function buildReveal(ctx: FlowContext, state: FlowState) {
  const { game } = ctx;
  const index = revealTurn(ctx, state);
  const turn = game.turns[index];
  const missedLate = state.missedUci !== null && index !== ctx.turnIndex;
  const scripted = game.moves[game.turns[state.turn].ply];
  return {
    fen: turn.fen,
    lines: revealLines(game, index, state.missedUci, missedLate ? 'refutation' : 'yours'),
    initial: missedLate ? ('refutation' as const) : openingLine(turn),
    text: missedLate && state.missedUci ? holdMissHeadline(game, index, state.missedUci) : headline(game, index),
    note: state.alt ? `${COPY.altNote} ${continuesWith(scripted)}` : undefined,
  };
}

export function PauseSheet({ game, turnIndex, type, depth, board, onDone }: PauseSheetProps) {
  const ctx = useMemo<FlowContext>(() => ({ game, turnIndex, type, depth }), [game, turnIndex, type, depth]);
  const [state, setState] = useState(() => initialState(ctx));
  const latest = useRef(state);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const sheetRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const flash = useRef(0);
  const turn = game.turns[turnIndex];

  // Keeps showing the last real phase once the flow is done and the parent has not yet removed the sheet.
  const shown = useRef<Phase>(state.phase);
  if (state.phase !== 'done') shown.current = state.phase;
  const view = shown.current;

  function send(event: FlowEvent): FlowState {
    const next = flowReducer(ctx, latest.current, event);
    latest.current = next;
    setState(next);
    return next;
  }

  /** Board callback: keep the piece only when the move was right. */
  function tryMove(uci: string): boolean {
    const before = latest.current;
    const next = send({ type: 'move', uci });
    const kind = next.feedback?.kind;
    return next !== before && kind !== 'wrong' && kind !== 'gentle';
  }

  function react(feedback: Feedback) {
    window.clearTimeout(flash.current);
    switch (feedback.kind) {
      case 'spot':
        if (feedback.correct) celebrate('step');
        else nudge(sheetRef.current?.querySelector<HTMLElement>('.pause-choices'));
        break;
      case 'find':
        board.clearHighlights();
        board.highlight([feedback.square], feedback.correct ? 'good' : 'bad');
        if (feedback.correct) {
          celebrate('step');
        } else {
          nudge(shakeRef.current);
          flash.current = window.setTimeout(() => board.clearHighlights(), WRONG_FLASH_MS);
        }
        break;
      case 'hint':
        board.clearHighlights();
        board.highlight(turn.keySquares, 'hint');
        nudge(shakeRef.current);
        break;
      case 'move':
        board.disableInput();
        board.clearHighlights();
        celebrate('move', board.squareCenter(squaresOf(feedback.uci)[1]));
        break;
      case 'alt':
        board.disableInput();
        board.clearHighlights();
        celebrate('alt');
        break;
      case 'guided':
        board.disableInput();
        celebrate('step');
        break;
      case 'wrong':
        if (latest.current.answered) board.disableInput();
        nudge(shakeRef.current);
        break;
      case 'gentle':
        nudge(shakeRef.current);
        break;
    }
  }

  useEffect(() => {
    if (state.feedback) react(state.feedback);
  }, [state.feedback]);

  useEffect(() => {
    if (!state.answered) return;
    const id = window.setTimeout(() => send({ type: 'advance' }), settleMs(state));
    return () => window.clearTimeout(id);
  }, [state.answered]);

  useEffect(() => {
    let current = true;
    const timers: number[] = [];
    const at = game.turns[state.turn];
    board.disableInput();
    board.clearHighlights();

    switch (state.phase) {
      case 'spot':
        void showPosition(board, turn.fen, true);
        break;
      case 'find':
        board.enableSquareTaps((square) => send({ type: 'tap', square }));
        break;
      case 'solve':
      case 'hold':
        if (state.phase === 'solve' && state.picked) board.highlight([state.picked], 'focus');
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
      case 'guided':
        void showPosition(board, at.fen, true).then(() => {
          if (!current) return;
          board.highlight(squaresOf(scriptedUci(game, state.turn)), 'hint');
          board.enableMoves(game.side, tryMove);
        });
        break;
      case 'done':
        void showPosition(board, finalFen(ctx, state), true).then(() => {
          if (current) doneRef.current(flowResult(ctx, latest.current));
        });
        break;
    }
    return () => {
      current = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [state.phase, state.turn]);

  useEffect(
    () => () => {
      window.clearTimeout(flash.current);
      board.disableInput();
      board.clearHighlights();
    },
    [],
  );

  const reveal = useMemo(() => (view === 'reveal' ? buildReveal(ctx, state) : null), [view, state.attempt]);

  function content() {
    const step = stepNumber(view);
    const header = step && <StepHeader step={step} total={stepTotal(ctx)} />;
    if (view === 'spot') {
      const { sub, right } = spotPromptFor(game, turnIndex, state);
      return (
        <>
          {header}
          <SpotStep sub={sub} right={right} expectYes={type === 'pause'} picked={state.spotUp} onAnswer={(yes) => send({ type: 'spot', up: yes })} />
        </>
      );
    }
    if (view === 'reveal') return revealContent();
    return (
      <>
        {header}
        <PromptStep {...promptFor(game, state)} innerRef={shakeRef} />
      </>
    );
  }

  function footer() {
    if (view === 'reveal') {
      const retry = type === 'pause' ? () => send({ type: 'retry' }) : undefined;
      return <RevealActions onRetry={retry} onContinue={() => send({ type: 'continue' })} />;
    }
    const label = skipLabel(view);
    return label && <SkipAction label={label} disabled={state.answered} onSkip={() => send({ type: 'skip' })} />;
  }

  function revealContent() {
    const result = resultLine(type, depth, state.outcomes);
    if (type === 'nothing') {
      return <QuietReveal result={result} text={headline(game, turnIndex)} />;
    }
    if (!reveal) return null;
    return (
      <RevealStep
        key={state.attempt}
        board={board}
        userSide={game.side}
        homeFen={reveal.fen}
        lines={reveal.lines}
        initialLine={reveal.initial}
        result={result}
        headline={reveal.text}
        note={reveal.note}
        practice={state.attempt > 0}
        frozen={state.phase === 'done'}
      />
    );
  }

  return (
    <Sheet innerRef={sheetRef} label="Pause" footer={footer()}>
      <div class="pause-phase" key={`${view}-${state.turn}-${state.attempt}`}>
        {content()}
      </div>
    </Sheet>
  );
}
