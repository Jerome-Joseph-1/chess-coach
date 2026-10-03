import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { celebrate, nudge } from '../ui/rewards';
import { COPY, continuesWith, headline, holdMissHeadline, resultLine } from './copy';
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
} from './flow';
import { revealSequence } from './lines';
import { BoardMarks } from './marks';
import { samePosition, squaresOf } from './position';
import { hintLabel, promptFor, spotPromptFor } from './prompt';
import { Sheet } from './Sheet';
import { RevealActions, TextLink } from './steps/Actions';
import { PromptStep } from './steps/PromptStep';
import { QuietReveal } from './steps/QuietReveal';
import { RevealStep } from './steps/RevealStep';
import { SpotStep } from './steps/SpotStep';
import { StepHeader } from './steps/StepHeader';

export interface PauseResult {
  outcomes: StepOutcome[];
  /**
   * Index into game.moves of the scripted move at the pause position. The sheet has put the board
   * back on that position without playing the move, whatever it showed or asked in between;
   * the game plays that move and everything after it.
   */
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

const REPLY_MS = 350;
/** A wrong answer's cross stays this long, then the piece snaps back. */
const WRONG_FLASH_MS = 600;
/** A right answer stays on screen this long before the flow moves on. */
const SETTLE_MS = 400;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function showPosition(board: BoardController, fen: string, animate: boolean): Promise<void> {
  return samePosition(board.fen(), fen) ? Promise.resolve() : board.setPosition(fen, animate);
}

/** How long a settled answer stays on screen before the flow moves on. */
function settleMs(state: FlowState): number {
  return state.feedback?.kind === 'wrong' ? WRONG_FLASH_MS : SETTLE_MS;
}

function buildReveal(ctx: FlowContext, state: FlowState) {
  const { game } = ctx;
  const index = revealTurn(ctx, state);
  const missedLate = state.missedUci !== null && index !== ctx.turnIndex;
  const scripted = game.moves[game.turns[state.turn].ply];
  return {
    sequence: revealSequence(game, index, state.missedUci),
    text: missedLate && state.missedUci ? holdMissHeadline(game, index, state.missedUci) : headline(game, index),
    note: state.alt ? `${COPY.altNote} ${continuesWith(scripted)}` : undefined,
  };
}

export function PauseSheet({ game, turnIndex, type, depth, board, onDone }: PauseSheetProps) {
  const ctx = useMemo<FlowContext>(() => ({ game, turnIndex, type, depth }), [game, turnIndex, type, depth]);
  const [state, setState] = useState(() => initialState(ctx));
  const [replays, setReplays] = useState(0);
  const latest = useRef(state);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const sheetRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const flash = useRef(0);
  const marks = useMemo(() => new BoardMarks(board), [board]);
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

  /** Marks what the hint in hand shows: the piece, then the move itself. */
  function showHint(at: FlowState) {
    if (at.hint === 0) return;
    if (at.phase === 'find') {
      board.highlight(game.turns[at.turn].keySquares, 'hint');
      return;
    }
    const [from, to] = squaresOf(scriptedUci(game, at.turn));
    if (at.hint === 1) board.highlight([from], 'hint');
    else board.arrow(from, to, 'best');
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
        marks.clearBadges();
        board.highlight([feedback.square], feedback.correct ? 'good' : 'bad');
        marks.badge(feedback.square, feedback.correct ? 'good' : 'bad');
        if (feedback.correct) {
          celebrate('step');
        } else {
          nudge(shakeRef.current);
          flash.current = window.setTimeout(() => {
            board.clearHighlights();
            marks.clearBadges();
            showHint(latest.current);
          }, WRONG_FLASH_MS);
        }
        break;
      case 'move':
        board.disableInput();
        board.clearHighlights();
        board.clearArrows();
        celebrate('move', board.squareCenter(squaresOf(feedback.uci)[1]));
        break;
      case 'alt':
        board.disableInput();
        board.clearHighlights();
        board.clearArrows();
        celebrate('alt');
        break;
      case 'wrong':
        if (latest.current.answered) board.disableInput();
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
    board.disableInput();
    marks.clear();

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
      case 'done':
        board.dim(null);
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

  useEffect(
    () => () => {
      window.clearTimeout(flash.current);
      board.disableInput();
      marks.clear();
    },
    [],
  );

  const reveal = useMemo(() => (view === 'reveal' ? buildReveal(ctx, state) : null), [view]);

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
      const watchable = type === 'pause' && reveal !== null && reveal.sequence.steps.length > 0;
      const replay = watchable ? () => setReplays((n) => n + 1) : undefined;
      return <RevealActions onContinue={() => send({ type: 'continue' })} onReplay={replay} />;
    }
    const label = hintLabel(state);
    return label && <TextLink label={label} disabled={state.answered} onClick={() => send({ type: 'hint' })} />;
  }

  function revealContent() {
    const result = resultLine(type, depth, state.outcomes, state.hinted);
    if (type === 'nothing') {
      return <QuietReveal result={result} text={headline(game, turnIndex)} />;
    }
    if (!reveal) return null;
    return (
      <RevealStep
        board={board}
        userSide={game.side}
        sequence={reveal.sequence}
        result={result}
        headline={reveal.text}
        note={reveal.note}
        frozen={state.phase === 'done'}
        replays={replays}
      />
    );
  }

  return (
    <Sheet innerRef={sheetRef} label="Pause" footer={footer()}>
      <div class="pause-phase" key={`${view}-${state.turn}`}>
        {content()}
      </div>
    </Sheet>
  );
}
