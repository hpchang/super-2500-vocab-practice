import { useHashRoute, parseRoute } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { UnitSetupScreen } from './screens/UnitSetupScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { WrongAnswersScreen } from './screens/WrongAnswersScreen';
import type { QuestionType } from './types/index';
import type { FilterMode } from './lib/selection';

export function App() {
  const [route, navigate] = useHashRoute();
  const segs = parseRoute(route);

  let screen: React.ReactNode;
  if (segs.length === 0 || segs[0] === 'home') {
    screen = <HomeScreen navigate={navigate} />;
  } else if (segs[0] === 'unit' && segs[1] && segs[2] === 'setup') {
    // /unit/:unit/setup/:type/:filter — optional type pre-select ("下一批"),
    // filter pre-select (Home deep-link), or cloze difficulty (P0-7: a fixed
    // difficulty from the previous session's "下一批").
    const preselect = parseQuestionType(segs[3]);
    const preFilter = parseFilterMode(segs[4]);
    const preDifficulty = parseDifficultyMode(segs[4]);
    screen = (
      <UnitSetupScreen
        unit={segs[1]}
        navigate={navigate}
        type={preselect}
        filter={preFilter}
        difficulty={preDifficulty}
      />
    );
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

/** Validate a URL-segment filter mode (deep-linkable subset of FilterMode). */
function parseFilterMode(raw: string | undefined): FilterMode | undefined {
  return raw === 'review' || raw === 'wrong' ? raw : undefined;
}

/** Validate a URL-segment cloze difficulty mode (P0-7 difficulty carry-over). */
function parseDifficultyMode(
  raw: string | undefined,
): 'adaptive' | 'easy' | 'medium' | 'hard' | undefined {
  return raw === 'adaptive' || raw === 'easy' || raw === 'medium' || raw === 'hard'
    ? raw
    : undefined;
}