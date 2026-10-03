import { useEffect, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import { prefersReducedMotion } from '../ui/motion';
import { COPY } from './copy';
import { CrossFade } from './CrossFade';
import { controlState, LEAD_MS, LineMotion } from './lineMotion';
import { captionParts, sequenceKey, type Sequence } from './sequence';
import { Icon } from './steps/icons';
import './nudge.css';

export interface LineStepperProps {
  board: BoardController;
  userSide: Side;
  sequence: Sequence;
  /** Stop moving the board, e.g. while the panel hands the board back. */
  frozen?: boolean;
  /** Open at this step without playing, e.g. when coming back to the line. */
  startAt?: number;
  /** Offers a replay button at the end of the card. */
  replayable?: boolean;
  /** Told the step on show whenever it changes. */
  onStep?: (at: number) => void;
  /** Told once the line has played through, or the user has taken it over; at once under reduced motion. */
  onFinished?: () => void;
}

const SWIPE_PX = 40;
const MAX_PIPS = 8;

export function LineStepper(props: LineStepperProps) {
  return props.sequence.steps.length ? <Stepper {...props} /> : null;
}

interface NavProps {
  dir: 'left' | 'right';
  label: string;
  disabled: boolean;
  /** The line waits on this button: it gets the ring of the button to press next. */
  nudge?: boolean;
  onClick: () => void;
}

export function NavButton({ dir, label, disabled, nudge = false, onClick }: NavProps) {
  return (
    <button type="button" class={`stepper-nav${nudge ? ' is-nudge' : ''}`} aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={dir === 'left' ? 'chevron-left' : 'chevron-right'} />
    </button>
  );
}

/** One pip per move of the line; the one on show is bright. */
function Pips({ count, at }: { count: number; at: number }) {
  if (count < 2) return null;
  return (
    <span class="stepper-pips" aria-hidden="true">
      {Array.from({ length: Math.min(count, MAX_PIPS) }, (_, i) => (
        <i key={i} class={i === at - 1 ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/** The arrow-shaped replay glyph turns once each time it is tapped. */
function ReplayButton({ onClick }: { onClick: () => void }) {
  const [turns, setTurns] = useState(0);
  return (
    <button
      type="button"
      class="stepper-replay"
      aria-label={COPY.watchAgain}
      onClick={() => {
        setTurns((n) => n + 1);
        onClick();
      }}
    >
      <span key={turns} class={turns ? 'is-turning' : undefined}>
        <Icon name="replay" />
      </span>
    </button>
  );
}

function Stepper({ board, userSide, sequence, frozen, startAt, replayable = false, onStep, onFinished }: LineStepperProps) {
  const [step, setStep] = useState(startAt ?? 0);
  const [playing, setPlaying] = useState(false);
  const motion = useRef<LineMotion>();
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const resumeAt = useRef(startAt);
  const finished = useRef(false);
  const wasPlaying = useRef(false);
  motion.current ??= new LineMotion(board, setStep, setPlaying);
  const m = motion.current;

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onFinished?.();
  }

  // Opening plays the line once; with reduced motion it only shows the first move. Coming back resumes in place.
  function begin() {
    const at = resumeAt.current;
    resumeAt.current = undefined;
    if (at !== undefined) {
      m.setSequence(sequence, at);
      return finish();
    }
    m.setSequence(sequence);
    if (prefersReducedMotion()) {
      m.goTo(1);
      finish();
    } else {
      m.play(LEAD_MS);
    }
  }
  useEffect(begin, [sequenceKey(sequence)]);
  useEffect(() => {
    if (wasPlaying.current && !playing) finish();
    wasPlaying.current = playing;
  }, [playing]);
  useEffect(() => {
    if (frozen) m.stop();
  }, [frozen]);
  useEffect(() => () => m.stop(), []);

  const at = Math.min(step, sequence.steps.length);
  useEffect(() => onStep?.(at), [at]);

  function onPointerUp(e: PointerEvent) {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) m.goTo(m.heading + (dx < 0 ? 1 : -1));
  }

  const state = controlState(sequence, at, playing);
  const caption = at > 0 ? captionParts(sequence.steps[at - 1], userSide) : { move: '', text: COPY.lineIntro };

  return (
    <div
      class="stepper"
      onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeFrom.current = null)}
    >
      <NavButton dir="left" label="Previous move" disabled={state.prevDisabled} onClick={() => m.goTo(m.heading - 1)} />
      <div class="stepper-caption" aria-live="polite">
        <CrossFade value={`${at}`} class="stepper-text">
          {caption.move && (
            <span class="stepper-move">
              <b>{caption.move}</b>
              <Pips count={sequence.steps.length} at={at} />
            </span>
          )}
          <span class="stepper-says">{caption.text}</span>
        </CrossFade>
      </div>
      <NavButton dir="right" label="Next move" disabled={state.nextDisabled} nudge={state.pulseNext} onClick={() => m.goTo(m.heading + 1)} />
      {replayable && (
        <>
          <span class="stepper-divider" aria-hidden="true" />
          <ReplayButton onClick={() => m.replay(LEAD_MS / 2)} />
        </>
      )}
    </div>
  );
}
