import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';
import { lessonFor } from '../learn';
import type { WrongMove } from '../learn/whyWrong';
import { readingMs } from '../opening';
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
  spotAnswers,
  stepNumber,
  stepTotal,
  type Feedback,
  type FlowContext,
  type FlowEvent,
  type FlowState,
  type Phase,
  type Verdict,
} from './flow';
import { hintButtonLabel, hintLadder, hintSquares } from './hints';
import { illegalLine } from './illegal';
import { revealSequence } from './lines';
import { BoardMarks } from './marks';
import { pauseLesson } from './patterns';
import { moveBefore, samePosition, squaresOf } from './position';
import { eyebrowFor, promptFor, spotPromptFor } from './prompt';
import { leavePanel, Sheet } from './Sheet';
import { PlayActions, RetryActions, RevealActions } from './steps/Actions';
import { Question } from './steps/Question';
import { QuietReveal } from './steps/QuietReveal';
import { RevealStep } from './steps/RevealStep';
import { SpotChoices } from './steps/SpotChoices';
import type { DrillTeaching } from './teaching';

export type { Verdict };

export interface PauseResult {
  outcomes: StepOutcome[];
  /**
   * Index into game.moves of the scripted move at the pause position. The sheet has put the board
   * back on that position without playing the move, whatever it showed or asked in between;
   * the game plays that move and everything after it.
   */
  resumePly: number;
  /** Found only once a hint had shown the way. */
  hinted?: boolean;
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
  /** A lesson's practice position: it starts at the move with the pattern named. */
  mode?: 'game' | 'drill';
  /** An opening lesson's practice position: its plan, hints and takeaway take the tactic's place. */
  teaching?: DrillTeaching;
}

const REPLY_MS = 350;
/** A wrong answer's cross, or a good move off the lesson's plan, stays this long, then the piece snaps back. */
const WRONG_FLASH_MS = 600;
/** A right answer stays on screen this long before the flow moves on. */
const SETTLE_MS = 400;
/** The right answer to step 1, shown after two wrong picks, stays this long so it can be found and read. */
const SHOWN_MS = 2000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function showPosition(board: BoardController, fen: string, animate: boolean): Promise<void> {
  return samePosition(board.fen(), fen) ? Promise.resolve() : board.setPosition(fen, animate);
}

function buildReveal(ctx: FlowContext, state: FlowState) {
  const { game } = ctx;
  const index = revealTurn(ctx, state);
  const missedLate = state.missedUci !== null && index !== ctx.turnIndex;
  const scripted = game.moves[game.turns[state.turn].ply];
  const { pattern, idea, remember } = pauseLesson(game, ctx.turnIndex, ctx.teaching);
  return {
    sequence: revealSequence(game, index, state.missedUci, ctx.teaching?.line),
    text: missedLate && state.missedUci ? holdMissHeadline(game, index, state.missedUci) : idea,
    lesson: missedLate ? undefined : { pattern, remember },
    note: state.alt ? `${COPY.altNote} ${continuesWith(scripted)}` : undefined,
  };
}

/** The squares of the move that led into the pause: they stay bright while the board dims. */
function lastMoveSquares(game: Game, turnIndex: number): string[] {
  const move = moveBefore(game, game.turns[turnIndex].ply);
  return move ? [move.from, move.to] : [];
}

