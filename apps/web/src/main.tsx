import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { Toaster } from './components/index.ts';

// React Flow's own stylesheet first, so our rules in styles.css win without
// needing `!important` to override it.
import '@xyflow/react/dist/style.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
