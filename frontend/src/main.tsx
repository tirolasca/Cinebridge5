import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { aplicarTema, temaInicial } from '@/hooks/useTheme';
import App from './App';

aplicarTema(temaInicial()); // antes da primeira pintura: sem "flash" de tema
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
