import { DEFAULT_POSITION } from 'chess.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import type { BoardController, MovedPiece } from '../board/types';
import { openingById } from '../content/catalog';
import { loadGame, loadSet } from '../content/loader';
import type { Level, OpeningId, Side } from '../content/types';
import { Analysis } from '../engine/Analysis';
import { GameSession, type SessionDeps, type SessionView } from '../game/session';
import { noteFor } from '../opening';
import { CoachBubble } from '../pause/Coach';
import { CrossFade } from '../pause/CrossFade';
import { Dock, DockButton } from '../pause/Dock';
import { boardSize } from '../pause/fit';
import { PauseSheet, type PauseOutcome, type PauseStage, type Verdict } from '../pause/PauseSheet';
import { Icon } from '../pause/steps/icons';
import { dropReview, getDepth, getSettings, markNoteSeen, noteSeenCount, playedGameIds, recordGame, recordMoment } from '../progress/store';
import { navigate } from '../router';
import { celebrate, toast } from '../ui/rewards';
import { Controls, CoachLine } from './game/Controls';
import { MoveStrip } from './game/MoveStrip';
import { PlayerBar, type FreshCapture } from './game/PlayerBar';
import './game.css';

export interface GameProps {
  opening: OpeningId;
  level: Level;
  /** Replay a past pause as a review: the game jumps to just before this ply. */
  review?: { gameId: string; ply: number };
}

/** Which layout the screen is in: the game playing or waiting, a question, its answer, the engine, or the end. */
type Mode = 'play' | 'ask' | 'answer' | 'analysis' | 'done';

const TITLES: Record<OpeningId, string> = { italian: 'Italian Game', 'caro-kann': 'Caro-Kann Defence' };
const ENGINE_NOTE = 'Stockfish on your phone';

const sideName = (side: Side) => (side === 'w' ? 'White' : 'Black');
const otherSide = (side: Side): Side => (side === 'w' ? 'b' : 'w');

function sessionDeps(board: BoardController): SessionDeps {
  return {
    board,
    loadSet,
    loadGame,
    getDepth,
    isQuick: () => getSettings().quick,
    playedGameIds,
    recordMoment,
    recordGame,
    dropReview,
    celebrate,
    toast,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
    noteFor,
    noteSeenCount,
    markNoteSeen,
  };
}

function modeOf(view: SessionView | null, analysing: boolean, stage: PauseStage): Mode {
  if (analysing) return 'analysis';
  if (view?.phase.kind === 'pause') return stage === 'ask' ? 'ask' : stage === 'answer' ? 'answer' : 'analysis';
  return view?.phase.kind === 'done' ? 'done' : 'play';
}

function subtitle(view: SessionView | null, review: boolean, mode: Mode): string {
  if (mode === 'analysis') return ENGINE_NOTE;
  if (review) return 'Review';
  if (view?.phase.kind === 'pause' && view.phase.practice) return 'Practice';
  const total = view?.dots.length ?? 0;
  if (!view || total === 0) return '';
  const done = view.dots.filter((dot) => dot === 'good' || dot === 'bad').length;
  if (view.phase.kind === 'pause') return `Key position ${Math.min(done + 1, total)} of ${total}`;
  return `Key positions · ${done} of ${total}`;
}

/** The key of the open pause, so a stage reported by one pause is not taken for the next. */
function pauseKey(view: SessionView | null): string | null {
  const phase = view?.phase;
  return phase?.kind === 'pause' ? `${view!.game?.id}:${phase.turnIndex}:${phase.practice ?? ''}` : null;
}

