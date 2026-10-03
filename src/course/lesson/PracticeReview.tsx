import { useEffect, useState } from 'preact/hooks';
import { Board } from '../../board/Board';
import type { BoardController } from '../../board/types';
import { themeFor } from '../../learn';
import type { PauseOutcome, PauseStage } from '../../pause/PauseSheet';
import { Icon } from '../../pause/steps/icons';
import { dropDrillReview, scheduleDrill } from '../../progress/store';
import { navigate } from '../../router';
import { loadPosition, setOf, type LessonPosition } from '../select';
import { UNITS, unitOfTheme } from '../units';
import { Notice } from './Pages';
import { Practice } from './Practice';
import '../../screens/game.css';
import './lesson.css';

export interface PracticeReviewProps {
  /** The set the position's game is in, a valid set name. */
  set: string;
  gameId: string;
  ply: number;
}

const STALE = 'This position is no longer in the course, so it is off your review list.';

const back = () => navigate('/');

/** The unit a practice position teaches, for the screen's title. */
function titleOf({ game, turnIndex }: LessonPosition): string {
  const unit = unitOfTheme(themeFor(game, turnIndex));
  return unit ? UNITS[unit].title : 'Practice';
}

/** A missed practice position from Today's reviews, asked again as practice; the answer moves it along its review ladder. */
export function PracticeReview({ set, gameId, ply }: PracticeReviewProps) {
  const [position, setPosition] = useState<LessonPosition | null>();
  const [layout, setLayout] = useState<PauseStage>('ask');
  const [board, setBoard] = useState<BoardController | null>(null);

  useEffect(() => {
    let current = true;
    void loadPosition({ set, gameId, ply, findShare: 0 }).then((found) => {
      if (!current) return;
      if (!found) dropDrillReview(set, gameId, ply);
      setPosition(found);
    });
    return () => {
      current = false;
    };
  }, []);

  function done(result: PauseOutcome) {
    // The set's own level only counts when the position is not on the list yet; a listed one keeps its level.
    scheduleDrill({ ...setOf(set)!, drillSet: set, gameId, ply }, result.verdict === 'found', Date.now());
    back();
  }

  return (
    <main class="game lesson" data-mode={position === null ? 'intro' : layout}>
      <header class="game-top">
        <button class="game-back" type="button" aria-label="Back" onClick={back}>
          <Icon name="chevron-left" />
        </button>
        <div class="game-heading">
          <h1 class="game-title">{position ? titleOf(position) : 'Practice'}</h1>
          <p class="game-sub">Review</p>
        </div>
        <span class="game-top-end" aria-hidden="true" />
      </header>
      {position === null && <Notice text={STALE} action={{ label: 'Back to Today', onClick: back }} />}
      {position && (
        <>
          <div class="game-board">
            <Board fen={position.game.turns[position.turnIndex].fen} orientation={position.game.side} onReady={setBoard} />
          </div>
          <section class="game-slot">
            {board && <Practice board={board} position={position} onStage={setLayout} onDone={done} />}
          </section>
        </>
      )}
    </main>
  );
}
