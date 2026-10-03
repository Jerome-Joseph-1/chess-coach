import { DEFAULT_POSITION, type Color, type PieceSymbol } from 'chess.js';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import type { BoardController } from '../board/types';
import { openingById } from '../content/catalog';
import { loadGame, loadSet } from '../content/loader';
import type { Level, OpeningId, Side } from '../content/types';
import { lostPieces, materialLead } from '../game/material';
import { GameSession, type SessionDeps, type SessionView } from '../game/session';
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
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
  };
}

function keyPositionLabel(view: SessionView | null, review: boolean): string {
  if (review) return 'Review';
  if (view?.phase.kind === 'pause' && view.phase.practice) return 'Practice';
  const total = view?.dots.length ?? 0;
  if (!view || total === 0) return '';
  const done = view.dots.filter((dot) => dot === 'good' || dot === 'bad').length;
  return `Key position ${Math.min(done + 1, total)} of ${total}`;
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

  const paused = view?.phase.kind === 'pause';

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

      <MoveStrip moves={view?.history ?? []} shown={view?.shown ?? 0} />

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

function MoveStrip({ moves, shown }: { moves: string[]; shown: number }) {
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    strip.current?.querySelector('.is-last')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [moves.length, shown]);

  return (
    <ol class="game-moves" ref={strip} aria-label="Moves">
      {moves.map((san, i) => (
        <li key={i} class={i === shown - 1 ? 'is-last' : undefined}>
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
  if (!game || phase.kind === 'loading') return <Status text="Loading…" />;
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
  if (phase.kind === 'ready' || phase.kind === 'playing') return <Controls view={view} session={session} />;
  if (phase.kind === 'done') {
    return (
      <div class="game-done">
        <Status text={phase.outcome} />
        <Button variant="primary" size="lg" onClick={() => navigate('/recap')}>
          Finish
        </Button>
      </div>
    );
  }
  return <Status text={view.status} />;
}

function lookingBackLine({ shown, history }: SessionView): string {
  return shown < history.length ? `Move ${shown} of ${history.length} · you are looking back` : '';
}

function mainLabel({ phase, returning }: SessionView): string {
  if (phase.kind === 'playing') return 'Pause';
  return returning ? 'Continue' : 'Play';
}

function Controls({ view, session }: { view: SessionView; session: GameSession }) {
  const { controls } = view;
  const playing = view.phase.kind === 'playing';
  return (
    <>
      <p class="game-looking" aria-live="polite">
        {lookingBackLine(view)}
      </p>
      <div class="game-controls">
        <StepButton label="Previous key position" disabled={!controls.previousKey} onClick={() => session.previousKeyPosition()}>
          <path d="M6 5v14M18 5l-9 7 9 7" />
        </StepButton>
        <StepButton label="Previous move" disabled={!controls.back} onClick={() => session.stepBack()}>
          <path d="M15 5l-7 7 7 7" />
        </StepButton>
        <Button variant={playing ? 'secondary' : 'primary'} class="game-main" onClick={() => (playing ? session.pausePlayback() : session.play())}>
          {mainLabel(view)}
        </Button>
        <StepButton label="Next move" disabled={!controls.forward} onClick={() => session.stepForward()}>
          <path d="M9 5l7 7-7 7" />
        </StepButton>
      </div>
    </>
  );
}

interface StepButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ComponentChildren;
}

function StepButton({ label, disabled, onClick, children }: StepButtonProps) {
  return (
    <button class="game-step" type="button" aria-label={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
