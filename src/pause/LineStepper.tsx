import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { captionFor } from '../board/captions';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import { RollingNumber, formatSigned } from '../ui/RollingNumber';
import { COPY } from './copy';
import { isOffHome, lineData, LineMotion, moveNumbers } from './lineMotion';
import { material } from './material';
import { ChevronIcon, ReturnIcon } from './steps/icons';

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

/** Keeps the current move chip in view inside its scrolling row. */
function useChipInView(row: { current: HTMLElement | null }, index: number) {
  useEffect(() => {
    const el = row.current;
    const chip = el?.children[index - 1] as HTMLElement | undefined;
    if (!el || !chip) return;
    const left = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [index]);
}

function Stepper({ board, homeFen, userSide, lines, initial, frozen }: LineStepperProps) {
  const [lineId, setLineId] = useState(() => lines.find((l) => l.id === initial)?.id ?? lines[0].id);
  const line = lines.find((l) => l.id === lineId) ?? lines[0];
  const data = useMemo(() => lineData(line.fen, line.moves), [lineId, line.fen]);
  const numbers = useMemo(() => moveNumbers(line.fen, data.played), [data]);
  const [step, setStep] = useState(0);
  const motion = useRef<LineMotion>();
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  motion.current ??= new LineMotion(board, homeFen, setStep);
  const m = motion.current;

  useEffect(() => m.setLine(data), [data]);
  useEffect(() => {
    if (frozen) m.stop();
  }, [frozen]);
  useEffect(() => () => m.stop(), []);

  const at = Math.min(step, data.played.length);
  useChipInView(chipsRef, at);

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

  const caption = at > 0 ? captionFor(data.fens[at - 1], data.played[at - 1].uci, userSide) : '';
  const balance = material(data.fens[at], userSide);
  const atHome = !isOffHome(data.fens[at], homeFen);

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
      <div class="stepper-chips" ref={chipsRef}>
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
      <div class="stepper-foot">
        <p class="stepper-caption" aria-live="polite">
          {caption}
        </p>
        <span class="stepper-material">
          Material <RollingNumber value={balance} format={formatSigned} />
        </span>
      </div>
      <div class="stepper-controls">
        <button type="button" class="stepper-back" disabled={atHome} aria-label={COPY.backToPosition} onClick={() => m.backToPosition()}>
          <ReturnIcon />
          <span class="stepper-back-label">{COPY.backToPosition}</span>
        </button>
        <div class="stepper-group">
          <button type="button" class="stepper-nav" aria-label="Previous move" disabled={at === 0} onClick={() => m.goTo(m.heading - 1)}>
            <ChevronIcon dir="left" />
          </button>
          <span class="stepper-count" aria-live="polite">
            {at} of {data.played.length}
          </span>
          <button
            type="button"
            class="stepper-nav"
            aria-label="Next move"
            disabled={at === data.played.length}
            onClick={() => m.goTo(m.heading + 1)}
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>
    </div>
  );
}
