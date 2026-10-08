import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Dumbbell, History, ListChecks, Settings } from 'lucide-react';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { HistoryPage } from './pages/HistoryPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ConnectPage } from './pages/ConnectPage';

export function App() {
  const location = useLocation();
  const inSession = location.pathname === '/sessao';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const links = [
    { to: '/', label: 'Treino', icon: Dumbbell, end: true },
    { to: '/historico', label: 'Histórico', icon: History },
    { to: '/exercicios', label: 'Exercícios', icon: ListChecks },
    { to: '/ajustes', label: 'Ajustes', icon: Settings },
  ];

  return (
    <div className={`app${inSession ? ' in-session' : ''}`}>
      {!inSession && (
        <nav className="nav" aria-label="Principal">
          <div className="nav-brand">
            <img src="./icons/favicon.svg" alt="" /> Treino
          </div>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={22} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sessao" element={<SessionPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/exercicios" element={<ExercisesPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/conectar" element={<ConnectPage />} />
          <Route path="/conectar/:code" element={<ConnectPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
