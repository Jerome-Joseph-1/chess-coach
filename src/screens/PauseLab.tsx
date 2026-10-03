import { useEffect, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import type { BoardController } from '../board/types';
import type { Depth, Game } from '../content/types';
import { loadGame } from '../content/loader';
import { PauseSheet, type PauseResult } from '../pause/PauseSheet';
import { Button } from '../ui/Button';
import '../pause/lab/lab.css';

const GAME_IDS = ['italian-1400-0001', 'italian-1400-0002'];
const STAGES: Depth[] = [1, 2, 3, 4, 5];
const STAGE_NAMES = ['Notice', 'Point', 'Play', 'Follow through', 'Finish'];

interface LabPick {
  game: number;
  turn: number;
}

interface LabTurn extends LabPick {
  moveNo: number;
  tag: string;
}

function labTurns(games: Game[]): LabTurn[] {
  return games.flatMap((game, g) =>
    game.turns.flatMap((turn, t) => {
      if (turn.label === 'gray') return [];
      const tag = turn.label === 'nothing' ? 'Quiet' : turn.kinds.join(' + ');
      return [{ game: g, turn: t, moveNo: turn.moveNo, tag }];
    }),
  );
}

/** Reads #/lab?game=1&move=7&stage=3 so a case can be opened straight from a link. */
function pickFromHash(games: Game[]): { pick: LabPick; stage: Depth } | null {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const game = Number(params.get('game')) - 1;
  const turn = games[game]?.turns.findIndex((t) => t.moveNo === Number(params.get('move')));
  if (turn === undefined || turn < 0) return null;
  const stage = Math.min(5, Math.max(1, Number(params.get('stage')) || 3)) as Depth;
  return { pick: { game, turn }, stage };
}

interface StageProps {
  stage: Depth;
  onChange: (stage: Depth) => void;
}

function StageButtons({ stage, onChange }: StageProps) {
  return (
    <div class="lab-stages" role="group" aria-label="Stage">
      {STAGES.map((s) => (
        <button key={s} type="button" class="lab-stage" aria-pressed={s === stage} onClick={() => onChange(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}

function StageSelector(props: StageProps) {
  return (
    <div>
      <StageButtons {...props} />
      <p class="lab-muted">
        Stage {props.stage}: {STAGE_NAMES[props.stage - 1]}
      </p>
    </div>
  );
}

function Picker({ games, stage, onStage, onPick }: { games: Game[]; stage: Depth; onStage: (s: Depth) => void; onPick: (p: LabPick) => void }) {
  const turns = labTurns(games);
  return (
    <main class="lab">
      <h1 class="lab-title">Pause lab</h1>
      <p class="lab-muted">Pick a position. Each one opens the pause at the chosen stage.</p>
      <StageSelector stage={stage} onChange={onStage} />
      {games.map((game, g) => (
        <section key={game.id}>
          <h2 class="lab-group">Game {g + 1}</h2>
          <div class="lab-turns">
            {turns
              .filter((t) => t.game === g)
              .map((t) => (
                <button key={t.turn} type="button" class="lab-turn" onClick={() => onPick(t)}>
                  Move {t.moveNo}
                  <small>{t.tag}</small>
                </button>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function Result({ result, onAgain }: { result: PauseResult; onAgain: () => void }) {
  return (
    <section class="lab-result" aria-label="Result">
      <h2 class="lab-title">Done</h2>
      <dl>
        <dt>resumePly</dt>
        <dd data-testid="resume-ply">{result.resumePly}</dd>
        <dt>outcomes</dt>
        <dd data-testid="outcomes">{result.outcomes.map((o) => `${o.step}:${o.correct ? 'yes' : 'no'}`).join(' ') || 'none'}</dd>
      </dl>
      <Button size="lg" onClick={onAgain}>
        Run again
      </Button>
    </section>
  );
}

interface RunProps {
  game: Game;
  pick: LabPick;
  stage: Depth;
  run: number;
  onStage: (s: Depth) => void;
  onAgain: () => void;
  onExit: () => void;
}

/** One attempt: a fresh board and sheet each time `run` changes. The board and the slot match the game screen. */
function Attempt({ game, pick, stage, onAgain }: Pick<RunProps, 'game' | 'pick' | 'stage' | 'onAgain'>) {
  const [board, setBoard] = useState<BoardController | null>(null);
  const [result, setResult] = useState<PauseResult | null>(null);
  const turn = game.turns[pick.turn];
  return (
    <>
      <div class="lab-board">
        <Board fen={turn.fen} orientation={game.side} onReady={setBoard} />
      </div>
      <section class="lab-slot">
        {result && <Result result={result} onAgain={onAgain} />}
        {board && !result && (
          <PauseSheet
            game={game}
            turnIndex={pick.turn}
            type={turn.label === 'nothing' ? 'nothing' : 'pause'}
            depth={stage}
            board={board}
            onDone={setResult}
          />
        )}
      </section>
    </>
  );
}

function Run({ game, pick, stage, run, onStage, onAgain, onExit }: RunProps) {
  const turn = game.turns[pick.turn];
  return (
    <main class="lab-run">
      <header class="lab-bar">
        <button type="button" class="lab-back" onClick={onExit}>
          Lab
        </button>
        <span class="lab-label">
          Move {turn.moveNo} · {turn.label === 'nothing' ? 'quiet' : turn.kinds.join(' + ')}
        </span>
        <StageButtons stage={stage} onChange={onStage} />
      </header>
      <Attempt key={run} game={game} pick={pick} stage={stage} onAgain={onAgain} />
    </main>
  );
}

export function PauseLab() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<LabPick | null>(null);
  const [stage, setStage] = useState<Depth>(3);
  const [run, setRun] = useState(0);

  useEffect(() => {
    Promise.all(GAME_IDS.map((id) => loadGame('italian', 1400, id)))
      .then((loaded) => {
        setGames(loaded);
        const linked = pickFromHash(loaded);
        if (linked) {
          setPick(linked.pick);
          setStage(linked.stage);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <main class="lab">The fixture games did not load.</main>;
  if (!games) return <main class="lab" />;
  if (!pick) {
    return (
      <Picker
        games={games}
        stage={stage}
        onStage={setStage}
        onPick={(p) => {
          setPick(p);
          setRun((n) => n + 1);
        }}
      />
    );
  }
  return (
    <Run
      game={games[pick.game]}
      pick={pick}
      stage={stage}
      run={run}
      onStage={(s) => {
        setStage(s);
        setRun((n) => n + 1);
      }}
      onAgain={() => setRun((n) => n + 1)}
      onExit={() => setPick(null)}
    />
  );
}
