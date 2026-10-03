import { useEffect, useRef } from 'preact/hooks';
import type { Depth } from '../content/types';
import { DEPTH_BLURBS, DEPTH_NAMES } from '../progress/depth';
import { Button } from './Button';
import { celebrate } from './rewards';
import './level-up.css';

export interface LevelUpProps {
  depth: Depth;
  onClose: () => void;
}

export function LevelUp({ depth, onClose }: LevelUpProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    celebrate('levelup');
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
        <div class="levelup-badge" aria-hidden="true">
          {depth}
        </div>
        <p class="levelup-kicker">New step unlocked</p>
        <h2 id="levelup-title" class="levelup-name">
          {DEPTH_NAMES[depth]}
        </h2>
        <p class="levelup-blurb">{DEPTH_BLURBS[depth]}</p>
      </div>
      <Button size="lg" onClick={onClose}>
        Continue
      </Button>
    </div>
  );
}
