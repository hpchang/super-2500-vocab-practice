import { useHashRoute, parseRoute } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { UnitSetupScreen } from './screens/UnitSetupScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { WrongAnswersScreen } from './screens/WrongAnswersScreen';

export function App() {
  const [route, navigate] = useHashRoute();
  const segs = parseRoute(route);

  let screen: React.ReactNode;
  if (segs.length === 0 || segs[0] === 'home') {
    screen = <HomeScreen navigate={navigate} />;
  } else if (segs[0] === 'unit' && segs[1] && segs[2] === 'setup') {
    screen = <UnitSetupScreen unit={segs[1]} navigate={navigate} />;
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