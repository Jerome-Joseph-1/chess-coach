import { render } from 'preact';
import { App } from './app';
import { getSettings } from './progress/store';
import './ui/tokens.css';

const { theme, board } = getSettings();
if (theme !== 'system') document.documentElement.dataset.theme = theme;
document.documentElement.dataset.board = board;

// iOS Safari only applies :active styles once the page has a touchstart listener.
document.addEventListener('touchstart', () => {}, { passive: true });

render(<App />, document.getElementById('app')!);
