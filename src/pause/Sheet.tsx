import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useLayoutEffect } from 'preact/hooks';
import './pause.css';

export interface SheetProps {
  label: string;
  innerRef: RefObject<HTMLDivElement>;
  children: ComponentChildren;
  /** The action row; it stays in view while the rest scrolls. */
  footer?: ComponentChildren;
}

function fitBelow(el: HTMLElement) {
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.maxHeight = `${Math.max(0, window.innerHeight - top)}px`;
}

/** Caps the sheet at the room under it, so what does not fit scrolls inside and the board never moves. */
function useRoomBelow(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    if (ref.current) fitBelow(ref.current);
  });
  useEffect(() => {
    const refit = () => ref.current && fitBelow(ref.current);
    void document.fonts?.ready.then(refit);
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, []);
}

export function Sheet({ label, innerRef, children, footer }: SheetProps) {
  useRoomBelow(innerRef);
  return (
    <div class="pause-sheet" ref={innerRef} role="region" aria-label={label}>
      <div class="pause-sheet-scroll">{children}</div>
      {footer && <div class="pause-sheet-foot">{footer}</div>}
    </div>
  );
}
