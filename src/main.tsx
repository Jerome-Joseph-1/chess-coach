import { render } from 'preact';
import { App } from './app';
import { getSettings } from './progress/store';
import './ui/tokens.css';

const { theme } = getSettings();
if (theme !== 'system') document.documentElement.dataset.theme = theme;

render(<App />, document.getElementById('app')!);
