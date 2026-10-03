import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { captionFor } from '../board/captions';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import '../ui/button.css';
import { RollingNumber } from '../ui/RollingNumber';
import { COPY } from './copy';
import { controlState, lineData, LineMotion, moveNumbers, type LineData } from './lineMotion';
import { material, materialLabel } from './material';
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

interface SegmentsProps {
  lines: LineOption[];
  active: LineOption['id'];
  onSelect: (id: LineOption['id']) => void;
}

/** One pill track, the line in view on a raised segment. A single line needs no choice. */
function Segments({ lines, active, onSelect }: SegmentsProps) {
  if (lines.length < 2) return null;
  return (
    <div class="seg" role="tablist">
      {lines.map((line) => (
        <button
          key={line.id}
          type="button"
          role="tab"
          aria-selected={line.id === active}
          class={`seg-tab${line.id === active ? ' is-active' : ''}`}
          onClick={() => onSelect(line.id)}
        >
          {line.label}
        </button>
      ))}
    </div>
  );
}

interface ChipsProps {
  data: LineData;
  numbers: string[];
  at: number;
  rowRef: { current: HTMLDivElement | null };
  onPick: (step: number) => void;
}

function Chips({ data, numbers, at, rowRef, onPick }: ChipsProps) {
  return (
    <div class="stepper-chips" ref={rowRef}>
      {data.played.map((move, i) => (
        <button key={i} type="button" class={`stepper-chip${i === at - 1 ? ' is-current' : ''}`} onClick={() => onPick(i + 1)}>
          {numbers[i] && <small>{numbers[i]}</small>}
          {move.san}
        </button>
      ))}
    </div>
  );
}

interface ControlRowProps {
  data: LineData;
  at: number;
  homeFen: string;
  motion: LineMotion;
}

/** Back to the position on the left, previous / counter / next on the right. */
function ControlRow({ data, at, homeFen, motion }: ControlRowProps) {
  const state = controlState(data, at, homeFen);
  return (
    <div class="stepper-controls">
      <button
        type="button"
        class="btn btn-secondary stepper-back"
        aria-label={COPY.backToPosition}
        disabled={state.backDisabled}
        onClick={() => motion.backToPosition()}
      >
        <ReturnIcon />
        <span class="stepper-back-label">{COPY.backToPosition}</span>
      </button>
      <div class="stepper-group">
        <button type="button" class="stepper-nav" aria-label="Previous move" disabled={state.prevDisabled} onClick={() => motion.goTo(motion.heading - 1)}>
          <ChevronIcon dir="left" />
        </button>
        <span class="stepper-count" aria-live="polite">
          {state.count}
        </span>
        <button type="button" class="stepper-nav" aria-label="Next move" disabled={state.nextDisabled} onClick={() => motion.goTo(motion.heading + 1)}>
          <ChevronIcon dir="right" />
        </button>
      </div>
    </div>
  );
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

  return (
    <div
      class="stepper"
      onPointerDown={(e) => (swipeFrom.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeFrom.current = null)}
    >
      <Segments lines={lines} active={line.id} onSelect={selectLine} />
      <Chips data={data} numbers={numbers} at={at} rowRef={chipsRef} onPick={(n) => m.goTo(n)} />
      <div class="stepper-foot">
        <p class="stepper-caption" aria-live="polite">
          {caption}
        </p>
        <span class="stepper-material">
          <RollingNumber value={balance} format={materialLabel} />
        </span>
      </div>
      <ControlRow data={data} at={at} homeFen={homeFen} motion={m} />
    </div>
  );
}
