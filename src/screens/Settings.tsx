import { useRef, useState } from 'preact/hooks';
import type { Depth, Settings as SettingsData } from '../content/types';
import { dayKey } from '../progress/days';
import { DEPTHS, DEPTH_BLURBS, stageLine } from '../progress/depth';
import { exportProgress, getSettings, importProgress, resetProgress, saveSettings, type StoredSettings } from '../progress/store';
import { Button } from '../ui/Button';
import { downloadJson } from './shared/download';
import { Back, Chevron } from './shared/icons';
import { Segmented } from './shared/Segmented';
import './shared/screen.css';
import './settings.css';

type StageChoice = 'auto' | Depth;

const THEME_OPTIONS: { value: SettingsData['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const STAGE_OPTIONS: { value: StageChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...DEPTHS.map((value) => ({ value, label: String(value) })),
];

function applyTheme(theme: SettingsData['theme']): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function stageHint(choice: StageChoice): string {
  if (choice === 'auto') return 'Auto moves you up a stage when you play it right, and back down if it gets hard.';
  return `${stageLine(choice)}. ${DEPTH_BLURBS[choice]}.`;
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} class="row switch-row" onClick={() => onChange(!checked)}>
      <span class="row-main">
        <span>{label}</span>
        <span class="row-sub">{hint}</span>
      </span>
      <span class="switch" aria-hidden="true">
        <span class="switch-knob" />
      </span>
    </button>
  );
}

function ResetConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div class="confirm" role="alertdialog" aria-labelledby="reset-title">
      <h3 id="reset-title">Erase all progress on this device?</h3>
      <p class="muted">Your games, stages and reviews are cleared. Settings stay. This cannot be undone.</p>
      <div class="confirm-actions">
        <Button variant="secondary" onClick={onCancel}>
          Keep my progress
        </Button>
        <Button variant="secondary" class="danger" onClick={onConfirm}>
          Erase progress
        </Button>
      </div>
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

  const stageChoice: StageChoice = settings.depthOverride ?? 'auto';

  return (
    <main class="screen">
      <a class="screen-back" href="#/">
        <Back /> Today
      </a>
      <h1 class="screen-title">Settings</h1>

      <section aria-labelledby="look-title">
        <h2 id="look-title" class="section-label">
          Look and feel
        </h2>
        <ul class="card list">
          <li class="row row-stack">
            <span>Theme</span>
            <Segmented label="Theme" options={THEME_OPTIONS} value={settings.theme} onChange={chooseTheme} />
          </li>
          <li>
            <Switch label="Sound" hint="Chimes when you get things right" checked={settings.sound} onChange={(sound) => update({ sound })} />
          </li>
          <li>
            <Switch label="Haptics" hint="A small tap on your phone" checked={settings.haptics} onChange={(haptics) => update({ haptics })} />
          </li>
          <li>
            <Switch label="Quick mode" hint="Shorter pauses, less reading" checked={settings.quick} onChange={(quick) => update({ quick })} />
          </li>
        </ul>
      </section>

      <section aria-labelledby="stage-title">
        <h2 id="stage-title" class="section-label">
          Practice
        </h2>
        <div class="card">
          <div class="row row-stack">
            <span>Stage</span>
            <Segmented
              label="Stage"
              options={STAGE_OPTIONS}
              value={stageChoice}
              onChange={(choice) => update({ depthOverride: choice === 'auto' ? undefined : choice })}
            />
            <span class="row-sub">{stageHint(stageChoice)}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="data-title">
        <h2 id="data-title" class="section-label">
          Your data
        </h2>
        <ul class="card list">
          <li>
            <button type="button" class="row" onClick={exportData}>
              <span class="row-main">
                <span>Export progress</span>
                <span class="row-sub">Save a copy as a file</span>
              </span>
            </button>
          </li>
          <li>
            <button type="button" class="row" onClick={() => fileInput.current?.click()}>
              <span class="row-main">
                <span>Import progress</span>
                <span class="row-sub">Restore a copy from a file</span>
              </span>
            </button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
          </li>
          <li>
            {confirming ? (
              <ResetConfirm onCancel={() => setConfirming(false)} onConfirm={erase} />
            ) : (
              <button type="button" class="row row-danger" onClick={() => setConfirming(true)}>
                <span class="row-main">
                  <span>Reset progress</span>
                  <span class="row-sub">Erase games, stages and reviews on this device</span>
                </span>
              </button>
            )}
          </li>
        </ul>
        <p class="settings-status" role="status">
          {status}
        </p>
      </section>

      <a class="card row about-row" href="#/about">
        <span class="row-main">About and licences</span>
        <Chevron />
      </a>
    </main>
  );
}
