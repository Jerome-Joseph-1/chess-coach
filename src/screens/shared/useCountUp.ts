import { useEffect, useRef, useState } from 'preact/hooks';
import { countUp, prefersReducedMotion } from '../../ui/motion';

/** A number that rolls up from zero (or from what it showed before) to `value` after `delayMs`. */
export function useCountUp(value: number, durationMs = 600, delayMs = 0): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const latest = useRef(shown);
  latest.current = shown;
  useEffect(() => {
    let stop = () => {};
    const id = setTimeout(() => {
      stop = countUp(latest.current, value, durationMs, setShown);
    }, delayMs);
    return () => {
      clearTimeout(id);
      stop();
    };
  }, [value, durationMs, delayMs]);
  return shown;
}
