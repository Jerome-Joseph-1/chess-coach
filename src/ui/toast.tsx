import { render } from 'preact';
import './rewards.css';

export const TOAST_MS = 1800;

let host: HTMLElement | null = null;
let hideTimer = 0;
let shown = 0;

function toastHost(): HTMLElement {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
  return host;
}

export function toast(text: string): void {
  const el = toastHost();
  window.clearTimeout(hideTimer);
  shown += 1;
  // A new key remounts the pill so its slide-in restarts when toasts follow each other.
  render(
    <div class="toast" key={shown}>
      {text}
    </div>,
    el,
  );
  hideTimer = window.setTimeout(() => render(null, el), TOAST_MS);
}
