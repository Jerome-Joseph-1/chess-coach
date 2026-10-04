import type { ComponentChildren } from 'preact';
import { Dock, DockButton } from '../../pause/Dock';
import { Remember } from '../../pause/steps/Result';
import { MiniBoard } from '../../screens/home/MiniBoard';
import { EmptyCard } from '../../screens/shared/EmptyCard';
import { Icon } from '../../screens/shared/icons';
import { UNIT_ICONS } from '../../screens/shared/unitIcons';
import type { Answer } from '../open';
import type { LessonPosition } from '../select';
import type { UnitId } from '../types';
import { INTROS } from './intros';
import '../../pause/pause.css';

interface Action {
  label: string;
  onClick: () => void;
}

interface PageProps {
  label: string;
  action?: Action;
  /** A second way on, over the main one. */
  secondary?: Action;
  children: ComponentChildren;
}

/** A lesson page without the board: its content scrolls over the dock, which holds the way on. */
function Page({ label, action, secondary, children }: PageProps) {
  return (
    <section class="lesson-page" aria-label={label}>
      <div class="lesson-scroll">{children}</div>
      {action && (
        <Dock>
          {secondary && (
            <div class="dock-row">
              <DockButton look="secondary" wide label={secondary.label} onClick={secondary.onClick} />
            </div>
          )}
          <div class="dock-row">
            <DockButton look="primary" wide nudge label={action.label} onClick={action.onClick} />
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

/** What the pattern is and how to spot it, before the worked example; the nav bar already names the lesson. */
export function Intro({ unit, action }: IntroProps) {
  const { intro, spot } = INTROS[unit];
  return (
    <Page label="About this pattern" action={action}>
      <div class="lesson-hero rise-in">
        <span class="tile lesson-icon" aria-hidden="true">
          <Icon name={UNIT_ICONS[unit]} size={28} />
        </span>
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
  answers: Answer[];
  /** A round of more practice rather than the lesson. */
  more: boolean;
  remember: string;
  /** Another round of new practice positions, while the unit has some left. */
  moreAction?: Action;
  onContinue: () => void;
}

/** The moves from the start of the game to a practice position. */
function movesTo({ game, turnIndex }: LessonPosition): string[] {
  return [...game.start, ...game.moves.slice(0, game.turns[turnIndex].ply)];
}

/** The practice positions missed, by number, and where they come back. */
function Missed({ answers }: { answers: Answer[] }) {
  const missed = answers.flatMap((answer, i) => (answer.correct ? [] : [{ number: i + 1, position: answer.position }]));
  if (missed.length === 0) return null;
  return (
    <section class="lesson-missed rise-in" style={{ '--i': 1 }} aria-labelledby="missed-title">
      <h3 id="missed-title" class="eyebrow">
        To review
      </h3>
      <ul>
        {missed.map(({ number, position }) => (
          <li key={number}>
            <MiniBoard moves={movesTo(position)} side={position.game.side} />
            <span>Practice {number}</span>
          </li>
        ))}
      </ul>
      <p>{missed.length === 1 ? 'It comes' : 'They come'} back for review on Today, starting tomorrow.</p>
    </section>
  );
}

/** How the practice went, the positions to review, and the takeaway to bring into the next games. */
export function Summary({ answers, more, remember, moreAction, onContinue }: SummaryProps) {
  const right = answers.filter((a) => a.correct).length;
  const done = more ? 'Practice done' : 'Lesson done';
  return (
    <Page label={done} action={{ label: 'Continue', onClick: onContinue }} secondary={moreAction}>
      <div class="lesson-hero rise-in">
        <span class="tile lesson-icon tile--right" aria-hidden="true">
          <Icon name="check" size={28} />
        </span>
        <p class="eyebrow">{done}</p>
        {answers.length > 0 ? (
          <>
            <h2 class="lesson-score">
              {right} of {answers.length}
            </h2>
            <p class="lesson-intro">Practice positions you found without a hint.</p>
          </>
        ) : (
          <p class="lesson-intro">You will meet this pattern again in your next games.</p>
        )}
      </div>
      <Missed answers={answers} />
      <Remember text={remember} />
    </Page>
  );
}

/** A message in place of the lesson, e.g. when it cannot be loaded. */
export function Notice({ text, action }: { text: string; action?: PageProps['action'] }) {
  return (
    <Page label="Lesson" action={action}>
      <EmptyCard text={text} />
    </Page>
  );
}
