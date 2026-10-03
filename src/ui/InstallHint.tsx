import { useState } from 'preact/hooks';
import { dismissInstallHint, isInstallHintDismissed } from '../progress/store';
import './install-hint.css';

/** iPhone or iPad Safari; other iOS browsers do not offer the same Add to Home Screen path. */
export function isIosSafari(userAgent: string, touchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function shouldShow(): boolean {
  return isIosSafari(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone() && !isInstallHintDismissed();
}

function ShareGlyph() {
  return (
    <svg class="install-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

export function InstallHint() {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;
  const dismiss = () => {
    dismissInstallHint();
    setVisible(false);
  };
  return (
    <aside class="card install-hint">
      <p>
        Install: tap <ShareGlyph /> Share, then Add to Home Screen
      </p>
      <button type="button" class="install-close" aria-label="Dismiss" onClick={dismiss}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </aside>
  );
}
