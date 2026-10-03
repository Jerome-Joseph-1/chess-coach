import { useEffect, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import { prefersReducedMotion } from '../ui/rewards';
import { COPY } from './copy';
import { controlState, LEAD_MS, LineMotion } from './lineMotion';
import { captionOf, sequenceKey, type Sequence } from './sequence';
import { TextLink } from './steps/Actions';
import { ChevronIcon } from './steps/icons';

export interface LineStepperProps {
  board: BoardController;
  userSide: Side;
  sequence: Sequence;
  /** Stop moving the board, e.g. while the sheet hands the board back. */
  frozen?: boolean;
  /** Counts up each time the sequence should play again from its start. */
  replays?: number;
  /** Open at this step without playing, e.g. when coming back to the line. */
  startAt?: number;
  /** Offers "Why this move?" under the caption; called with the step on show. */
  onWhy?: (at: number) => void;
}

const SWIPE_PX = 40;

export function LineStepper(props: LineStepperProps) {
  return props.sequence.steps.length ? <Stepper {...props} /> : null;
}

interface NavProps {
  dir: 'left' | 'right';
  label: string;
  disabled: boolean;
  pulsing?: boolean;
  onClick: () => void;
}

export function NavButton({ dir, label, disabled, pulsing = false, onClick }: NavProps) {
  return (
    <button type="button" class={`stepper-nav${pulsing ? ' is-pulsing' : ''}`} aria-label={label} disabled={disabled} onClick={onClick}>
      <ChevronIcon dir={dir} />
    </button>
  );
}

function Stepper({ board, userSide, sequence, frozen, replays = 0, startAt, onWhy }: LineStepperProps) {
  const [step, setStep] = useState(startAt ?? 0);
  const [playing, setPlaying] = useState(false);
  const motion = useRef<LineMotion>();
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const resumeAt = useRef(startAt);
  const seenReplays = useRef(replays);
  motion.current ??= new LineMotion(board, setStep, setPlaying);
  const m = motion.current;

  // Opening plays the line once; with reduced motion it only shows the first move. Coming back resumes in place.
  function begin() {
    const at = resumeAt.current;
    resumeAt.current = undefined;
    if (at !== undefined) return m.setSequence(sequence, at);
    m.setSequence(sequence);
    if (prefersReducedMotion()) m.goTo(1);
    else m.play(LEAD_MS);
  }
  useEffect(begin, [sequenceKey(sequence)]);
  useEffect(() => {
    if (replays === seenReplays.current) return;
    seenReplays.current = replays;
    begin();
  }, [replays]);
  useEffect(() => {
    if (frozen) m.stop();
  }, [frozen]);
  useEffect(() => () => m.stop(), []);

  function onPointerUp(e: PointerEvent) {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) m.goTo(m.heading + (dx < 0 ? 1 : -1));
  }

  const at = Math.min(step, sequence.steps.length);
  const state = controlState(sequence, at, playing);
  const caption = at > 0 ? captionOf(sequence.steps[at - 1], userSide) : COPY.lineIntro;

  return (
    <>
      <div
        class="stepper"
        onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeFrom.current = null)}
      >
        <NavButton dir="left" label="Previous move" disabled={state.prevDisabled} onClick={() => m.goTo(m.heading - 1)} />
        <p class="stepper-caption" aria-live="polite">
          {caption}
        </p>
        <NavButton dir="right" label="Next move" disabled={state.nextDisabled} pulsing={state.pulseNext} onClick={() => m.goTo(m.heading + 1)} />
      </div>
      {onWhy && (
        // Kept in the layout before the first move, so nothing jumps when it appears.
        <div class={`stepper-why${at > 0 ? '' : ' is-waiting'}`}>
          <TextLink
            label={COPY.whyMove}
            onClick={() => {
              m.stop();
              onWhy(at);
            }}
          />
        </div>
      )}
    </>
  );
}
