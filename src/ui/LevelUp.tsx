import { useEffect, useRef } from 'preact/hooks';
import type { Depth } from '../content/types';
import { DEPTH_BLURBS, DEPTH_NAMES, DEPTHS } from '../progress/depth';
import { Button } from './Button';
import './level-up.css';

export interface LevelUpProps {
  depth: Depth;
  onClose: () => void;
}

/** Full-screen "New stage unlocked" card shown on the recap when a game moved the stage up. */
export function LevelUp({ depth, onClose }: LevelUpProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector('button')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div ref={root} class="levelup" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
      <div class="levelup-body">
        <span class="levelup-dots" aria-hidden="true">
          {DEPTHS.map((n) => (
            <i key={n} class={n <= depth ? 'on' : ''} style={{ '--k': n }} />
          ))}
        </span>
        <h2 id="levelup-title" class="levelup-title">
          New stage unlocked: {DEPTH_NAMES[depth]}
        </h2>
        <p class="levelup-blurb">{DEPTH_BLURBS[depth]}</p>
      </div>
      <Button size="lg" onClick={onClose}>
        Got it
      </Button>
    </div>
  );
}
