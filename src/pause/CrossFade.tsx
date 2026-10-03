import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { QUICK_MS } from '../ui/motion';

export interface CrossFadeProps {
  /** What the content says; a new value fades the old content out while the new one fades in, in the same place. */
  value: string;
  children: ComponentChildren;
  class?: string;
}

interface Shown {
  value: string;
  children: ComponentChildren;
}

/** Swaps content in place: both versions share one grid cell, so the box does not jump while they fade. */
export function CrossFade({ value, children, class: cls }: CrossFadeProps) {
  const shown = useRef<Shown>({ value, children });
  const leaving = useRef<Shown | null>(null);
  const changed = useRef(false);
  const [, settle] = useState(0);

  if (shown.current.value !== value) {
    leaving.current = shown.current;
    changed.current = true;
  }
  shown.current = { value, children };

  useEffect(() => {
    if (!leaving.current) return;
    const id = window.setTimeout(() => {
      leaving.current = null;
      settle((n) => n + 1);
    }, QUICK_MS);
    return () => window.clearTimeout(id);
  }, [value]);

  const old = leaving.current;
  return (
    <span class={`xfade${cls ? ` ${cls}` : ''}`}>
      {old && (
        <span key={old.value} class="xfade-out" aria-hidden="true" inert>
          {old.children}
        </span>
      )}
      <span key={value} class={changed.current ? 'xfade-in' : undefined}>
        {children}
      </span>
    </span>
  );
}
