import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Verdict } from '../../pause/PauseSheet';
import { prefersReducedMotion } from '../../ui/motion';
import { QualityMark } from './QualityMark';

export interface MoveStripProps {
  /** SAN of every move played, from the game's start. */
  moves: string[];
  /** How many of them the board shows; the last one shown is the current move. */
  shown: number;
  /** How each answered key position went, by index into `moves`. */
  marks: ReadonlyMap<number, Verdict>;
}

/** Room kept on the left, under the fade, so the current move never hides behind it. */
const EDGE_PX = 44;

/** Slides the one highlight pill onto the current move; the first placement is instant. */
function placePill(pill: HTMLElement, current: HTMLElement | null, placed: boolean) {
  pill.style.transition = placed ? '' : 'none';
  pill.style.opacity = current ? '1' : '0';
  if (!current) return;
  pill.style.width = `${current.offsetWidth}px`;
  pill.style.transform = `translateX(${current.offsetLeft}px)`;
}

/** The left edge fades the moves out only once there are moves hidden under it. */
function markScrolled(strip: HTMLElement) {
  strip.parentElement?.classList.toggle('is-scrolled', strip.scrollLeft > 4);
}

/** Glides the strip just far enough to keep the current move in view. */
function keepInView(strip: HTMLElement, current: HTMLElement) {
  const left = current.offsetLeft - EDGE_PX;
  const right = current.offsetLeft + current.offsetWidth + EDGE_PX / 2 - strip.clientWidth;
  const target = strip.scrollLeft > left ? left : strip.scrollLeft < right ? right : null;
  if (target === null) return;
  strip.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function MoveStrip({ moves, shown, marks }: MoveStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const current = strip.current?.querySelector<HTMLElement>('.is-current .game-san') ?? null;
    placePill(pill.current!, current, placed.current);
    placed.current = current !== null;
    if (current) keepInView(strip.current!, current);
  }, [moves.length, shown, marks.size]);

  return (
    <div class="game-strip">
      <div class="game-moves" ref={strip} onScroll={(e) => markScrolled(e.currentTarget)}>
        <span class="game-moves-pill" ref={pill} aria-hidden="true" />
        <ol aria-label="Moves">
          {moves.map((san, i) => (
            <li key={i} class={`game-move${i === shown - 1 ? ' is-current' : ''}`} aria-current={i === shown - 1 ? 'step' : undefined}>
              {i % 2 === 0 && <span class="game-move-no">{i / 2 + 1}.</span>}
              <span class="game-san">
                {marks.has(i) && <QualityMark verdict={marks.get(i)!} />}
                {san}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