export function PauseSheet({ game, turnIndex, type, depth, board, onDone, onStage, mode = 'game', teaching }: PauseSheetProps) {
  const ctx = useMemo<FlowContext>(() => ({ game, turnIndex, type, depth, mode, teaching }), [game, turnIndex, type, depth, mode, teaching]);
  const [state, setState] = useState(() => initialState(ctx));
  const [why, setWhy] = useState<number | null>(null);
  const [lineAt, setLineAt] = useState(0);
  const [lineDone, setLineDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** The board is showing what a wrong move loses: no moves until the user takes it back. */
  const [punishing, setPunishing] = useState(false);
  /** Counts punishments and take-backs, so a reply still on its way stops once the move is taken back. */
  const punishRun = useRef(0);
  const takingBack = useRef(false);
  /**
   * What the coach says about a move the rules don't allow; it is not an answer and passes by itself.
   * A new object each time, so the same line said again starts its timer again.
   */
  const [illegal, setIllegal] = useState<{ text: string } | null>(null);
  const alive = useRef(true);
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

  /**
   * Board callback: keep the piece when the move was right. A wrong one shows a cross; when it loses something it
   * stays for the opponent's reply, otherwise it snaps back. A good move off the lesson's plan just goes back.
   */
  function tryMove(uci: string): boolean | Promise<boolean> {
    const before = latest.current;
    const next = send({ type: 'move', uci });
    if (next === before) return false;
    if (next.feedback?.kind === 'off-plan') return wait(WRONG_FLASH_MS).then(() => false);
    const [, to] = squaresOf(uci);
    if (next.feedback?.kind !== 'wrong') {
      marks.badge(to, 'good');
      return true;
    }
    marks.badge(to, 'bad');
    if (next.feedback.why.reply) return true;
    return wait(WRONG_FLASH_MS).then(() => {
      marks.clearBadges();
      return false;
    });
  }

  function sayIllegal(from: string, to: string | null) {
    setIllegal({ text: illegalLine(board.fen(), game.side, from, to) });
  }

  /** Plays the reply that punishes a wrong move and marks what it wins; it stays while the coach says why. */
  async function showPunishment(why: WrongMove) {
    const run = ++punishRun.current;
    const current = () => alive.current && punishRun.current === run;
    const reply = why.reply!;
    setPunishing(true);
    board.disableInput();
    await wait(REPLY_MS);
    if (!current()) return;
    marks.clearBadges();
    await board.playMove(reply);
    if (!current()) return;
    board.arrow(...squaresOf(reply), 'threat');
    board.highlight(why.targets, 'bad');
  }

  /** Puts back the position a wrong move left, so the question can be tried again. */
  async function takeBack() {
    if (takingBack.current) return;
    takingBack.current = true;
    punishRun.current++;
    marks.clear();
    const at = game.turns[latest.current.turn];
    await board.setPosition(at.fen, true);
    takingBack.current = false;
    if (!alive.current) return;
    const last = moveBefore(game, at.ply);
    board.setLastMove(last ? last.from + last.to : null);
    setPunishing(false);
    board.enableMoves(game.side, tryMove, sayIllegal);
    showHint(latest.current);
    send({ type: 'retry' });
  }

  async function hintAfterTakeBack() {
    if (takingBack.current) return;
    await takeBack();
    if (alive.current) send({ type: 'hint' });
  }

  /** Marks what the hint in hand shows on the board: the piece in trouble or the piece to move, then the move itself. */
  function showHint(at: FlowState) {
    if (at.hint < 2) return;
    if (at.hint === 3) return board.arrow(...squaresOf(scriptedUci(game, at.turn)), 'best');
    board.highlight(hintSquares(game, at, teaching), 'hint');
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
        // Confetti is for a move found unaided; one found after a hint earns the smaller reward.
        const unaided = latest.current.outcomes.at(-1)?.correct;
        return unaided ? celebrate('move', board.squareCenter(to)) : celebrate('step');
      }
      case 'alt':
        board.disableInput();
        board.clearHighlights();
        board.clearArrows();
        return celebrate('alt');
      case 'wrong':
        nudge();
        shake(bubbleRef.current);
        if (feedback.why.reply) void showPunishment(feedback.why);
    }
  }

  useEffect(() => {
    if (state.feedback) react(state.feedback);
  }, [state.feedback]);

  useEffect(() => {
    if (!state.answered) return;
    const shown = state.phase === 'spot' && state.spotShown !== null;
    const id = window.setTimeout(() => send({ type: 'advance' }), shown ? SHOWN_MS : SETTLE_MS);
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
        board.enableMoves(game.side, tryMove, sayIllegal);
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

  // Anything the flow does takes the place of a line about an illegal move.
  useEffect(() => setIllegal(null), [state]);
  useEffect(() => {
    if (!illegal) return;
    const id = window.setTimeout(() => setIllegal(null), readingMs(illegal.text));
    return () => window.clearTimeout(id);
  }, [illegal]);

  useEffect(
    () => () => {
      alive.current = false;
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
      return (
        <>
          <Question {...common} title={COPY.spotTitle} {...spotPromptFor(ctx, state)} />
          <SpotChoices
            innerRef={choicesRef}
            answers={spotAnswers(ctx)}
            picked={state.spot}
            shown={state.spotShown}
            settled={state.answered}
            onAnswer={(pick) => send({ type: 'spot', pick })}
          />
        </>
      );
    }
    const prompt = promptFor(game, state, teaching);
    const named = state.hint > 0 && view === 'solve';
    return (
      <Question
        {...common}
        {...prompt}
        sub={illegal?.text ?? prompt.sub}
        pattern={named ? pauseLesson(game, state.turn, teaching).pattern : undefined}
        ladder={hintLadder(state)}
      />
    );
  }

  function answer() {
    const result = resultLine(type, state.outcomes, state.hinted);
    if (type === 'nothing') {
      const lesson = lessonFor(game, turnIndex);
      return <QuietReveal result={result} text={lesson.idea} remember={lesson.remember} />;
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
        onFinished={() => setLineDone(true)}
      />
    );
  }

  function actions() {
    if (view === 'reveal') {
      const onWhy = watchable && why === null ? () => setWhy(lineAt) : undefined;
      const steps = reveal?.sequence.steps.length ?? 0;
      // Until the line stands played at its end, the stepper's next button is the one to press.
      const lineOver = type === 'nothing' || steps === 0 || (lineDone && lineAt === steps);
      return <RevealActions onContinue={carryOn} onWhy={onWhy} whyDisabled={lineAt === 0} nudge={lineOver && why === null} />;
    }
    const ladder = hintLadder(state);
    if (punishing) {
      return (
        <RetryActions
          hintLabel={hintButtonLabel(ladder)}
          hintsLeft={ladder.used < ladder.stops.length}
          onHint={() => void hintAfterTakeBack()}
          onRetry={() => void takeBack()}
        />
      );
    }
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

  const dockKind = view === 'reveal' ? `reveal-${stage}` : punishing ? 'retry' : 'play';
  return (
    <Sheet
      innerRef={panelRef}
      label="Pause"
      stage={stage}
      // Step 1's answers sit in the panel under the question, so it has no dock.
      footer={
        view !== 'spot' && (
          <CrossFade value={dockKind} class="dock-fade">
            {actions()}
          </CrossFade>
        )
      }
    >
      {view === 'reveal' ? answer() : question()}
    </Sheet>
  );
}
