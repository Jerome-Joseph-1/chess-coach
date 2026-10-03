import { useRef, useState } from 'preact/hooks';
import type { Depth, Settings as SettingsData } from '../content/types';
import { dayKey } from '../progress/days';
import { DEPTHS, DEPTH_BLURBS, DEPTH_NAMES } from '../progress/depth';
import { exportProgress, getSettings, importProgress, resetProgress, saveSettings, type StoredSettings } from '../progress/store';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { downloadJson } from './shared/download';
import { Segmented } from './shared/Segmented';
import './shared/screen.css';
import './settings.css';

type DepthChoice = 'auto' | Depth;

const THEME_OPTIONS: { value: SettingsData['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const DEPTH_OPTIONS: { value: DepthChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...DEPTHS.map((value) => ({ value, label: String(value) })),
];

function applyTheme(theme: SettingsData['theme']): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function depthHint(choice: DepthChoice): string {
  if (choice === 'auto') return 'Auto moves you up a step when you get things right, and back down if it gets tough.';
  return `Step ${choice} · ${DEPTH_NAMES[choice]}: ${DEPTH_BLURBS[choice]}`;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} class="toggle" onClick={() => onChange(!checked)}>
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        <span class="toggle-hint">{hint}</span>
      </span>
      <span class="toggle-track" aria-hidden="true">
        <span class="toggle-knob" />
      </span>
    </button>
  );
}

function ResetConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div class="confirm" role="alertdialog" aria-labelledby="reset-title">
      <h3 id="reset-title">Erase all progress on this device?</h3>
      <p class="muted">Your games, steps and reviews are cleared. Settings stay. This cannot be undone.</p>
      <Button variant="secondary" onClick={onCancel}>
        Keep my progress
      </Button>
      <Button variant="secondary" class="danger" onClick={onConfirm}>
        Erase progress
      </Button>
    </div>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<StoredSettings>(getSettings);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<StoredSettings>) => {
    saveSettings({ ...settings, ...patch });
    setSettings(getSettings());
  };

  const chooseTheme = (theme: SettingsData['theme']) => {
    update({ theme });
    applyTheme(theme);
  };

  const exportData = () => {
    downloadJson(`chess-coach-progress-${dayKey(Date.now())}.json`, exportProgress());
    setStatus('Progress exported.');
  };

  const importFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const result = importProgress(await file.text());
    if (result.ok) {
      setSettings(getSettings());
      applyTheme(getSettings().theme);
      setStatus('Progress imported.');
    } else {
      setStatus(result.error);
    }
  };

  const erase = () => {
    resetProgress();
    setConfirming(false);
    setStatus('Progress erased.');
  };

  const depthChoice: DepthChoice = settings.depthOverride ?? 'auto';

  return (
    <main class="screen screen--tabs">
      <h1 class="screen-title">Settings</h1>
      <div class="stack">
        <section class="card settings-group" aria-labelledby="look-title">
          <h2 id="look-title">Look and feel</h2>
          <Segmented label="Theme" options={THEME_OPTIONS} value={settings.theme} onChange={chooseTheme} />
          <Toggle label="Sound" hint="Chimes when you get things right" checked={settings.sound} onChange={(sound) => update({ sound })} />
          <Toggle label="Haptics" hint="A small tap on your phone" checked={settings.haptics} onChange={(haptics) => update({ haptics })} />
          <Toggle label="Quick mode" hint="Shorter pauses, less reading" checked={settings.quick} onChange={(quick) => update({ quick })} />
        </section>

        <section class="card settings-group" aria-labelledby="practice-title">
          <h2 id="practice-title">Practice step</h2>
          <Segmented
            label="Practice step"
            options={DEPTH_OPTIONS}
            value={depthChoice}
            onChange={(choice) => update({ depthOverride: choice === 'auto' ? undefined : choice })}
          />
          <p class="settings-hint">{depthHint(depthChoice)}</p>
        </section>

        <section class="card settings-group" aria-labelledby="data-title">
          <h2 id="data-title">Your data</h2>
          <p class="settings-hint">Everything lives on this device. Export a copy to keep it safe or move it to another phone.</p>
          <Button variant="secondary" onClick={exportData}>
            Export progress
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Import progress
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
          {confirming ? (
            <ResetConfirm onCancel={() => setConfirming(false)} onConfirm={erase} />
          ) : (
            <Button variant="secondary" class="danger" onClick={() => setConfirming(true)}>
              Reset progress
            </Button>
          )}
          <p class="settings-status" role="status">
            {status}
          </p>
        </section>

        <a class="card settings-link" href="#/about">
          About and licences
          <span aria-hidden="true">›</span>
        </a>
      </div>
      <TabBar current="settings" />
    </main>
  );
}
