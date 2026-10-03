import { CoachMark } from '../../pause/Coach';
import { CrossFade } from '../../pause/CrossFade';
import { Dock, DockButton, RoundButton } from '../../pause/Dock';
import type { GameSession, SessionView } from '../../game/session';

const WATCHING = "Watching the game. I'll stop at the next key position.";
const WAITING = "Press Play and I'll stop at the next key position.";
const NONE_LEFT = 'No key positions left. Play on to the end.';

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

/** The coach's one line, with its small mark. */
export function CoachLine({ text }: { text: string }) {
  return (
    <div class="coach-line">
      <CoachMark small />
      <p aria-live="polite">
        <CrossFade value={text}>{text}</CrossFade>
      </p>
    </div>
  );
}

function mainLabel({ phase, returning }: SessionView): string {
  if (phase.kind === 'playing') return 'Pause';
  return returning ? 'Continue' : 'Play';
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
  return (
    <>
      <div class="game-panel">
        <CoachLine text={coachLine(view)} />
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
            onClick={() => (playing ? session.pausePlayback() : session.play())}
          />
          <RoundButton icon="chevron-right" label="Next move" disabled={!controls.forward} onClick={() => session.stepForward()} />
        </div>
      </Dock>
    </>
  );
}
