import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './App';
import { loadEnrichments } from './lib/enrichmentRegistry';

// Enrichment data is a lazy async chunk (P2-5). Load it before the first
// render so the synchronous accessors (getEnrichedEntry…) see complete
// data — the screens have no loading states for partial data.
loadEnrichments().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});