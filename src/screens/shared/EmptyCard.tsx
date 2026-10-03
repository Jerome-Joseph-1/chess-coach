import type { ComponentChildren } from 'preact';

export interface EmptyCardProps {
  title?: string;
  text: string;
  label?: string;
  /** At most one way on, e.g. "Play a game". */
  children?: ComponentChildren;
}

/** What a screen or a section shows before there is anything in it: a title, one line and at most one action. */
export function EmptyCard({ title, text, label, children }: EmptyCardProps) {
  return (
    <section class="card empty-card" aria-label={label}>
      {title && <h2 class="empty-title">{title}</h2>}
      <p class="empty-text">{text}</p>
      {children}
    </section>
  );
}
