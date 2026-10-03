import { signedPawns } from '../engine/score';
import { prefersReducedMotion, SLOW_MS, SPRING } from '../ui/motion';
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
  private share = 0.5;

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
    const wasShown = !this.bar.hidden;
    this.bar.hidden = !score;
    this.host.classList.toggle('has-eval-bar', Boolean(score));
    this.bar.classList.toggle('is-flipped', this.flipped);
    if (!score) return;
    const share = whiteShare(score);
    const rising = share > this.share;
    this.share = share;
    // A transform, so the fill springs to its new height without relaying out the bar.
    this.white.style.transform = `scaleY(${share})`;
    this.setLabel(barLabel(score), wasShown ? rising : null);
    this.bar.classList.toggle('is-black-ahead', share < 0.5);
    // White's end is the bottom unless the board is turned.
    this.label.classList.toggle('is-top', share >= 0.5 === this.flipped);
    this.bar.setAttribute('aria-label', `Evaluation: ${spoken(score)}`);
  }

  /** The new score rolls in the way the fill moved while the old one rolls out; `rising` null just swaps it. */
  private setLabel(text: string, rising: boolean | null): void {
    const old = this.label.textContent ?? '';
    if (old === text) return;
    this.label.textContent = text;
    if (rising === null || !old || prefersReducedMotion()) return;
    // White's fill grows up the bar, or down it when the board is turned.
    const toward = rising === this.flipped ? 1 : -1;
    const leaving = this.label.cloneNode(true) as HTMLElement;
    leaving.className = this.label.className.replace('eval-bar-label', 'eval-bar-label-leaving');
    leaving.textContent = old;
    leaving.setAttribute('aria-hidden', 'true');
    this.bar.append(leaving);
    const timing = { duration: SLOW_MS, easing: SPRING };
    this.label.animate([{ translate: `0 ${-toward * 60}%`, opacity: 0 }, { translate: '0 0', opacity: 1 }], timing);
    const out = leaving.animate([{ translate: '0 0', opacity: 1 }, { translate: `0 ${toward * 60}%`, opacity: 0 }], { ...timing, fill: 'forwards' });
    out.onfinish = out.oncancel = () => leaving.remove();
  }
}
