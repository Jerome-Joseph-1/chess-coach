import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Side } from '../content/types';
import { lineSequence } from '../pause/lines';
import { Dock, DockButton } from '../pause/Dock';
import { useFitUnderBoard } from '../pause/fit';
import { LineStepper, NavButton } from '../pause/LineStepper';
import '../pause/pause.css';
import { playLine, samePosition, sanOf, squaresOf, type PlayedMove } from '../pause/position';
import { numberedSan } from '../pause/sequence';
import { TextLink } from '../pause/steps/Actions';
import './analysis.css';
import { engine, isCancelled, type Line } from './engine';
import { sideToMove, type Row } from './explain';
import { barScoreAt, endingOf, finishedLines, nextToAnalyse, noteAt, referenceAt, rowsAt, verdictAt, type Ending, type LineMove, type Lookup } from './model';

export interface AnalysisProps {
  board: BoardController;
  /** The position to explore from. */
  fen: string;
  /** Whose pieces "you" and "your" mean in move captions. */
  userSide: Side;
  /** The move a line plays at `fen`, in uci: the engine's view there is measured against it. */
  played?: string;
  /** The way out; "Done" unless the analysis sits inside something else. */
  closeLabel?: string;
  /** Stop touching the board, e.g. while a sheet hands it back. */
  frozen?: boolean;
  /** Put the ways out in the dock, as buttons; otherwise they are quiet links under the rows. */
  docked?: boolean;
  /** Called once the board has been sent back to the position it showed before the analysis opened. */
  onClose: () => void;
}

const COPY = {
  done: 'Done',
  reset: 'Reset',
  backToPosition: 'Back to the position',
  loading: 'Loading the engine…',
  thinking: 'Thinking…',
  failed: 'The engine could not start on this phone.',
  tryOwn: 'Move a piece to try your own.',
  explore: 'Move a piece for either side.',
};

const ENDINGS: Record<Ending, string> = {
  checkmate: 'Checkmate.',
  stalemate: 'Stalemate: a draw.',
  draw: 'Draw: neither side can mate.',
};

/** Moves of a tapped line played on the board: enough to see what it does. */
const PREVIEW_PLIES = 8;

type Status = 'idle' | 'loading' | 'thinking' | 'failed';

const sideName = (side: Side) => (side === 'w' ? 'White' : 'Black');

/** Shows `fen`: plays the last move when the board stands just before it, so stepping forward looks like a move. */
async function showOnBoard(board: BoardController, fen: string, last: PlayedMove | null): Promise<void> {
  if (samePosition(board.fen(), fen)) return board.setLastMove(last?.uci ?? null);
  if (last && samePosition(board.fen(), last.before)) return board.playMove(last.uci);
  await board.setPosition(fen, true);
  if (last) board.setLastMove(last.uci);
}

/** The reference move in green over the others in orange; before the engine answers, only the line's move. */
function drawArrows(board: BoardController, rows: Row[], lineMove: string | null): void {
  board.clearArrows();
  if (!rows.length && lineMove) board.arrow(...squaresOf(lineMove), 'best');
  for (const row of [...rows].reverse()) board.arrow(...squaresOf(row.line.pv[0]), row.isRef ? 'best' : 'mistake');
}

/**
 * Free analysis from a position: either side can move, ‹ › step through the moves made, and after every
 * change the engine shows its three best lines with arrows, an evaluation bar and a verdict on the last move.
 */
