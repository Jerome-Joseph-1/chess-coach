import type { ComponentChildren, RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import './pause.css';

export interface SheetProps {
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

export function Sheet({ label, innerRef, children }: SheetProps) {
  useSheetHeight(innerRef);
  return (
    <div class="pause-sheet" ref={innerRef} role="region" aria-label={label}>
      <div class="pause-sheet-scroll">{children}</div>
    </div>
  );
}
