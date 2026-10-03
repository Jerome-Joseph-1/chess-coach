import type { PatternLevel, RateCount } from '../../progress/stats';
import { SLOW_MS } from '../../ui/motion';
import { Icon } from './icons';
import { LEVELS, PATTERNS, type PatternId } from './patterns';
import { useCountUp } from './useCountUp';

export function PatternTile({ pattern, small = false }: { pattern: PatternId; small?: boolean }) {
  return (
    <span class={`tile ${small ? 'tile--small' : ''}`} aria-hidden="true">
      <Icon name={PATTERNS[pattern].icon} />
    </span>
  );
}

export function LevelWord({ level }: { level: PatternLevel }) {
  return (
    <span class={`level level--${level}`}>
      <Icon name={LEVELS[level].icon} size={14} />
      {LEVELS[level].word}
    </span>
  );
}

/** Meters in a list start filling one after another, 60ms apart, once the screen has settled. */
export function fillDelay(index: number): number {
  return 120 + index * 60;
}

/** "5 of 8": the right answers roll up while the meter beside them fills. */
export function useRolledCount(count: RateCount, index: number): number {
  return useCountUp(count.right, SLOW_MS, fillDelay(index));
}

export function LevelBar({ count, level, index }: { count: RateCount; level: PatternLevel; index: number }) {
  const ratio = count.total === 0 ? 0 : count.right / count.total;
  return (
    <span class={`bar level--${level}`} aria-hidden="true">
      <span class="bar-fill" style={{ '--r': ratio, '--delay': `${fillDelay(index)}ms` }} />
    </span>
  );
}
