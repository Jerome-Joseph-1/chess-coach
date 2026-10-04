import { CoachMark } from '../../pause/Coach';
import { CrossFade } from '../../pause/CrossFade';
import { Dock, DockButton, RoundButton } from '../../pause/Dock';
import type { GameSession, SessionView } from '../../game/session';
import './coach-line.css';

const WATCHING = "Watching the game. I'll stop at the next key position.";
const WAITING = "Press Play and I'll stop at the next key position.";
const NONE_LEFT = 'No key positions left. Play on to the end.';
const HOW_IT_WORKS = "I play both sides and stop when it's your turn to find a move. Press Play to start.";

function lookingBack({ shown, history }: SessionView): string | null {
  return shown < history.length ? `Move ${shown} of ${history.length} · you are looking back` : null;
}

/** What the coach says under the board while the game plays or waits. */
function coachLine(view: SessionView): string {
  if (view.phase.kind === 'busy') return view.status;
  const back = lookingBack(view);
  if (back) return back;
  if (view.phase.kind === 'playing') return WATCHING;
  return view.dots.includes('todo') ? WAITING : NONE_LEFT;
}

interface CoachSays {
  /** The variation the board has reached, over the line. */
  name: string | null;
  text: string;
  /** The line is a note on the opening rather than what the game is doing. */
  note: boolean;
}

/** A note on the opening position shown, under the name of its variation; once known, the name over today's line. */
function coachSays(view: SessionView): CoachSays {
  if (view.intro && view.phase.kind === 'ready') return { name: 'How it works', text: HOW_IT_WORKS, note: true };
  // While the game plays, notes flash past too fast to read: keep the variation's name and a steady line.
  if (view.phase.kind === 'playing') return { name: view.note?.name ?? null, text: coachLine(view), note: false };
  const note = view.phase.kind === 'ready' ? view.note : null;
  return { name: note?.name ?? null, text: note?.text ?? coachLine(view), note: Boolean(note?.text) };
}

/** The coach's one line, with its small mark, and the name of the variation over it when there is one. */
export function CoachLine({ text, name = null, note = false }: Partial<CoachSays> & { text: string }) {
  return (
    <div class={`coach-line${name ? ' has-name' : ''}`}>
      <CoachMark small />
      <div class="coach-line-body">
        {name && (
          <CrossFade value={name} class="coach-line-name">
            {name}
          </CrossFade>
        )}
        <p class={note ? 'is-note' : undefined} aria-live="polite">
          <CrossFade value={text}>{text}</CrossFade>
        </p>
      </div>
    </div>
  );
}

function mainLabel({ phase, returning, held }: SessionView): string {
  if (phase.kind === 'playing') return 'Pause';
  return returning || held ? 'Continue' : 'Play';
}

export interface ControlsProps {
  view: SessionView;
  session: GameSession;
  onAnalyse: () => void;
}

/** While the game plays or waits: the coach's line, then the dock with Play in the middle of the step buttons. */
export function Controls({ view, session, onAnalyse }: ControlsProps) {
  const { controls } = view;
  const playing = view.phase.kind === 'playing';
  const busy = view.phase.kind === 'busy';
  const says = coachSays(view);
  return (
    <>
      <div class={`game-panel${says.note ? ' has-note' : says.name ? ' has-name' : ''}`}>
        <CoachLine {...says} />
      </div>
      <Dock label="Game controls">
        <div class="dock-row is-quiet">
          <DockButton
            look="quiet"
            icon="skip-back"
            label="Previous key position"
            disabled={!controls.previousKey}
            onClick={() => session.previousKeyPosition()}
          />
          <DockButton look="quiet" icon="search" label="Analyse" disabled={playing || busy} onClick={onAnalyse} />
        </div>
        <div class="dock-row">
          <RoundButton icon="chevron-left" label="Previous move" disabled={!controls.back} onClick={() => session.stepBack()} />
          <DockButton
            look="primary"
            wide
            fade
            class="game-main"
            icon={playing ? 'pause' : 'play'}
            label={mainLabel(view)}
            disabled={busy}
            nudge={!playing && !busy}
            onClick={() => (playing ? session.pausePlayback() : session.play())}
          />
          <RoundButton icon="chevron-right" label="Next move" disabled={!controls.forward} onClick={() => session.stepForward()} />
        </div>
      </Dock>
    </>
  );
}
