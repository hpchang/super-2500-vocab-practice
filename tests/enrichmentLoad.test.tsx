// @vitest-environment jsdom
/**
 * P2-5 regression — enrichment lazy-load ordering.
 *
 * The lazy registry (c1bb9e3) originally built data.ts's entryId map at
 * module-init time, when ENRICHMENTS was still empty, so the app rendered
 * with zero practiceable words. Vitest's import() settles without a real
 * network round trip, which is exactly why the suite passed while the real
 * browser (async chunk fetch) broke — this test renders BEFORE the load
 * settles to reproduce that ordering.
 */
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { HomeScreen } from '../src/screens/HomeScreen.js';
import { loadEnrichments } from '../src/lib/enrichmentRegistry.js';
import { getEnrichment, getEnrichedEntry } from '../src/lib/data.js';
import { toggleGroup } from '../src/groupPrefs.js';

describe('enrichment lazy-load ordering (P2-5)', () => {
  it('exposes practiceable words only after loadEnrichments settles', async () => {
    // Render before awaiting the load — mirrors a browser mid-fetch.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<HomeScreen navigate={() => {}} />);
    });

    await act(async () => {
      await loadEnrichments();
    });

    // Unit 11 has enriched entries; enrichment map must serve them now.
    expect(getEnrichment('11')).toBeDefined();
    expect(getEnrichedEntry('u11:address')).toBeDefined();

    // Unit cards live inside collapsible groups (collapsed by default) —
    // expand group 2 (Unit 9–16) so unit cards render into the DOM.
    expect(container.querySelectorAll('.unit-group').length).toBeGreaterThan(0);
    await act(async () => {
      toggleGroup('9');
    });
    const cards = container.querySelectorAll('.unit-card');
    expect(cards.length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});