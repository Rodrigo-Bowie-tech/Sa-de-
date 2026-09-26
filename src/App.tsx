import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, HeartPulse, House, User, Utensils } from 'lucide-react';
import { db } from './db/db';
import { useReminderScheduler } from './hooks/useReminderScheduler';
import { addDays, startOfDay, toDateTimeKey } from './lib/dates';
import { Dashboard } from './pages/Dashboard';
import { FoodPage } from './pages/FoodPage';
import { AgendaPage } from './pages/AgendaPage';
import { HealthHub } from './pages/HealthHub';
import { MeasurementsPage } from './pages/MeasurementsPage';
import { VisionPage } from './pages/VisionPage';
import { MedicationsPage } from './pages/MedicationsPage';
import { ExamsPage, VaccinesPage, ActivitiesPage, SleepPage, SymptomsPage } from './pages/RecordPages';
import { ProfilePage } from './pages/ProfilePage';
import { HealthSheet } from './pages/HealthSheet';

function useTodayAppointmentsCount(): number {
  return (
    useLiveQuery(() => {
      const today = startOfDay(new Date());
      return db.appointments
        .where('datetime')
        .between(toDateTimeKey(today), toDateTimeKey(addDays(today, 1)))
        .filter((a) => a.status === 'agendada')
        .count();
    }) ?? 0
  );
}

export function App() {
  const location = useLocation();
  const todayCount = useTodayAppointmentsCount();
  useReminderScheduler();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const links = [
    { to: '/', label: 'Início', icon: House, end: true },
    { to: '/alimentacao', label: 'Alimentação', icon: Utensils },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays, badge: todayCount },
    { to: '/saude', label: 'Saúde', icon: HeartPulse },
    { to: '/perfil', label: 'Perfil', icon: User },
  ];

  return (
    <div className="app">
      <nav className="nav" aria-label="Principal">
        <div className="nav-brand">
          <img src="./icons/favicon.svg" alt="" /> Minha Saúde
        </div>
        {links.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={22} aria-hidden />
            <span>{label}</span>
            {badge ? (
              <span className="nav-badge" aria-label={`${badge} consulta(s) hoje`}>
                {badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/alimentacao" element={<FoodPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/saude" element={<HealthHub />} />
          <Route path="/saude/medidas" element={<MeasurementsPage />} />
          <Route path="/saude/visao" element={<VisionPage />} />
          <Route path="/saude/remedios" element={<MedicationsPage />} />
          <Route path="/saude/exames" element={<ExamsPage />} />
          <Route path="/saude/vacinas" element={<VaccinesPage />} />
          <Route path="/saude/atividades" element={<ActivitiesPage />} />
          <Route path="/saude/sono" element={<SleepPage />} />
          <Route path="/saude/sintomas" element={<SymptomsPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/ficha" element={<HealthSheet />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
