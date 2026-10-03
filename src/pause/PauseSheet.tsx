import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { confirm, nudge, toast } from '../ui/rewards';
import {
  COPY,
  continuesWith,
  findToast,
  guidedTitle,
  headline,
  holdMissHeadline,
  holdSub,
  quietReveal,
  replySub,
  spotSub,
} from './copy';
import {
  finalFen,
  flowReducer,
  flowResult,
  initialState,
  replyUci,
  revealTurn,
  scriptedUci,
  type Feedback,
  type FlowContext,
  type FlowEvent,
  type FlowState,
  type Phase,
} from './flow';
import { openingLine, revealLines } from './lines';
import { samePosition, squaresOf } from './position';
import { Sheet } from './Sheet';
import { PromptStep } from './steps/PromptStep';
import { QuietReveal } from './steps/QuietReveal';
import { RevealStep } from './steps/RevealStep';
import { SpotStep } from './steps/SpotStep';

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
      return state.next === 'reply' ? 550 : 1000;
    case 'wrong':
      return 900;
    default:
      return 700;
  }
}

function findSub(state: FlowState): string {
  if (state.feedback?.kind === 'hint') return COPY.findHint;
  if (state.answered) return COPY.findRight;
  return state.tries > 0 ? COPY.findRetry : COPY.findSub;
}

function moveSub(ask: string, state: FlowState): string {
  if (state.answered) return state.feedback?.kind === 'wrong' ? COPY.notQuite : ask;
  return state.tries > 0 ? COPY.oneMore : ask;
}

/** Title and one line for the stages that play on the board. */
function promptFor(game: Game, state: FlowState): { title: string; sub: string } {
  const scripted = game.moves[game.turns[state.turn].ply];
  switch (state.phase) {
    case 'find':
      return { title: COPY.findTitle, sub: findSub(state) };
    case 'solve':
      return { title: COPY.solveTitle, sub: moveSub(COPY.solveSub, state) };
    case 'hold':
      return { title: COPY.holdTitle, sub: moveSub(holdSub(game), state) };
    case 'reply':
      return { title: COPY.holdTitle, sub: replySub(game) };
    default:
      return { title: guidedTitle(scripted), sub: COPY.solveSub };
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
    note: state.alt ? `${COPY.altToast} ${continuesWith(scripted)}` : undefined,
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
        if (feedback.correct) confirm('step');
        else nudge(sheetRef.current?.querySelector<HTMLElement>('.pause-choices'));
        break;
      case 'find':
        board.clearHighlights();
        board.highlight([feedback.square], feedback.correct ? 'good' : 'bad');
        if (feedback.correct) {
          confirm('step', board.squareCenter(feedback.square));
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
        confirm('move', board.squareCenter(squaresOf(feedback.uci)[1]));
        if (latest.current.phase === 'solve') toast(findToast(game.turns[feedback.turn], game.level));
        break;
      case 'alt':
        board.disableInput();
        confirm('step', board.squareCenter(squaresOf(feedback.uci)[1]));
        toast(COPY.altToast);
        break;
      case 'guided':
        board.disableInput();
        confirm('step', board.squareCenter(squaresOf(feedback.uci)[1]));
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

  const sub = useMemo(() => spotSub(game, turnIndex), [game, turnIndex]);
  const reveal = useMemo(() => (view === 'reveal' ? buildReveal(ctx, state) : null), [view, state.attempt]);

  function content() {
    if (view === 'spot') {
      return <SpotStep sub={sub} expectYes={type === 'pause'} picked={state.spotUp} onAnswer={(yes) => send({ type: 'spot', up: yes })} />;
    }
    if (view === 'reveal' && type === 'nothing') {
      return (
        <QuietReveal text={quietReveal(state.spotUp === true)} right={state.spotUp === false} onContinue={() => send({ type: 'continue' })} />
      );
    }
    if (view === 'reveal' && reveal) {
      return (
        <RevealStep
          key={state.attempt}
          board={board}
          userSide={game.side}
          homeFen={reveal.fen}
          lines={reveal.lines}
          initialLine={reveal.initial}
          headline={reveal.text}
          note={reveal.note}
          practice={state.attempt > 0}
          frozen={state.phase === 'done'}
          onRetry={() => send({ type: 'retry' })}
          onContinue={() => send({ type: 'continue' })}
        />
      );
    }
    const { title, sub: line } = promptFor(game, state);
    return <PromptStep title={title} sub={line} innerRef={shakeRef} />;
  }

  return (
    <Sheet innerRef={sheetRef} label="Pause">
      <div class="pause-phase" key={`${view}-${state.turn}-${state.attempt}`}>
        {content()}
      </div>
    </Sheet>
  );
}
