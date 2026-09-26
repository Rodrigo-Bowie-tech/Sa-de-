import { Activity as ActivityIcon, Frown, Moon, Syringe, FlaskConical, CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, latestMeasurement } from '../db/db';
import type { Activity, Exam, SleepEntry, Symptom, Vaccine } from '../db/types';
import type { FieldDef } from '../components/EntityForm';
import { RecordPage } from '../components/RecordPage';
import { StatusBadge } from '../components/StatusBadge';
import { Meter } from '../components/Meter';
import { LineChart } from '../components/charts';
import {
  addDaysKey,
  formatDate,
  formatDateTime,
  formatShortDate,
  hoursBetween,
  parseDateKey,
  todayKey,
  toDateTimeKey,
} from '../lib/dates';
import { nextDoseStatus } from '../lib/health';
import { fmt } from '../lib/format';
import { ACTIVITY_METS, estimateActivityKcal } from '../lib/nutrition';

// ——— Exames ———

const EXAM_NAMES = [
  'Hemograma completo',
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Colesterol total e frações',
  'Triglicerídeos',
  'TSH e T4 livre',
  'Vitamina D',
  'Vitamina B12',
  'Ferritina',
  'Creatinina e ureia',
  'TGO / TGP',
  'Ácido úrico',
  'Urina tipo 1 (EAS)',
  'PSA',
  'Papanicolau',
  'Mamografia',
  'Ultrassonografia',
  'Raio-X',
  'Eletrocardiograma',
  'Ecocardiograma',
  'Teste ergométrico',
  'Mapeamento de retina',
  'Tomografia',
  'Ressonância magnética',
  'Endoscopia',
  'Colonoscopia',
  'Densitometria óssea',
];

const EXAM_CATEGORIES = ['Sangue', 'Urina / fezes', 'Imagem', 'Cardiológico', 'Oftalmológico', 'Ginecológico', 'Outro'];

