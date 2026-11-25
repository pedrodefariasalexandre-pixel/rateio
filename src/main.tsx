import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { initMonitoring } from './lib/monitoring';
import './ui/index.css';
import './ui/glass/tokens.css';
import './ui/glass/base.css';

initMonitoring();

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
