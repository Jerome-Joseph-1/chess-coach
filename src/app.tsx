import type { Level, OpeningId } from './content/types';
import { useRoute } from './router';
import { About } from './screens/About';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { PauseLab } from './screens/PauseLab';
import { Progress } from './screens/Progress';
import { Recap } from './screens/Recap';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';

export function App() {
  const path = useRoute();
  const play = path.match(/^\/play\/([a-z-]+)\/(\d+)$/);
  if (play) return <Game key={path} opening={play[1] as OpeningId} level={Number(play[2]) as Level} />;
  switch (path) {
    case '/recap':
      return <Recap />;
    case '/progress':
      return <Progress />;
    case '/settings':
      return <Settings />;
    case '/about':
      return <About />;
    case '/review':
      return <Review />;
    case '/lab':
      return <PauseLab />;
    default:
      return <Home />;
  }
}
