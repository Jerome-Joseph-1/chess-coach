import { CheckPop } from '../../ui/CheckPop';

export interface SubLineProps {
  text: string;
  /** Confirms a right answer: shown in the success colour. */
  right?: boolean;
  /** Put a check in front of a right answer. */
  mark?: boolean;
}

/** The one muted line under a step's title. It also carries the feedback, so screen readers hear it. */
export function SubLine({ text, right = false, mark = false }: SubLineProps) {
  return (
    <p class={`pause-sub${right ? ' is-right' : ''}`} aria-live="polite">
      {right && mark && <CheckPop />}
      {text}
    </p>
  );
}