const examFields: FieldDef[] = [
  { name: 'name', label: 'Exame', type: 'text', required: true, suggestions: EXAM_NAMES, wide: true },
  { name: 'date', label: 'Data', type: 'date', required: true },
  {
    name: 'category',
    label: 'Tipo',
    type: 'select',
    required: true,
    options: EXAM_CATEGORIES.map((c) => ({ value: c, label: c })),
  },
  { name: 'lab', label: 'Laboratório / clínica', type: 'text' },
  { name: 'requestedBy', label: 'Solicitado por', type: 'text', placeholder: 'Nome do médico' },
  { name: 'result', label: 'Resultado', type: 'textarea', placeholder: 'Valores, laudo, conclusão…' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function ExamsPage() {
  return (
    <RecordPage<Exam>
      title="Exames"
      subtitle="Resultados de exames laboratoriais e de imagem"
      icon={FlaskConical}
      table={db.exams}
      fields={examFields}
      sortKey="date"
      itemName="exame"
      emptyText="Nenhum exame registrado ainda."
      newValues={() => ({ date: todayKey(), category: 'Sangue' })}
      summary={() => (
        <div className="btn-row">
          <Link className="btn secondary small" to="/agenda?nova=exame">
            <CalendarPlus size={16} /> Agendar um exame
          </Link>
        </div>
      )}
      renderItem={(e) => (
        <div className="main">
          <span className="title">{e.name}</span>
          <span className="meta">
            {formatDate(e.date)} · {e.category}
            {e.lab ? ` · ${e.lab}` : ''}
          </span>
          {e.result && <span className="meta pre-wrap">{e.result.split('\n')[0]}</span>}
        </div>
      )}
    />
  );
}

// ——— Vacinas ———

const VACCINE_NAMES = [
  'COVID-19',
  'Influenza (gripe)',
  'Hepatite A',
  'Hepatite B',
  'Febre amarela',
  'Dupla adulto (dT — difteria e tétano)',
  'dTpa (tríplice bacteriana)',
  'Tríplice viral (sarampo, caxumba, rubéola)',
  'HPV',
  'Pneumocócica',
  'Meningocócica',
  'Herpes zóster',
  'Dengue',
  'Varicela',
];

const DOSES = ['Dose única', '1ª dose', '2ª dose', '3ª dose', 'Reforço', 'Dose anual'];

const vaccineFields: FieldDef[] = [
  { name: 'name', label: 'Vacina', type: 'text', required: true, suggestions: VACCINE_NAMES, wide: true },
  { name: 'dose', label: 'Dose', type: 'select', required: true, options: DOSES.map((d) => ({ value: d, label: d })) },
  { name: 'date', label: 'Data da aplicação', type: 'date', required: true },
  { name: 'nextDate', label: 'Próxima dose', type: 'date', hint: 'Você verá um alerta quando estiver perto.' },
  { name: 'lot', label: 'Lote', type: 'text' },
  { name: 'place', label: 'Local', type: 'text', placeholder: 'UBS, clínica…', wide: true },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function VaccinesPage() {
  return (
    <RecordPage<Vaccine>
      title="Vacinas"
      subtitle="Sua carteira de vacinação"
      icon={Syringe}
      table={db.vaccines}
      fields={vaccineFields}
      sortKey="date"
      itemName="vacina"
      gender="a"
      emptyText="Nenhuma vacina registrada ainda."
      newValues={() => ({ date: todayKey(), dose: 'Dose única' })}
      renderItem={(v) => (
        <div className="main">
          <span className="title">{v.name}</span>
          <span className="meta">
            {v.dose} · {formatDate(v.date)}
            {v.place ? ` · ${v.place}` : ''}
          </span>
          {v.nextDate && (
            <span>
              <StatusBadge value={nextDoseStatus(v.nextDate)} />
            </span>
          )}
        </div>
      )}
    />
  );
}

// ——— Atividades físicas ———

const activityFields: FieldDef[] = [
  { name: 'date', label: 'Data', type: 'date', required: true },
  {
    name: 'type',
    label: 'Atividade',
    type: 'select',
    required: true,
    options: Object.keys(ACTIVITY_METS).map((t) => ({ value: t, label: t })),
  },
  { name: 'durationMin', label: 'Duração', type: 'number', required: true, suffix: 'min' },
  {
    name: 'kcal',
    label: 'Calorias gastas',
    type: 'number',
    suffix: 'kcal',
    hint: 'Em branco = estimativa pelo seu peso.',
  },
  { name: 'distanceKm', label: 'Distância', type: 'number', suffix: 'km' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

const WEEKLY_ACTIVITY_GOAL_MIN = 150;

export function ActivitiesPage() {
  return (
    <RecordPage<Activity>
      title="Atividades físicas"
      subtitle="Exercícios e calorias gastas"
      icon={ActivityIcon}
      table={db.activities}
      fields={activityFields}
      sortKey="date"
      itemName="atividade"
      gender="a"
      emptyText="Nenhuma atividade registrada ainda."
      newValues={() => ({ date: todayKey(), type: 'Caminhada' })}
      beforeSave={async (data) => {
        if (data.kcal == null) {
          const weight = (await latestMeasurement(db, 'peso'))?.value;
          if (weight) data.kcal = estimateActivityKcal(String(data.type), Number(data.durationMin), weight);
        }
        return data;
      }}
      summary={(items) => {
        const from = addDaysKey(todayKey(), -6);
        const week = items.filter((a) => a.date >= from);
        const minutes = week.reduce((s, a) => s + (a.durationMin || 0), 0);
        const kcal = week.reduce((s, a) => s + (a.kcal || 0), 0);
        return (
          <section className="card">
            <div className="card-header">
              <h2>Últimos 7 dias</h2>
              <span className="muted small">{fmt(kcal)} kcal gastas</span>
            </div>
            <div className="hero">
              <span className="hero-value">{fmt(minutes)}</span>
              <span className="hero-unit">de {WEEKLY_ACTIVITY_GOAL_MIN} min recomendados pela OMS</span>
            </div>
            <Meter value={minutes} max={WEEKLY_ACTIVITY_GOAL_MIN} label="Minutos de atividade na semana" />
          </section>
        );
      }}
      renderItem={(a) => (
        <>
          <div className="main">
            <span className="title">{a.type}</span>
            <span className="meta">
              {formatDate(a.date)} · {a.durationMin} min
              {a.distanceKm ? ` · ${fmt(a.distanceKm, 2)} km` : ''}
            </span>
          </div>
          {a.kcal != null && <span className="end">{fmt(a.kcal)} kcal</span>}
        </>
      )}
    />
  );
}

// ——— Sono ———

const QUALITY = ['Péssima', 'Ruim', 'Regular', 'Boa', 'Ótima'];

const sleepFields: FieldDef[] = [
  { name: 'date', label: 'Noite de', type: 'date', required: true, wide: true },
  { name: 'bedtime', label: 'Dormiu às', type: 'time' },
  { name: 'wakeTime', label: 'Acordou às', type: 'time' },
  { name: 'hours', label: 'Horas dormidas', type: 'number', suffix: 'h', hint: 'Calculado pelos horários, se preenchidos.' },
  {
    name: 'quality',
    label: 'Qualidade',
    type: 'select',
    required: true,
    options: QUALITY.map((q, i) => ({ value: String(i + 1), label: q })),
  },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function SleepPage() {
  return (
    <RecordPage<SleepEntry>
      title="Sono"
      subtitle="Quanto e como você dormiu"
      icon={Moon}
      table={db.sleep}
      fields={sleepFields}
      sortKey="date"
      itemName="noite"
      gender="a"
      emptyText="Nenhuma noite registrada ainda."
      newValues={() => ({ date: addDaysKey(todayKey(), -1), quality: '4', bedtime: '23:00', wakeTime: '07:00' })}
      beforeSave={(data) => {
        if (data.bedtime && data.wakeTime) data.hours = hoursBetween(String(data.bedtime), String(data.wakeTime));
        if (data.hours == null) throw new Error('Informe os horários ou o total de horas.');
        data.quality = Number(data.quality);
        return data;
      }}
      summary={(items) => {
        const recent = items.slice(0, 14).reverse();
        const last7 = items.slice(0, 7);
        const avg = last7.reduce((s, e) => s + e.hours, 0) / last7.length;
        return (
          <section className="card">
            <div className="card-header">
              <h2>Média das últimas {last7.length} noites</h2>
            </div>
            <div className="hero">
              <span className="hero-value">{fmt(avg, 1)}</span>
              <span className="hero-unit">horas por noite</span>
              <StatusBadge
                value={
                  avg >= 7 && avg <= 9
                    ? { label: 'Dentro do recomendado (7–9 h)', level: 'good' }
                    : { label: 'Fora do recomendado (7–9 h)', level: 'warning' }
                }
              />
            </div>
            {recent.length > 1 && (
              <LineChart
                ariaLabel="Horas de sono por noite"
                series={[{ name: 'Horas de sono', color: 'var(--series-1)' }]}
                data={recent.map((e) => ({ x: parseDateKey(e.date).getTime(), values: [e.hours] }))}
                formatY={(v) => `${fmt(v, 1)} h`}
                formatX={(x) => formatShortDate(new Date(x))}
                height={160}
              />
            )}
          </section>
        );
      }}
      renderItem={(e) => (
        <>
          <div className="main">
            <span className="title">{formatDate(e.date)}</span>
            <span className="meta">
              {e.bedtime && e.wakeTime ? `${e.bedtime} → ${e.wakeTime} · ` : ''}
              Qualidade: {QUALITY[e.quality - 1] ?? '—'}
            </span>
          </div>
          <span className="end">{fmt(e.hours, 1)} h</span>
        </>
      )}
    />
  );
}

// ——— Sintomas ———

const SYMPTOMS = [
  'Dor de cabeça',
  'Enxaqueca',
  'Febre',
  'Tosse',
  'Dor de garganta',
  'Coriza',
  'Náusea',
  'Tontura',
  'Cansaço',
  'Dor nas costas',
  'Dor abdominal',
  'Cólica',
  'Falta de ar',
  'Alergia',
  'Insônia',
  'Ansiedade',
];

const symptomFields: FieldDef[] = [
  { name: 'name', label: 'Sintoma', type: 'text', required: true, suggestions: SYMPTOMS },
  { name: 'datetime', label: 'Quando', type: 'datetime-local', required: true },
  {
    name: 'intensity',
    label: 'Intensidade (0 a 10)',
    type: 'select',
    required: true,
    options: Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) })),
  },
  {
    name: 'notes',
    label: 'Observações',
    type: 'textarea',
    placeholder: 'O que tomou, possível causa, quanto tempo durou…',
  },
];

function intensityLevel(n: number) {
  if (n >= 8) return { label: `Intensidade ${n}/10`, level: 'critical' as const };
  if (n >= 5) return { label: `Intensidade ${n}/10`, level: 'warning' as const };
  return { label: `Intensidade ${n}/10`, level: 'info' as const };
}

export function SymptomsPage() {
  return (
    <RecordPage<Symptom>
      title="Sintomas"
      subtitle="Diário de sintomas para mostrar ao médico"
      icon={Frown}
      table={db.symptoms}
      fields={symptomFields}
      sortKey="datetime"
      itemName="sintoma"
      emptyText="Nenhum sintoma registrado."
      newValues={() => ({ datetime: toDateTimeKey(new Date()), intensity: '5' })}
      beforeSave={(data) => ({ ...data, intensity: Number(data.intensity) })}
      renderItem={(s) => (
        <div className="main">
          <span className="title">{s.name}</span>
          <span className="meta">{formatDateTime(s.datetime)}</span>
          <span>
            <StatusBadge value={intensityLevel(s.intensity)} />
          </span>
          {s.notes && <span className="meta">{s.notes}</span>}
        </div>
      )}
    />
  );
}
