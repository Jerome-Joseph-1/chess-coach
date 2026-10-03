import { useEffect, useRef } from 'preact/hooks';
import type { Depth } from '../content/types';
import { DEPTH_BLURBS, DEPTH_NAMES, STAGES, stageNumber } from '../progress/depth';
import { Button } from './Button';
import { haptic } from './haptics';
import { playSound } from './sound';
import './level-up.css';

// The chord sounds as the card settles, not before it is seen.
const CHORD_AFTER_MS = 160;

export interface LevelUpProps {
  depth: Depth;
  onClose: () => void;
}

/** "New stage unlocked": a card over the blurred recap, its stage dots filling in order. */
export function LevelUp({ depth, onClose }: LevelUpProps) {
  const root = useRef<HTMLDivElement>(null);
  const stage = stageNumber(depth);

  useEffect(() => {
    root.current?.querySelector('button')?.focus();
    const id = setTimeout(() => {
      playSound('levelup');
      haptic('levelup');
    }, CHORD_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div ref={root} class="levelup" role="dialog" aria-modal="true" aria-label={`New stage unlocked: ${DEPTH_NAMES[depth]}`}>
      <div class="levelup-card">
        <span class="levelup-dots" aria-hidden="true">
          {STAGES.map((s, i) => (
            <i key={s} class={i < stage ? 'on' : ''} style={{ '--k': i }} />
          ))}
        </span>
        <p class="eyebrow levelup-eyebrow">
          New stage unlocked · {stage} of {STAGES.length}
        </p>
        <h2 class="levelup-title">{DEPTH_NAMES[depth]}</h2>
        <p class="levelup-blurb">{DEPTH_BLURBS[depth]}</p>
        <Button size="lg" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