export function Analysis({ board, fen, userSide, played, closeLabel = COPY.done, frozen = false, docked = false, onClose }: AnalysisProps) {
  const [moves, setMoves] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [preview, setPreview] = useState<Row | null>(null);
  const [status, setStatus] = useState<Status>(() => (engine().loaded ? 'thinking' : 'loading'));
  const [, setLearned] = useState(0);
  const cache = useRef(new Map<string, Line[]>());
  const entry = useRef(board.fen());
  const released = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  useFitUnderBoard(panel, panel, docked ? 'analysis' : undefined);

  const lookup: Lookup = (at) => cache.current.get(at) ?? finishedLines(at) ?? undefined;
  const line = useMemo(() => playLine(fen, moves), [fen, moves]);
  const last = cursor > 0 ? line[cursor - 1] : null;
  const here = last?.after ?? fen;
  const before = last?.before ?? null;
  const lineMove: LineMove | undefined = played ? { fen, uci: played } : undefined;
  const ending = endingOf(here);
  const rows = rowsAt(lookup, here, referenceAt(lookup, here, lineMove));
  const rowsKey = rows.map((row) => `${row.line.pv[0]} ${row.isRef}`).join();
  const bar = barScoreAt(lookup, here);
  const live = !frozen && !released.current;

  async function think(alive: () => boolean) {
    const shared = engine();
    try {
      for (let next = nextToAnalyse(lookup, here, before, lineMove); next && alive(); ) {
        setStatus(shared.loaded ? 'thinking' : 'loading');
        const lines = await shared.analyse(next);
        if (!alive()) return;
        cache.current.set(next, lines);
        setLearned((n) => n + 1);
        next = nextToAnalyse(lookup, here, before, lineMove);
      }
      if (alive()) setStatus('idle');
    } catch (error) {
      if (alive() && !isCancelled(error)) setStatus('failed');
    }
  }

  function release() {
    if (released.current) return;
    released.current = true;
    engine().cancel();
    board.disableInput();
    board.clearArrows();
    board.evalBar(null);
  }

  useEffect(() => {
    if (!live) return;
    let alive = true;
    void think(() => alive);
    return () => {
      alive = false;
    };
  }, [here, live]);

  useEffect(() => {
    if (live && !preview) void showOnBoard(board, here, last);
  }, [here, preview, live]);

  useEffect(() => {
    if (!live || preview || ending) return;
    board.enableMoves(sideToMove(here), (uci) => {
      setMoves((all) => [...all.slice(0, cursor), uci]);
      setCursor(cursor + 1);
      return true;
    });
    return () => board.disableInput();
  }, [here, preview, live]);

  useEffect(() => {
    if (live && !preview) drawArrows(board, rows, cursor === 0 ? (played ?? null) : null);
  }, [here, rowsKey, preview, live]);

  useEffect(() => {
    if (live && bar) board.evalBar(bar);
  }, [JSON.stringify(bar), live]);

  useEffect(() => {
    if (frozen) release();
  }, [frozen]);
  useEffect(() => release, []);

  function goTo(n: number) {
    setPreview(null);
    setCursor(Math.max(0, Math.min(moves.length, n)));
  }

  function reset() {
    setPreview(null);
    setMoves([]);
    setCursor(0);
  }

  function close() {
    release();
    void board.setPosition(entry.current, true);
    onClose();
  }

  function caption(): string {
    if (last) return verdictAt(lookup, last.before, last.uci, lineMove) ?? numberedSan(last.before, last.san);
    if (!lineMove) return `${sideName(sideToMove(here))} to move. ${COPY.explore}`;
    const note = noteAt(lookup, lineMove);
    return note ? `${note} ${COPY.tryOwn}` : `Why ${numberedSan(fen, sanOf(fen, lineMove.uci))}?`;
  }

  function message(): string {
    if (ending) return ENDINGS[ending];
    if (status === 'failed') return COPY.failed;
    return status === 'loading' ? COPY.loading : COPY.thinking;
  }

  const sequence = useMemo(
    () => preview && lineSequence(here, preview.line.pv.slice(0, PREVIEW_PLIES), preview.isRef ? 'best' : 'mistake'),
    [preview, here],
  );

  const busy = !ending && (status === 'loading' || status === 'thinking');
  const pick = (row: Row) => setPreview(row.line === preview?.line ? null : row);

  return (
    <>
      <div class={`analysis${docked ? ' is-docked' : ''}`} ref={docked ? panel : undefined}>
        {sequence ? (
          <LineStepper board={board} userSide={userSide} sequence={sequence} frozen={frozen} />
        ) : (
          <div class="stepper">
            <NavButton dir="left" label="Previous move" disabled={cursor === 0} onClick={() => goTo(cursor - 1)} />
            <p class="stepper-caption analysis-caption" aria-live="polite">
              {caption()}
            </p>
            <NavButton dir="right" label="Next move" disabled={cursor === moves.length} onClick={() => goTo(cursor + 1)} />
          </div>
        )}
        <Rows rows={rows} message={message()} busy={busy} picked={preview} onPick={pick} />
        {!docked && (
          <div class="analysis-links">
            {preview ? (
              <TextLink label={COPY.backToPosition} onClick={() => setPreview(null)} />
            ) : (
              <>
                {moves.length > 0 && <TextLink label={COPY.reset} onClick={reset} />}
                <TextLink label={closeLabel} onClick={close} />
              </>
            )}
          </div>
        )}
      </div>
      {docked && (
        <Dock label="Analysis">
          <div class="dock-row">
            {preview ? (
              <DockButton look="secondary" wide label={COPY.backToPosition} onClick={() => setPreview(null)} />
            ) : (
              <>
                <DockButton look="secondary" icon="undo" label={COPY.reset} disabled={moves.length === 0} onClick={reset} />
                <DockButton look="primary" wide label={closeLabel} onClick={close} />
              </>
            )}
          </div>
        </Dock>
      )}
    </>
  );
}

interface RowsProps {
  rows: Row[];
  /** Shown in place of the rows while there are none. */
  message: string;
  /** The engine is at work: a thin bar runs along the top of the card. */
  busy: boolean;
  picked: Row | null;
  onPick: (row: Row) => void;
}

/** Up to three lines; the space for three is kept from the start, so nothing jumps when they arrive one after another. */
function Rows({ rows, message, busy, picked, onPick }: RowsProps) {
  return (
    <div class="analysis-rows">
      {busy && <span class="analysis-progress" role="progressbar" aria-label={message} />}
      {!rows.length && (
        <p class="analysis-status" aria-live="polite">
          {message}
        </p>
      )}
      {rows.map((row, i) => (
        <button
          type="button"
          key={row.line.pv[0]}
          class={`analysis-row rise-in${row.isRef ? ' is-ref' : ''}${picked?.line === row.line ? ' is-picked' : ''}`}
          style={{ '--i': i }}
          aria-pressed={picked?.line === row.line}
          onClick={() => onPick(row)}
        >
          <span class="analysis-score">{row.score}</span>
          <span class="analysis-san">{row.san}</span>
          <span class="analysis-detail">{row.detail}</span>
        </button>
      ))}
    </div>
  );
}
