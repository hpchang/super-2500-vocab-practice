import { useEffect, useState, useCallback } from 'react';

/** Hash-based route. e.g. "#/unit/11/setup" → "/unit/11/setup" */
export function useHashRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => getHashPath());

  useEffect(() => {
    const onChange = () => setRoute(getHashPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = to.startsWith('#') ? to : '#' + to;
    // scroll to top on navigation
    window.scrollTo(0, 0);
  }, []);

  return [route, navigate];
}

function getHashPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

/** Parse a route like "/unit/11/setup" into segments. */
export function parseRoute(route: string): string[] {
  return route.split('/').filter(Boolean);
}