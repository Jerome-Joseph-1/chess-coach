import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { Button } from '../ui/Button';
import { celebrate, nudge, toast } from '../ui/rewards';
import { COPY, continuesWith, findToast, guidedPrompt, headline, holdMissHeadline, percent } from './copy';
import {
  finalFen,
  flowReducer,
  flowResult,
  initialState,
  plannedSteps,
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
import { samePosition, sanOf, squaresOf } from './position';
import { Sheet } from './Sheet';
import { PromptBar } from './steps/PromptBar';
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
  depth: Depth;
  board: BoardController;
  onDone: (result: PauseResult) => void;
}

const REPLY_MS = 500;
const WRONG_FLASH_MS = 450;
const BAR_PHASES: Phase[] = ['find', 'solve', 'hold', 'reply', 'guided'];

function showPosition(board: BoardController, fen: string, animate: boolean): Promise<void> {
  return samePosition(board.fen(), fen) ? Promise.resolve() : board.setPosition(fen, animate);
}

function centerOf(el: Element | null | undefined) {
  const box = el?.getBoundingClientRect();
  return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 };
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

function barTone(state: FlowState): 'good' | 'bad' | undefined {
  if (!state.answered) return undefined;
  switch (state.feedback?.kind) {
    case 'find':
    case 'move':
    case 'alt':
    case 'guided':
      return 'good';
    case 'wrong':
      return 'bad';
    default:
      return undefined;
  }
}

function barText(game: Game, state: FlowState): string {
  const scripted = game.moves[game.turns[state.turn].ply];
  const kind = state.feedback?.kind;
  switch (state.phase) {
    case 'find':
      if (kind === 'hint') return COPY.findHint;
      if (state.answered) return COPY.findDone;
      return state.tries > 0 ? COPY.findRetry : COPY.findPrompt;
    case 'reply':
      return COPY.replying;
    case 'guided':
      return guidedPrompt(scripted);
    default:
      if (kind === 'alt') return continuesWith(scripted);
      if (state.answered) return kind === 'wrong' ? COPY.missed : COPY.solved;
      if (state.tries > 0) return COPY.retry;
      return state.phase === 'hold' ? COPY.holdPrompt : COPY.solvePrompt;
  }
}

function buildReveal(ctx: FlowContext, state: FlowState) {
  const { game } = ctx;
  const index = revealTurn(ctx, state);
  const turn = game.turns[index];
  const missedLate = state.missedUci !== null && index !== ctx.turnIndex;
  const lines = revealLines(game, index, state.missedUci, missedLate ? 'refutation' : 'yours');
  const scripted = game.moves[game.turns[state.turn].ply];
  return {
    fen: turn.fen,
    lines,
    initial: missedLate ? ('refutation' as const) : openingLine(turn),
    text: missedLate && state.missedUci ? holdMissHeadline(game, index, state.missedUci) : headline(game, index),
    note: state.alt ? `${COPY.altToast}. ${continuesWith(scripted)}` : undefined,
  };
}

export function PauseSheet({ game, turnIndex, type, depth, board, onDone }: PauseSheetProps) {
  const ctx = useMemo<FlowContext>(() => ({ game, turnIndex, type, depth }), [game, turnIndex, type, depth]);
  const [state, setState] = useState(() => initialState(ctx));
  const latest = useRef(state);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const sheetRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
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

  async function playForMe() {
    const uci = scriptedUci(game, latest.current.turn);
    board.disableInput();
    await board.playMove(uci);
    send({ type: 'move', uci });
  }

  function react(feedback: Feedback) {
    window.clearTimeout(flash.current);
    switch (feedback.kind) {
      case 'spot':
        if (feedback.correct) celebrate('step', centerOf(sheetRef.current?.querySelector('.pause-answer.is-picked')));
        else nudge(sheetRef.current?.querySelector<HTMLElement>('.pause-answers'));
        break;
      case 'find':
        board.clearHighlights();
        board.highlight([feedback.square], feedback.correct ? 'good' : 'bad');
        if (feedback.correct) {
          celebrate('step', board.squareCenter(feedback.square));
        } else {
          nudge(barRef.current);
          flash.current = window.setTimeout(() => board.clearHighlights(), WRONG_FLASH_MS);
        }
        break;
      case 'hint':
        board.clearHighlights();
        board.highlight(turn.keySquares, 'hint');
        nudge(barRef.current);
        break;
      case 'move':
        board.disableInput();
        celebrate('move', board.squareCenter(squaresOf(feedback.uci)[1]));
        toast(findToast(game.turns[feedback.turn], game.level));
        break;
      case 'alt':
        board.disableInput();
        celebrate('alt', board.squareCenter(squaresOf(feedback.uci)[1]));
        toast(COPY.altToast);
        break;
      case 'guided':
        board.disableInput();
        celebrate('step', board.squareCenter(squaresOf(feedback.uci)[1]));
        break;
      case 'wrong':
        if (latest.current.answered) board.disableInput();
        nudge(barRef.current);
        break;
      case 'gentle':
        nudge(barRef.current);
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

  const planned = plannedSteps(ctx);
  const reveal = useMemo(() => (view === 'reveal' ? buildReveal(ctx, state) : null), [view, state.attempt]);

  function content() {
    if (view === 'spot') {
      return (
        <SpotStep
          expectUp={type === 'pause'}
          picked={state.spotUp}
          planned={planned}
          outcomes={state.outcomes}
          onAnswer={(up) => send({ type: 'spot', up })}
        />
      );
    }
    if (view === 'reveal' && reveal && type === 'nothing') {
      const chips = turn.human.slice(0, 5).map((h) => ({ san: sanOf(turn.fen, h.uci), percent: percent(h.share) }));
      return <QuietReveal headline={reveal.text} level={game.level} chips={chips} onContinue={() => send({ type: 'continue' })} />;
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
          outcomes={state.outcomes}
          headline={reveal.text}
          note={reveal.note}
          practice={state.attempt > 0}
          frozen={state.phase === 'done'}
          onRetry={() => send({ type: 'retry' })}
          onContinue={() => send({ type: 'continue' })}
        />
      );
    }
    return (
      <PromptBar text={barText(game, state)} tone={barTone(state)} planned={planned} outcomes={state.outcomes} innerRef={barRef}>
        {view === 'guided' && (
          <Button variant="ghost" class="pause-skip" onClick={playForMe}>
            {COPY.playItForMe}
          </Button>
        )}
      </PromptBar>
    );
  }

  return (
    <Sheet mode={BAR_PHASES.includes(view) ? 'bar' : 'card'} innerRef={sheetRef} label="Pause">
      <div class="pause-phase" key={`${view}-${state.turn}-${state.attempt}`}>
        {content()}
      </div>
    </Sheet>
  );
}
