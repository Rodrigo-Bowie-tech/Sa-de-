import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, Eye, FileText, FlaskConical, Frown, Moon, Pill, Scale, Syringe, type LucideIcon } from 'lucide-react';
import { db, latestMeasurement } from '../db/db';
import { PageHeader } from '../components/PageHeader';
import { addDaysKey, todayKey } from '../lib/dates';
import { fmt, fmtDiopter } from '../lib/format';

interface HubItem {
  to: string;
  title: string;
  icon: LucideIcon;
  info?: string;
}

function useHubInfo() {
  return useLiveQuery(async () => {
    const [weight, vision, meds, exams, vaccines, activities, lastSleep, lastSymptom] = await Promise.all([
      latestMeasurement(db, 'peso'),
      db.vision.orderBy('date').last(),
      db.medications.filter((m) => m.active).count(),
      db.exams.count(),
      db.vaccines.count(),
      db.activities.where('date').aboveOrEqual(addDaysKey(todayKey(), -6)).toArray(),
      db.sleep.orderBy('date').last(),
      db.symptoms.orderBy('datetime').last(),
    ]);
    return {
      medidas: weight ? `Peso: ${fmt(weight.value, 1)} kg` : 'Peso, pressão, glicemia…',
      visao:
        vision && (vision.od.sph != null || vision.oe.sph != null)
          ? `OD ${fmtDiopter(vision.od.sph)} · OE ${fmtDiopter(vision.oe.sph)}`
          : 'Grau dos óculos e lentes',
      remedios: meds ? `${meds} em uso` : 'Horários e lembretes',
      exames: exams ? `${exams} registrado${exams > 1 ? 's' : ''}` : 'Resultados e laudos',
      vacinas: vaccines ? `${vaccines} dose${vaccines > 1 ? 's' : ''} registrada${vaccines > 1 ? 's' : ''}` : 'Carteira de vacinação',
      atividades: activities.length
        ? `${fmt(activities.reduce((s, a) => s + a.durationMin, 0))} min nesta semana`
        : 'Exercícios e calorias gastas',
      sono: lastSleep ? `Última noite: ${fmt(lastSleep.hours, 1)} h` : 'Horas e qualidade',
      sintomas: lastSymptom ? `Último: ${lastSymptom.name}` : 'Diário de sintomas',
    };
  });
}

export function HealthHub() {
  const info = useHubInfo();
  const items: HubItem[] = [
    { to: '/saude/medidas', title: 'Medidas', icon: Scale, info: info?.medidas },
    { to: '/saude/visao', title: 'Visão', icon: Eye, info: info?.visao },
    { to: '/saude/remedios', title: 'Remédios', icon: Pill, info: info?.remedios },
    { to: '/saude/exames', title: 'Exames', icon: FlaskConical, info: info?.exames },
    { to: '/saude/vacinas', title: 'Vacinas', icon: Syringe, info: info?.vacinas },
    { to: '/saude/atividades', title: 'Atividades', icon: Activity, info: info?.atividades },
    { to: '/saude/sono', title: 'Sono', icon: Moon, info: info?.sono },
    { to: '/saude/sintomas', title: 'Sintomas', icon: Frown, info: info?.sintomas },
    { to: '/ficha', title: 'Ficha de saúde', icon: FileText, info: 'Resumo para levar ao médico' },
  ];

  return (
    <>
      <PageHeader title="Saúde" subtitle="Todos os seus registros em um só lugar" />
      <div className="hub-grid">
        {items.map(({ to, title, icon: Icon, info: text }) => (
          <Link key={to} to={to} className="hub-card">
            <span className="hub-icon">
              <Icon size={22} aria-hidden />
            </span>
            <strong>{title}</strong>
            <small>{text ?? ' '}</small>
          </Link>
        ))}
      </div>
    </>
  );
}
