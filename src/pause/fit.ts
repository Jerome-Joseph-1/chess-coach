import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

/** The board's two sizes: full while the game plays or the coach asks, compact while the coach answers. */
export type BoardSize = 'full' | 'compact';

const COMPACT = new Set(['answer', 'analysis', 'explore', 'line']);

/** The size the board takes for a screen's mode, e.g. the game's "answer" or the lesson's "line". */
export function boardSize(mode: string): BoardSize {
  return COMPACT.has(mode) ? 'compact' : 'full';
}

/**
 * The content's own height, whatever height its box is animating through. Read from layout offsets, so lines
 * still rising in do not count their slide; the content box is positioned, so the offsets are taken from it.
 */
function naturalHeight(content: HTMLElement): number {
  const last = content.lastElementChild;
  if (!(last instanceof HTMLElement)) return 0;
  return last.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(content).paddingBottom);
}

/**
 * Keeps the coach's panel whole under the board: each new stage starts at the top of the panel, and when the
 * content is taller than the room left, the board gives up the difference, down to its floor, before the panel
 * scrolls. Within a stage the board only ever shrinks, so it holds still while the coach talks.
 */
export function useFitUnderBoard(scroller: RefObject<HTMLElement>, content: RefObject<HTMLElement>, stage: string | undefined): void {
  const fitted = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const panel = scroller.current;
    const inner = content.current;
    const frame = panel?.closest<HTMLElement>('.game');
    fitted.current = frame ?? null;
    const board = frame?.querySelector<HTMLElement>('.board-host');
    if (!panel || !inner || !frame || !board) return;
    panel.scrollTop = 0;
    let fit = Infinity;
    const measure = () => {
      // The panel takes what the board leaves, so the two together stay the same whatever size the board is.
      const room = panel.clientHeight + board.offsetHeight;
      const next = Math.floor(room - naturalHeight(inner));
      if (next >= fit) return;
      fit = next;
      frame.style.setProperty('--board-fit', `${fit}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    if (inner !== panel) observer.observe(panel);
    return () => observer.disconnect();
  }, [stage]);

  useEffect(() => () => fitted.current?.style.removeProperty('--board-fit'), []);
}
