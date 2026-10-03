import './shared/screen.css';
import './about.css';

interface Credit {
  name: string;
  licence: string;
  note: string;
  href: string;
}

const CREDITS: Credit[] = [
  {
    name: 'Lichess games',
    licence: 'CC0',
    note: 'Real games from the Lichess open database show what players at each level actually do.',
    href: 'https://database.lichess.org',
  },
  {
    name: 'Maia-2',
    licence: 'MIT',
    note: 'Predicts human moves at each rating. Used offline to generate the content, not shipped in the app.',
    href: 'https://github.com/CSSLab/maia2',
  },
  {
    name: 'Stockfish',
    licence: 'GPL-3.0',
    note: 'Chess engine used offline to analyse positions. Not shipped in the app.',
    href: 'https://stockfishchess.org',
  },
  {
    name: 'chess.js',
    licence: 'BSD-2-Clause',
    note: 'Move rules and notation.',
    href: 'https://github.com/jhlywa/chess.js',
  },
  {
    name: 'cm-chessboard',
    licence: 'MIT',
    note: 'The board. Its piece set is by Colin M.L. Burnett (Wikimedia Commons), licensed CC BY-SA 3.0.',
    href: 'https://github.com/shaack/cm-chessboard',
  },
  {
    name: 'canvas-confetti',
    licence: 'ISC',
    note: 'The confetti.',
    href: 'https://github.com/catdad/canvas-confetti',
  },
  {
    name: 'Preact',
    licence: 'MIT',
    note: 'The interface.',
    href: 'https://preactjs.com',
  },
];

export function About() {
  return (
    <main class="screen">
      <a class="screen-back" href="#/settings">
        ‹ Settings
      </a>
      <h1 class="screen-title">About</h1>
      <p class="about-intro">
        Chess Coach is a small trainer for the openings you actually play. It replays realistic games at your level and pauses at the moments that
        matter, asking a little more of you each time you get it right. Everything stays on your device: no accounts, no tracking.
      </p>
      <h2 class="about-heading">Data and licences</h2>
      <ul class="credits">
        {CREDITS.map((c) => (
          <li key={c.name} class="card credit">
            <div class="credit-head">
              <a href={c.href} target="_blank" rel="noopener noreferrer">
                {c.name}
              </a>
              <span class="chip">{c.licence}</span>
            </div>
            <p>{c.note}</p>
          </li>
        ))}
      </ul>
      <a class="link-button about-pilot" href="#/review">
        Pilot review mode
      </a>
    </main>
  );
}
