import { useHashRoute, parseRoute } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { UnitSetupScreen } from './screens/UnitSetupScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { WrongAnswersScreen } from './screens/WrongAnswersScreen';
import type { QuestionType } from './types/index';

export function App() {
  const [route, navigate] = useHashRoute();
  const segs = parseRoute(route);

  let screen: React.ReactNode;
  if (segs.length === 0 || segs[0] === 'home') {
    screen = <HomeScreen navigate={navigate} />;
  } else if (segs[0] === 'unit' && segs[1] && segs[2] === 'setup') {
    // /unit/:unit/setup/:type — optional type to pre-select the question
    // type (used by "下一批" so the batch continues the same type).
    const preselect = parseQuestionType(segs[3]);
    screen = <UnitSetupScreen unit={segs[1]} navigate={navigate} type={preselect} />;
  } else if (segs[0] === 'practice') {
    // /practice/:unit/:batch/:type  OR state passed via sessionStorage
    screen = <PracticeScreen navigate={navigate} />;
  } else if (segs[0] === 'results') {
    screen = <ResultsScreen navigate={navigate} />;
  } else if (segs[0] === 'wrong') {
    screen = <WrongAnswersScreen navigate={navigate} />;
  } else {
    screen = <HomeScreen navigate={navigate} />;
  }

  return <div className="app">{screen}</div>;
}

const QUESTION_TYPES: QuestionType[] = [
  'flashcard',
  'en2zh',
  'zh2en',
  'cloze',
  'spelling',
];

/** Validate a URL-segment question type; 'mixed' passes through. */
function parseQuestionType(raw: string | undefined): QuestionType | 'mixed' | undefined {
  if (!raw) return undefined;
  if (raw === 'mixed') return 'mixed';
  return (QUESTION_TYPES as string[]).includes(raw)
    ? (raw as QuestionType)
    : undefined;
}