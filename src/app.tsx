import { OPENINGS } from './content/catalog';
import type { Level, OpeningId } from './content/types';
import { LessonScreen } from './course/lesson/LessonScreen';
import { isUnitId } from './course/units';
import { useRoute } from './router';
import { About } from './screens/About';
import { Course } from './screens/Course';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { PauseLab } from './screens/PauseLab';
import { Progress } from './screens/Progress';
import { Recap } from './screens/Recap';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';

function parseReview(query: string): { gameId: string; ply: number } | undefined {
  const value = new URLSearchParams(query).get('review');
  const [gameId, ply] = value?.split(':') ?? [];
  return gameId && ply ? { gameId, ply: Number(ply) } : undefined;
}

function isOpeningId(value: string): value is OpeningId {
  return OPENINGS.some((o) => o.id === value);
}

export function App() {
  const route = useRoute();
  const [path, query = ''] = route.split('?');
  const play = path.match(/^\/play\/([a-z-]+)\/(\d+)$/);
  if (play) {
    return (
      <Game key={route} opening={play[1] as OpeningId} level={Number(play[2]) as Level} review={parseReview(query)} />
    );
  }
  const lesson = path.match(/^\/lesson\/([a-z-]+)\/([a-z-]+)$/);
  if (lesson && isOpeningId(lesson[1]) && isUnitId(lesson[2])) {
    return <LessonScreen key={route} opening={lesson[1]} unit={lesson[2]} />;
  }
  switch (path) {
    case '/course':
      return <Course />;
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
