import { Back, Chevron } from './shared/icons';
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
    note: 'Predicts the moves players make at each rating. Used offline to prepare the games, not part of the app.',
    href: 'https://github.com/CSSLab/maia2',
  },
  {
    name: 'Stockfish',
    licence: 'GPL-3.0',
    note: 'The chess engine. It checked the positions when the games were prepared, and it runs on your phone when you ask why a move is played.',
    href: 'https://github.com/official-stockfish/Stockfish',
  },
  {
    name: 'Stockfish.js',
    licence: 'GPL-3.0',
    note: 'The WebAssembly build of Stockfish 19 (lite, single-threaded) that runs in the app, by Nathan Rugg for Chess.com.',
    href: 'https://github.com/nmrugg/stockfish.js',
  },
  {
    name: 'Opening names',
    licence: 'CC0',
    note: 'The names of the openings and their variations, from lichess-org/chess-openings.',
    href: 'https://github.com/lichess-org/chess-openings',
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
    note: 'The board.',
    href: 'https://github.com/shaack/cm-chessboard',
  },
  {
    name: 'Chess pieces',
    licence: 'CC BY-SA 3.0',
    note: 'The standard piece set from Wikimedia Commons by Cburnett and Rfc1394, adapted for cm-chessboard by shaack.',
    href: 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces/Standard',
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
  {
    name: 'Chess Coach',
    licence: 'GPL-3.0',
    note: 'The source code of this app. It is free software under the same licence as Stockfish, which it ships.',
    href: 'https://github.com/Jerome-Joseph-1/chess-coach',
  },
];

export function About() {
  return (
    <main class="screen">
      <a class="screen-back" href="#/settings">
        <Back /> Settings
      </a>
      <header class="topbar">
        <h1 class="screen-title">About</h1>
      </header>
      <p class="about-intro">
        Chess Coach replays real games from the openings you play, at the rating of the opponents you pick, and stops at the positions that matter.
        Everything stays on your phone: no account, no tracking.
      </p>
      <h2 class="section-label">Data and licences</h2>
      <ul class="card list credits">
        {CREDITS.map((c) => (
          <li key={c.name} class="credit">
            <div class="credit-head">
              <a class="link" href={c.href} target="_blank" rel="noopener noreferrer">
                {c.name}
              </a>
              <span class="tag">{c.licence}</span>
            </div>
            <p>{c.note}</p>
          </li>
        ))}
      </ul>
      <a class="card row about-pilot" href="#/review">
        <span class="row-main">Pilot review</span>
        <Chevron />
      </a>
    </main>
  );
}
