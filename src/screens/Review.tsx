// @ts-ignore cm-chessboard ships no type declarations
import { Chessboard } from 'cm-chessboard';
import 'cm-chessboard/assets/chessboard.css';
import pieceSprite from 'cm-chessboard/assets/pieces/standard.svg?url';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Side } from '../content/types';
import { Button } from '../ui/Button';
import { downloadJson } from './shared/download';
import { Back } from './shared/icons';
import { KIND_LABELS } from './shared/labels';
import {
  exportReviews,
  flipTurn,
  loadNotes,
  loadPilotItems,
  reviewedCount,
  sanLine,
  saveNotes,
  type PilotItem,
  type PilotNote,
  type PilotNotes,
} from './pilot';
import './shared/screen.css';
import './review.css';

const BOARD_PRELOAD_MARGIN = '600px 0px';

/** Draws the board only while its card is near the screen; a few hundred boards at once would drag. */
function ReadOnlyBoard({ fen, orientation }: { fen: string; orientation: Side }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: BOARD_PRELOAD_MARGIN });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !host.current) return;
    const board = new Chessboard(host.current, {
      position: fen,
      orientation,
      assetsCache: false,
      style: { pieces: { file: pieceSprite }, animationDuration: 0 },
    });
    return () => board.destroy();
  }, [near, fen, orientation]);

  return <div class="pilot-board" ref={host} />;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function Line({ title, text }: { title: string; text: string }) {
  return (
    <p class="pilot-line">
      <strong>{title}</strong> {text}
    </p>
  );
}

function PilotCard({ item, note, onChange }: { item: PilotItem; note: PilotNote; onChange: (patch: PilotNote) => void }) {
  const { turn } = item;
  const { best, mistake, threat } = turn.lines;
  const kinds = turn.kinds.map((k) => KIND_LABELS[k]).join(', ');
  const vote = (value: 'up' | 'down') => onChange({ vote: note.vote === value ? undefined : value });
  return (
    <article class="card pilot-card" id={`pilot-${item.key}`}>
      <ReadOnlyBoard fen={turn.fen} orientation={item.side} />
      <h2>
        Move {turn.moveNo} · <span class={`pilot-label pilot-label--${turn.label}`}>{turn.label}</span>
        {kinds && ` · ${kinds}`}
      </h2>
      <dl class="pilot-facts">
        <div>
          <dt>Wrong share</dt>
          <dd>{percent(turn.wrongShare)}</dd>
        </div>
        <div>
          <dt>Find share</dt>
          <dd>{percent(turn.findShare)}</dd>
        </div>
        <div class="pilot-source">
          <dt>Source</dt>
          <dd>{turn.source}</dd>
        </div>
      </dl>
      {best && <Line title="Best" text={sanLine(turn.fen, best)} />}
      {mistake && <Line title="Mistake" text={sanLine(turn.fen, mistake)} />}
      {threat && <Line title="If you pass" text={sanLine(flipTurn(turn.fen), threat)} />}
      <p class="muted pilot-id">{item.key}</p>
      <div class="pilot-votes" role="group" aria-label="Is the label right?">
        <button type="button" class="pilot-vote pilot-vote--up" aria-pressed={note.vote === 'up'} aria-label="Label is right" onClick={() => vote('up')}>
          👍
        </button>
        <button type="button" class="pilot-vote pilot-vote--down" aria-pressed={note.vote === 'down'} aria-label="Label is wrong" onClick={() => vote('down')}>
          👎
        </button>
      </div>
      <textarea
        class="pilot-note"
        rows={2}
        placeholder="Note (optional)"
        aria-label="Note"
        value={note.note ?? ''}
        onInput={(e) => onChange({ note: e.currentTarget.value })}
      />
    </article>
  );
}

export function Review() {
  const [items, setItems] = useState<PilotItem[] | null>(null);
  const [loaded, setLoaded] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState<PilotNotes>(loadNotes);

  useEffect(() => {
    loadPilotItems((done, total) => setLoaded({ done, total }))
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  const change = (key: string, patch: PilotNote) => {
    const next = { ...notes, [key]: { ...notes[key], ...patch } };
    setNotes(next);
    saveNotes(next);
  };

  const jumpToNext = () => {
    const next = items?.find((item) => !notes[item.key]?.vote);
    document.getElementById(`pilot-${next?.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const reviewed = items ? reviewedCount(items, notes) : 0;
  return (
    <main class="screen review">
      <a class="screen-back" href="#/">
        <Back /> Today
      </a>
      <h1 class="screen-title">Pilot review</h1>
      {failed && <p class="muted">The content could not be loaded.</p>}
      {!items && !failed && (
        <p class="muted" role="status">
          Loading games{loaded.total > 0 ? ` ${loaded.done} / ${loaded.total}` : ''}…
        </p>
      )}
      {items && (
        <>
          <div class="review-bar">
            <p class="review-count" role="status">
              {reviewed} / {items.length} reviewed
            </p>
            <div class="meter" aria-hidden="true">
              <div class="meter-fill" style={{ '--r': items.length ? reviewed / items.length : 0 }} />
            </div>
            <div class="review-actions">
              <Button onClick={jumpToNext}>Next to review</Button>
              <Button variant="secondary" onClick={() => downloadJson('chess-coach-reviews.json', exportReviews(items, notes))}>
                Export reviews
              </Button>
            </div>
          </div>
          <div class="stack">
            {items.map((item) => (
              <PilotCard key={item.key} item={item} note={notes[item.key] ?? {}} onChange={(patch) => change(item.key, patch)} />
            ))}
          </div>
          {items.length === 0 && <p class="muted">No critical or nothing turns in the content yet.</p>}
        </>
      )}
    </main>
  );
}
