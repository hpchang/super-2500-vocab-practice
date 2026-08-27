// Enable React 18's act() so component tests flush async state updates
// deterministically in the jsdom environment. Harmless for the pure-logic
// suites that keep the default node environment.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
