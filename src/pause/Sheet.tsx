import type { ComponentChildren, RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import './pause.css';

export interface SheetProps {
  /** A card has room for content; a bar is one slim line so the board stays free. */
  mode?: 'card' | 'bar';
  label: string;
  innerRef: RefObject<HTMLDivElement>;
  children: ComponentChildren;
}

/** Publishes the sheet height as --pause-sheet-h so the screen behind it can leave room. */
function useSheetHeight(ref: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty('--pause-sheet-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty('--pause-sheet-h');
    };
  }, [ref]);
}

export function Sheet({ mode = 'card', label, innerRef, children }: SheetProps) {
  useSheetHeight(innerRef);
  return (
    <div class={`pause-sheet is-${mode}`} ref={innerRef} role="region" aria-label={label}>
      <div class="pause-sheet-scroll">
        <div class="pause-grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
