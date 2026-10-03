import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import type { StepOutcome } from '../../content/types';
import { celebrate } from '../../ui/rewards';
import { playSound } from '../../ui/sound';
import { StarIcon } from './icons';

export interface StarsProps {
  outcomes: StepOutcome[];
  innerRef: RefObject<HTMLDivElement>;
}

const STAR_MS = 170;
const FIRST_MS = 160;

function center(el: HTMLElement | null) {
  const box = el?.getBoundingClientRect();
  return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** One star per asked step, earned ones pop in one by one with a rising tick. */
export function Stars({ outcomes, innerRef }: StarsProps) {
  useEffect(() => {
    const timers: number[] = [];
    let earned = 0;
    outcomes.forEach((o, i) => {
      if (!o.correct) return;
      const pitch = earned++ * 2;
      timers.push(window.setTimeout(() => playSound('step', pitch), FIRST_MS + i * STAR_MS));
    });
    const perfect = earned === outcomes.length && outcomes.length >= 3;
    if (perfect) {
      const at = FIRST_MS + outcomes.length * STAR_MS + 120;
      timers.push(window.setTimeout(() => celebrate('perfect', center(innerRef.current)), at));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  const earned = outcomes.filter((o) => o.correct).length;
  return (
    <div class={`pause-stars${outcomes.length > 5 ? ' is-small' : ''}`} ref={innerRef} role="img" aria-label={`${earned} of ${outcomes.length} stars`}>
      {outcomes.map((o, i) => (
        <span key={i} class={`pause-star ${o.correct ? 'is-on' : 'is-off'}`} style={{ '--i': i }}>
          <StarIcon />
        </span>
      ))}
    </div>
  );
}
