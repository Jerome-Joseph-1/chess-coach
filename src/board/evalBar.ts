import { signedPawns } from '../engine/score';
import type { BarScore } from './types';

/** Lichess's curve from centipawns to winning chances: small edges stay visible, big ones stop short of full. */
const CURVE = 0.00368208;

/** White's share of the bar, from 0 to 1. */
export function whiteShare(score: BarScore): number {
  if ('winner' in score) return score.winner === 'w' ? 1 : 0;
  if ('mate' in score) return score.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-CURVE * score.cp));
}

/** "+1.8", "−0.4", "M3", "1-0". */
export function barLabel(score: BarScore): string {
  if ('winner' in score) return score.winner === 'w' ? '1-0' : '0-1';
  if ('mate' in score) return `M${Math.abs(score.mate)}`;
  return signedPawns(score.cp);
}

function spoken(score: BarScore): string {
  if ('winner' in score) return `${score.winner === 'w' ? 'White' : 'Black'} has won`;
  if ('mate' in score) return `${score.mate > 0 ? 'White' : 'Black'} mates in ${Math.abs(score.mate)}`;
  return `${barLabel(score)} for White`;
}

/** The evaluation bar on the board's left edge: White's share fills from White's side, the score sits at the leader's end. */
export class EvalBar {
  private bar = document.createElement('div');
  private white = document.createElement('div');
  private label = document.createElement('span');
  private score: BarScore | null = null;

  constructor(
    private host: HTMLElement,
    private flipped: boolean,
  ) {
    this.bar.className = 'eval-bar';
    this.bar.hidden = true;
    this.bar.setAttribute('role', 'img');
    this.white.className = 'eval-bar-white';
    this.label.className = 'eval-bar-label';
    this.bar.append(this.white, this.label);
    host.append(this.bar);
    this.render();
  }

  show(score: BarScore | null): void {
    this.score = score;
    this.render();
  }

  setFlipped(flipped: boolean): void {
    this.flipped = flipped;
    this.render();
  }

  destroy(): void {
    this.host.classList.remove('has-eval-bar');
    this.bar.remove();
  }

  private render(): void {
    const { score } = this;
    this.bar.hidden = !score;
    this.host.classList.toggle('has-eval-bar', Boolean(score));
    this.bar.classList.toggle('is-flipped', this.flipped);
    if (!score) return;
    const share = whiteShare(score);
    const whiteAhead = share >= 0.5;
    this.white.style.height = `${share * 100}%`;
    this.label.textContent = barLabel(score);
    this.bar.classList.toggle('is-black-ahead', !whiteAhead);
    // White's end is the bottom unless the board is turned.
    this.label.classList.toggle('is-top', whiteAhead === this.flipped);
    this.bar.setAttribute('aria-label', `Evaluation: ${spoken(score)}`);
  }
}