export function Game({ opening, level, review }: GameProps) {
  const [board, setBoard] = useState<BoardController | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ key: string | null; stage: PauseStage } | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<number, Verdict>>(new Map());
  const [fresh, setFresh] = useState<FreshCapture | null>(null);
  const session = useRef<GameSession | null>(null);
  const side = view?.game?.side ?? openingById(opening).side;

  const key = pauseKey(view);
  const stage = staged && staged.key === key ? staged.stage : 'ask';
  const mode = modeOf(view, analysisFen !== null, stage);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  function startSession(controller: BoardController) {
    const next = new GameSession(opening, level, review, sessionDeps(controller));
    session.current = next;
    next.subscribe(setView);
    setBoard(controller);
    void next.start();
  }

  useEffect(() => () => session.current?.dispose(), []);

  // A capture the game plays pops into the taker's tray as the board lands it; a step back just takes it out.
  useEffect(() => {
    if (!board) return;
    return board.onMoved(({ captured, undo }: MovedPiece) => {
      if (captured && !undo && modeRef.current === 'play') setFresh((last) => ({ ...captured, id: (last?.id ?? 0) + 1 }));
    });
  }, [board]);

  function pauseDone(result: PauseOutcome) {
    const phase = view?.phase;
    const game = view?.game;
    if (game && phase?.kind === 'pause' && !phase.practice) {
      const at = game.start.length + game.turns[phase.turnIndex].ply;
      setMarks((all) => (all.has(at) ? all : new Map(all).set(at, result.verdict)));
    }
    session.current?.pauseDone(result);
  }

  const fen = view?.fen ?? DEFAULT_POSITION;
  return (
    <main class="game" data-mode={mode} data-size={boardSize(mode)}>
      <header class="game-top">
        <button class="game-back" type="button" aria-label="Back" onClick={() => navigate('/')}>
          <Icon name="chevron-left" />
        </button>
        <div class="game-heading">
          <h1 class="game-title">{mode === 'analysis' ? 'Analysis' : TITLES[opening]}</h1>
          <p class="game-sub">
            <CrossFade value={subtitle(view, Boolean(review), mode)}>{subtitle(view, Boolean(review), mode)}</CrossFade>
          </p>
        </div>
        <span class="game-top-end" aria-hidden="true" />
      </header>

      <MoveStrip moves={view?.history ?? []} shown={view?.shown ?? 0} marks={marks} />
      <PlayerBar role="opponent" name={sideName(otherSide(side))} detail={String(level)} fen={fen} color={otherSide(side)} fresh={fresh} />
      <div class="game-board">
        <Board fen={DEFAULT_POSITION} orientation={side} onReady={startSession} />
      </div>
      <PlayerBar role="you" name="You" detail={sideName(side)} fen={fen} color={side} fresh={fresh} />

      <section class="game-slot">
        {!view && <CoachLine text="Loading…" />}
        {view && board && session.current && analysisFen !== null && (
          <div class="pause-sheet" role="region" aria-label="Analysis">
            <Analysis board={board} fen={analysisFen} userSide={side} docked onClose={() => setAnalysisFen(null)} />
          </div>
        )}
        {view && board && session.current && analysisFen === null && (
          <Slot
            view={view}
            review={Boolean(review)}
            board={board}
            session={session.current}
            onAnalyse={() => setAnalysisFen(board.fen())}
            onPauseDone={pauseDone}
            onStage={(next) => setStaged({ key, stage: next })}
          />
        )}
      </section>
    </main>
  );
}

interface SlotProps {
  view: SessionView;
  review: boolean;
  board: BoardController;
  session: GameSession;
  onAnalyse: () => void;
  onPauseDone: (result: PauseOutcome) => void;
  onStage: (stage: PauseStage) => void;
}

function Slot({ view, review, board, session, onAnalyse, onPauseDone, onStage }: SlotProps) {
  const { phase, game } = view;
  if (phase.kind === 'error') return <Ending eyebrow="Something went wrong" text={phase.message} action="Back to home" onAction={() => navigate('/')} />;
  if (!game || phase.kind === 'loading') return <CoachLine text="Loading…" />;
  if (phase.kind === 'pause') {
    return (
      <PauseSheet
        key={`${game.id}:${phase.turnIndex}`}
        game={game}
        turnIndex={phase.turnIndex}
        type={phase.type}
        depth={view.depth}
        board={board}
        onDone={onPauseDone}
        onStage={onStage}
      />
    );
  }
  if (phase.kind === 'done') {
    const eyebrow = review ? 'Review' : `Game over · ${Math.ceil(view.history.length / 2)} moves`;
    return <Ending eyebrow={eyebrow} text={phase.outcome} action="Finish" onAction={() => navigate(review ? '/' : '/recap')} />;
  }
  return <Controls view={view} session={session} onAnalyse={onAnalyse} />;
}

interface EndingProps {
  eyebrow: string;
  /** The first sentence is the title, the rest the line under it. */
  text: string;
  action: string;
  onAction: () => void;
}

/** The coach's last word on the game, and the one way on. */
function Ending({ eyebrow, text, action, onAction }: EndingProps) {
  const cut = text.indexOf('. ');
  const [title, body] = cut < 0 ? [text, ''] : [text.slice(0, cut + 1), text.slice(cut + 2)];
  return (
    <div class="pause-sheet" role="region" aria-label={eyebrow}>
      <div class="coach-scroll">
        <div class="coach-panel">
          <CoachBubble tone="neutral" eyebrow={eyebrow} title={title} body={body} />
        </div>
      </div>
      <Dock>
        <div class="dock-row">
          <DockButton look="primary" wide nudge label={action} onClick={onAction} />
        </div>
      </Dock>
    </div>
  );
}
