// @vitest-environment jsdom
/**
 * P2-4 — celebration on a perfect session.
 *
 * Renders ResultsScreen with a saved result and asserts:
 *  - a perfect session shows the 全對 banner
 *  - a session with wrong answers does not
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ResultsScreen } from '../src/screens/ResultsScreen.js';
import { saveResult } from '../src/session.js';

async function renderResults() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ResultsScreen navigate={() => {}} />);
  });
  return { root, container };
}

describe('celebration (P2-4)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows the 全對 banner on a perfect session', async () => {
    saveResult({
      unit: '11',
      type: 'cloze',
      results: [
        { entryId: 'u11:a', type: 'cloze', correct: true },
        { entryId: 'u11:b', type: 'cloze', correct: true },
      ],
    });
    const { root } = await renderResults();
    const banner = document.querySelector('.celebrate-banner');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('全對');
    await act(async () => {
      root.unmount();
    });
  });

  it('does not show the banner when there are wrong answers', async () => {
    saveResult({
      unit: '11',
      type: 'cloze',
      results: [
        { entryId: 'u11:a', type: 'cloze', correct: true },
        { entryId: 'u11:b', type: 'cloze', correct: false },
      ],
    });
    const { root } = await renderResults();
    expect(document.querySelector('.celebrate-banner')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });
});