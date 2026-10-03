import { DEFAULT_POSITION, type Color, type PieceSymbol } from 'chess.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import type { BoardController } from '../board/types';
import { openingById } from '../content/catalog';
import { loadGame, loadSet } from '../content/loader';
import type { Game as GameData, Level, OpeningId, Side } from '../content/types';
import { lostPieces, materialLead } from '../game/material';
import { GameSession, type SessionDeps, type SessionView } from '../game/session';
import { LineStepper, type LineOption } from '../pause/LineStepper';
import { MissCard } from '../pause/MissCard';
import { PauseSheet } from '../pause/PauseSheet';
import { getDepth, getSettings, playedGameIds, recordGame, recordMoment } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { celebrate, toast } from '../ui/rewards';
import './game.css';

export interface GameProps {
  opening: OpeningId;
  level: Level;
  /** Replay a past pause as a review: the game jumps to just before this ply. */
  review?: { gameId: string; ply: number };
}

const TITLES: Record<OpeningId, string> = { italian: 'Italian Game', 'caro-kann': 'Caro-Kann Defence' };
const GLYPHS: Record<PieceSymbol, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };

/** Phases that hand the slot under the board to a sheet. */
const PAUSED_PHASES = new Set<SessionView['phase']['kind']>(['pause', 'miss', 'lines']);

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
    celebrate,
    toast,
    navigate,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
  };
}

function keyPositionLabel(view: SessionView | null, review: boolean): string {
  if (review) return 'Review';
  const total = view?.dots.length ?? 0;
  if (!view || total === 0) return '';
  const done = view.dots.filter((dot) => dot === 'good' || dot === 'bad').length;
  return `Key position ${Math.min(done + 1, total)} of ${total}`;
}

function refutationLine(game: GameData, turnIndex: number, uci: string): LineOption {
  const turn = game.turns[turnIndex];
  return { id: 'refutation', label: 'Why it loses', fen: turn.fen, moves: [uci, ...turn.refutations[uci]] };
}

export function Game({ opening, level, review }: GameProps) {
  const [board, setBoard] = useState<BoardController | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const session = useRef<GameSession | null>(null);
  const side = view?.game?.side ?? openingById(opening).side;

  function startSession(controller: BoardController) {
    const next = new GameSession(opening, level, review, sessionDeps(controller));
    session.current = next;
    next.subscribe(setView);
    setBoard(controller);
    void next.start();
  }

  useEffect(() => () => session.current?.dispose(), []);

  const paused = view ? PAUSED_PHASES.has(view.phase.kind) : false;

  return (
    <main class={paused ? 'game is-paused' : 'game'}>
      <header class="game-top">
        <button class="game-back" type="button" aria-label="Back" onClick={() => navigate(review ? '/review' : '/')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 class="game-title">{TITLES[opening]}</h1>
        <span class="game-pill">{keyPositionLabel(view, Boolean(review))}</span>
      </header>

      <PlayerBar
        role="opponent"
        name={sideName(otherSide(side))}
        detail={`Rated ${level}`}
        fen={view?.fen ?? DEFAULT_POSITION}
        color={otherSide(side)}
      />
      <div class="game-board">
        <Board fen={DEFAULT_POSITION} orientation={side} onReady={startSession} />
      </div>
      <PlayerBar role="you" name="You" detail={sideName(side)} fen={view?.fen ?? DEFAULT_POSITION} color={side} />

      <MoveStrip moves={view?.history ?? []} />

      <section class="game-slot">
        {view && board && session.current && <Slot view={view} board={board} session={session.current} />}
        {!view && <Status text="Loading…" />}
      </section>
    </main>
  );
}

interface PlayerBarProps {
  role: 'opponent' | 'you';
  name: string;
  detail: string;
  fen: string;
  color: Color;
}

/** Shows what this player has captured and, when ahead, by how much. */
function PlayerBar({ role, name, detail, fen, color }: PlayerBarProps) {
  const lead = materialLead(fen, color);
  const captured = lostPieces(fen, otherSide(color));
  return (
    <div class={`game-player is-${role}`}>
      <span class="game-player-name">{name}</span>
      <span class="game-player-detail">{detail}</span>
      <span class="game-captured" aria-label="Captured pieces">
        {captured.map((type) => GLYPHS[type]).join('')}
      </span>
      {lead > 0 && <span class="game-lead">+{lead}</span>}
    </div>
  );
}

function MoveStrip({ moves }: { moves: string[] }) {
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [moves.length]);

  return (
    <ol class="game-moves" ref={strip} aria-label="Moves">
      {moves.map((san, i) => (
        <li key={i} class={i === moves.length - 1 ? 'is-last' : undefined}>
          {i % 2 === 0 && <span class="game-move-no">{i / 2 + 1}.</span>}
          {san}
        </li>
      ))}
    </ol>
  );
}

function Status({ text }: { text: string }) {
  return (
    <p class="game-status" role="status">
      {text}
    </p>
  );
}

interface SlotProps {
  view: SessionView;
  board: BoardController;
  session: GameSession;
}

function Slot({ view, board, session }: SlotProps) {
  const { phase, game } = view;
  if (phase.kind === 'error') {
    return (
      <>
        <Status text={phase.message} />
        <Button onClick={() => navigate('/')}>Back to home</Button>
      </>
    );
  }
  if (!game) return <Status text="Loading…" />;
  if (phase.kind === 'pause') {
    return (
      <PauseSheet
        key={`${game.id}:${phase.turnIndex}`}
        game={game}
        turnIndex={phase.turnIndex}
        type={phase.type}
        depth={view.depth}
        board={board}
        onDone={(result) => session.pauseDone(result)}
      />
    );
  }
  if (phase.kind === 'miss') {
    return (
      <MissCard
        key={`${game.id}:${phase.turnIndex}`}
        game={game}
        turnIndex={phase.turnIndex}
        playedUci={phase.playedUci}
        board={board}
        onContinue={() => session.missContinue()}
      />
    );
  }
  if (phase.kind === 'lines') {
    return (
      <>
        <LineStepper
          board={board}
          homeFen={game.turns[phase.turnIndex].fen}
          userSide={game.side}
          lines={[refutationLine(game, phase.turnIndex, phase.uci)]}
        />
        <Button onClick={() => void session.closeLines()}>Back to my move</Button>
      </>
    );
  }
  return (
    <>
      <Status text={view.status} />
      {view.showMe && <Button onClick={() => session.showLines()}>Show me</Button>}
    </>
  );
}
