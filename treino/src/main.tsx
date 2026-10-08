import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ToastProvider } from '../../src/components/Toasts';
import { listenForInstallPrompt } from '../../src/hooks/useInstallPrompt';
import { applyTheme } from '../../src/lib/theme';
import { startAutoSync } from './lib/syncEngine';
import '../../src/styles.css';
import './treino.css';

applyTheme();
listenForInstallPrompt();
registerSW({ immediate: true });
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
