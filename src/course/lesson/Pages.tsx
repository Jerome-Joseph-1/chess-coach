import type { ComponentChildren } from 'preact';
import { Dock, DockButton } from '../../pause/Dock';
import { Remember } from '../../pause/steps/Result';
import { Icon } from '../../screens/shared/icons';
import { UNIT_ICONS } from '../../screens/shared/unitIcons';
import type { Score } from '../path';
import type { UnitId } from '../types';
import { UNITS } from '../units';
import { INTROS } from './intros';
import '../../pause/pause.css';

interface PageProps {
  label: string;
  action?: { label: string; onClick: () => void };
  children: ComponentChildren;
}

/** A lesson page without the board: its content scrolls over the dock, which holds the one way on. */
function Page({ label, action, children }: PageProps) {
  return (
    <section class="lesson-page" aria-label={label}>
      <div class="lesson-scroll">{children}</div>
      {action && (
        <Dock>
          <div class="dock-row">
            <DockButton look="primary" wide label={action.label} onClick={action.onClick} />
          </div>
        </Dock>
      )}
    </section>
  );
}

export interface IntroProps {
  unit: UnitId;
  /** "Show me an example", or nothing while the lesson loads. */
  action?: PageProps['action'];
}

/** What the pattern is and how to spot it, before the worked example. */
export function Intro({ unit, action }: IntroProps) {
  const { intro, spot } = INTROS[unit];
  return (
    <Page label="About this pattern" action={action}>
      <div class="lesson-hero rise-in">
        <span class="lesson-icon" aria-hidden="true">
          <Icon name={UNIT_ICONS[unit]} size={28} />
        </span>
        <h2 class="lesson-title">{UNITS[unit].title}</h2>
        <p class="lesson-intro">{intro}</p>
      </div>
      <section class="lesson-spot rise-in" style={{ '--i': 2 }} aria-labelledby="spot-title">
        <h3 id="spot-title" class="eyebrow">
          How to spot it
        </h3>
        <ol>
          {spot.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </Page>
  );
}

export interface SummaryProps {
  score: Score;
  remember: string;
  onContinue: () => void;
}

/** How the practice went, and the takeaway to bring into the next games. */
export function Summary({ score, remember, onContinue }: SummaryProps) {
  return (
    <Page label="Lesson done" action={{ label: 'Continue', onClick: onContinue }}>
      <div class="lesson-hero rise-in">
        <span class="lesson-icon is-done" aria-hidden="true">
          <Icon name="check" size={28} />
        </span>
        <p class="eyebrow">Lesson done</p>
        {score.total > 0 ? (
          <>
            <h2 class="lesson-score">
              {score.right} of {score.total}
            </h2>
            <p class="lesson-intro">Practice positions you found without a hint.</p>
          </>
        ) : (
          <p class="lesson-intro">You will meet this pattern again in your next games.</p>
        )}
      </div>
      <div class="rise-in" style={{ '--i': 2 }}>
        <Remember text={remember} />
      </div>
    </Page>
  );
}

/** A message in place of the lesson, e.g. when it cannot be loaded. */
export function Notice({ text, action }: { text: string; action?: PageProps['action'] }) {
  return (
    <Page label="Lesson" action={action}>
      <p class="lesson-notice">{text}</p>
    </Page>
  );
}
