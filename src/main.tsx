import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { InstallDialog } from './components/InstallDialog';
import { ToastProvider } from './components/Toasts';
import { listenForInstallPrompt } from './hooks/useInstallPrompt';
import { applyTheme } from './lib/theme';
import './styles.css';

applyTheme();
listenForInstallPrompt();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
        <InstallDialog
          appName="Minha Saúde"
          iconSrc="./icons/icon-192.png"
          dismissKey="minha-saude:instalar-dispensado"
          quietRoutes={['/ficha']}
        />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
