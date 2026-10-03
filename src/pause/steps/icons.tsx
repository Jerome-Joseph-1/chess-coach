export function CheckIcon() {
  return (
    <svg class="icon icon-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg class="icon icon-cross" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        fill="currentColor"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'}
        fill="none"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
