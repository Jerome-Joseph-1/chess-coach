import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { captionFor } from '../board/captions';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import { Button } from '../ui/Button';
import { COPY } from './copy';
import { isOffHome, lineData, LineMotion, moveNumbers } from './lineMotion';
import { material, materialLabel } from './material';
import { ChevronIcon } from './steps/icons';

export interface LineOption {
  id: 'threat' | 'best' | 'yours' | 'mistake' | 'refutation';
  label: string;
  /** Position the line starts from. */
  fen: string;
  moves: string[];
}

export interface LineStepperProps {
  board: BoardController;
  /** The position to come back to. */
  homeFen: string;
  userSide: Side;
  lines: LineOption[];
  /** Line shown first; defaults to the first one. */
  initial?: LineOption['id'];
  /** Stop moving the board, e.g. while the sheet hands the board back. */
  frozen?: boolean;
}

const SWIPE_PX = 40;

export function LineStepper(props: LineStepperProps) {
  return props.lines.length ? <Stepper {...props} /> : null;
}

function Stepper({ board, homeFen, userSide, lines, initial, frozen }: LineStepperProps) {
  const [lineId, setLineId] = useState(() => lines.find((l) => l.id === initial)?.id ?? lines[0].id);
  const line = lines.find((l) => l.id === lineId) ?? lines[0];
  const data = useMemo(() => lineData(line.fen, line.moves), [lineId, line.fen]);
  const numbers = useMemo(() => moveNumbers(line.fen, data.played), [data]);
  const [step, setStep] = useState(0);
  const motion = useRef<LineMotion>();
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  motion.current ??= new LineMotion(board, homeFen, setStep);
  const m = motion.current;

  useEffect(() => m.setLine(data), [data]);
  useEffect(() => {
    if (frozen) m.stop();
  }, [frozen]);
  useEffect(() => () => m.stop(), []);

  function selectLine(id: LineOption['id']) {
    if (id === lineId) return;
    setLineId(id);
    setStep(0);
  }

  function onPointerUp(e: PointerEvent) {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) m.goTo(m.heading + (dx < 0 ? 1 : -1));
  }

  const at = Math.min(step, data.played.length);
  const caption = at > 0 ? captionFor(data.fens[at - 1], data.played[at - 1].uci, userSide) : '';
  const balance = materialLabel(material(data.fens[at], userSide));

  return (
    <div
      class="stepper"
      onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeFrom.current = null)}
    >
      <div class="stepper-tabs" role="tablist">
        {lines.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === line.id}
            class={`stepper-tab${l.id === line.id ? ' is-active' : ''}`}
            onClick={() => selectLine(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div class="stepper-moves">
        <Button variant="secondary" class="stepper-nav" aria-label="Previous move" aria-disabled={at === 0} onClick={() => m.goTo(m.heading - 1)}>
          <ChevronIcon dir="left" />
        </Button>
        <div class="stepper-chips">
          {data.played.map((move, i) => (
            <button
              key={i}
              type="button"
              class={`stepper-chip${move.side === userSide ? ' is-mine' : ''}${i === at - 1 ? ' is-current' : ''}`}
              onClick={() => m.goTo(i + 1)}
            >
              {numbers[i] && <small>{numbers[i]}</small>}
              {move.san}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          class="stepper-nav"
          aria-label="Next move"
          aria-disabled={at === data.played.length}
          onClick={() => m.goTo(m.heading + 1)}
        >
          <ChevronIcon dir="right" />
        </Button>
      </div>
      <div class="stepper-foot">
        <p class="stepper-caption" aria-live="polite">
          {caption}
        </p>
        <span class="stepper-material" key={balance}>
          {balance}
        </span>
      </div>
      {isOffHome(data.fens[at], homeFen) && (
        <button type="button" class="stepper-home" onClick={() => m.backToPosition()}>
          {COPY.backToPosition}
        </button>
      )}
    </div>
  );
}
