import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleCheck,
  Droplets,
  Eye,
  Flame,
  HeartPulse,
  Pill,
  Plus,
  Scale,
  Stethoscope,
  Syringe,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';
import { db, latestMeasurement } from '../db/db';
import { Meter } from '../components/Meter';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useProfile } from '../hooks/useProfile';
import { useNow } from '../hooks/useNow';
import {
  addDays,
  addDaysKey,
  formatLongDate,
  formatMonthShort,
  formatTime,
  formatWeekday,
  parseDateKey,
  parseDateTime,
  relativeDay,
  startOfDay,
  timeToMinutes,
  toDateKey,
  toDateTimeKey,
} from '../lib/dates';
import { toggleDose } from '../lib/doses';
import { capitalize, fmt, fmtDiopter, fmtMl } from '../lib/format';
import { bloodPressureCategory, bmi, bmiCategory, nextDoseStatus } from '../lib/health';
import { notificationPermission, requestNotificationPermission } from '../lib/notifications';
import { calorieGoal, sumNutrients } from '../lib/nutrition';
import { appointmentBody, dosesForDay, KIND_LABELS } from '../lib/reminders';

function useDashboardData(today: string) {
  return useLiveQuery(async () => {
    const dayStart = parseDateKey(today);
    const [appointments, entries, water, meds, logs, vaccines, vision, weight, pressure] = await Promise.all([
      db.appointments.where('datetime').aboveOrEqual(toDateTimeKey(addDays(dayStart, -30))).toArray(),
      db.foodEntries.where('date').equals(today).toArray(),
      db.water.where('date').equals(today).toArray(),
      db.medications.toArray(),
      db.medicationLogs.where('date').equals(today).toArray(),
      db.vaccines.where('nextDate').belowOrEqual(addDaysKey(today, 30)).toArray(),
      db.vision.orderBy('date').last(),
      latestMeasurement(db, 'peso'),
      latestMeasurement(db, 'pressao'),
    ]);
    return { appointments, entries, water, meds, logs, vaccines, vision, weight, pressure };
  }, [today]);
}

export function Dashboard() {
  const now = useNow(30_000);
  const today = toDateKey(now);
  const profile = useProfile();
  const data = useDashboardData(today);
  const [permission, setPermission] = useState(notificationPermission);

  if (!data) return null;

  const scheduled = data.appointments
    .filter((a) => a.status === 'agendada')
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const upcoming = scheduled.filter(
    (a) => parseDateTime(a.datetime).getTime() + (a.durationMin || 60) * 60_000 >= now.getTime(),
  );
  const unconfirmed = scheduled.filter((a) => !upcoming.includes(a));
  const todayAppts = upcoming.filter((a) => a.datetime.startsWith(today));
  const tomorrowKey = toDateKey(addDays(startOfDay(now), 1));
  const tomorrowAppts = upcoming.filter((a) => a.datetime.startsWith(tomorrowKey));

  const doses = dosesForDay(data.meds, data.logs, today);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pendingDoses = doses.filter((d) => !d.log && timeToMinutes(d.time) <= nowMin);
  const takenCount = doses.filter((d) => d.log).length;

  const totals = sumNutrients(data.entries);
  const goal = calorieGoal(profile, data.weight?.value, now);
  const waterTotal = data.water.reduce((s, w) => s + w.ml, 0);
  const currentBmi = data.weight && profile.heightCm ? bmi(data.weight.value, profile.heightCm) : undefined;
  const visionOverdue = data.vision ? toDateKey(addDays(parseDateKey(data.vision.date), 365)) <= today : false;
  const hasReminders = upcoming.length > 0 || data.meds.some((m) => m.active && m.remind);

  const firstName = profile.name.trim().split(/\s+/)[0];
  const alertCount =
    todayAppts.length + tomorrowAppts.length + unconfirmed.length + pendingDoses.length + data.vaccines.length + (visionOverdue ? 1 : 0);

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}!` : 'Olá!'} subtitle={capitalize(formatLongDate(now))} />

      <section className="card" aria-labelledby="alertas">
        <h2 id="alertas">Alertas</h2>
        {permission === 'default' && hasReminders && (
          <div className="alert">
            <Bell className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>Ative as notificações</strong>
              <span>Para ser avisado das consultas e dos horários dos remédios.</span>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={async () => setPermission(await requestNotificationPermission())}
                >
                  Ativar
                </button>
              </div>
            </div>
          </div>
        )}
        {todayAppts.map((a) => (
          <Link key={a.id} to="/agenda" className="alert warning" style={{ color: 'inherit', textDecoration: 'none' }}>
            <CalendarClock className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>
                Hoje às {formatTime(a.datetime)} — {KIND_LABELS[a.kind]}: {a.specialty}
              </strong>
              <span>{appointmentBody(a)}</span>
              {a.notes && <span>Lembrete: {a.notes}</span>}
            </div>
          </Link>
        ))}
        {tomorrowAppts.map((a) => (
          <Link key={a.id} to="/agenda" className="alert" style={{ color: 'inherit', textDecoration: 'none' }}>
            <CalendarClock className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>
                Amanhã às {formatTime(a.datetime)} — {KIND_LABELS[a.kind]}: {a.specialty}
              </strong>
              <span>{appointmentBody(a)}</span>
            </div>
          </Link>
        ))}
        {pendingDoses.map((d) => (
          <div key={`${d.med.id}-${d.time}`} className="alert warning">
            <Pill className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>
                Remédio das {d.time}: {d.med.name}
              </strong>
              <span>{d.med.dosage || 'Marque quando tomar.'}</span>
            </div>
            <button type="button" className="btn small" onClick={() => toggleDose(d, today)}>
              <Check size={16} /> Tomei
            </button>
          </div>
        ))}
        {unconfirmed.map((a) => (
          <Link key={a.id} to="/agenda" className="alert" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Stethoscope className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>Como foi: {a.specialty}?</strong>
              <span>Marque a consulta de {relativeDay(parseDateTime(a.datetime), now)} como realizada e anote as orientações.</span>
            </div>
          </Link>
        ))}
        {data.vaccines.map((v) => {
          const status = nextDoseStatus(v.nextDate!, today);
          return (
            <Link
              key={v.id}
              to="/saude/vacinas"
              className={`alert ${status.level === 'critical' ? 'critical' : 'warning'}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <Syringe className="alert-icon" size={20} aria-hidden />
              <div className="alert-body">
                <strong>Vacina: {v.name}</strong>
                <span>{status.label}</span>
              </div>
            </Link>
          );
        })}
        {visionOverdue && (
          <Link to="/saude/visao" className="alert" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Eye className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>Exame de vista anual</strong>
              <span>Sua última receita tem mais de um ano. Que tal agendar o oftalmologista?</span>
            </div>
          </Link>
        )}
        {alertCount === 0 && (
          <div className="alert good">
            <CircleCheck className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>Tudo em dia</strong>
              <span>Nenhuma consulta hoje ou amanhã e nenhum remédio pendente.</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <Link to="/alimentacao" className="stat">
          <span className="stat-label">
            <Flame size={16} aria-hidden /> Calorias hoje
          </span>
          <span className="stat-value">
            {fmt(totals.kcal)} <small>{goal ? `/ ${fmt(goal)}` : 'kcal'}</small>
          </span>
          {goal ? <Meter value={totals.kcal} max={goal} label="Calorias de hoje em relação à meta" slim /> : <span className="stat-sub">Defina sua meta no perfil</span>}
        </Link>
        <Link to="/alimentacao" className="stat">
          <span className="stat-label">
            <Droplets size={16} aria-hidden /> Água
          </span>
          <span className="stat-value">
            {fmtMl(waterTotal)} <small>/ {fmtMl(profile.waterGoalMl)}</small>
          </span>
          <Meter value={waterTotal} max={profile.waterGoalMl} label="Água de hoje em relação à meta" slim />
        </Link>
        <Link to="/saude/medidas?tipo=peso" className="stat">
          <span className="stat-label">
            <Scale size={16} aria-hidden /> Peso
          </span>
          <span className="stat-value">
            {data.weight ? (
              <>
                {fmt(data.weight.value, 1)} <small>kg</small>
              </>
            ) : (
              '—'
            )}
          </span>
          {currentBmi ? (
            <span className="stat-sub">
              IMC {fmt(currentBmi, 1)} · {bmiCategory(currentBmi).label}
            </span>
          ) : (
            <span className="stat-sub">Registre seu peso</span>
          )}
        </Link>
        <Link to="/saude/medidas?tipo=pressao" className="stat">
          <span className="stat-label">
            <HeartPulse size={16} aria-hidden /> Pressão
          </span>
          <span className="stat-value">
            {data.pressure ? (
              <>
                {fmt(data.pressure.value)}/{fmt(data.pressure.value2)} <small>mmHg</small>
              </>
            ) : (
              '—'
            )}
          </span>
          {data.pressure?.value2 != null ? (
            <span className="stat-sub">{bloodPressureCategory(data.pressure.value, data.pressure.value2).label}</span>
          ) : (
            <span className="stat-sub">Registre sua pressão</span>
          )}
        </Link>
        <Link to="/saude/visao" className="stat">
          <span className="stat-label">
            <Eye size={16} aria-hidden /> Visão (grau)
          </span>
          <span className="stat-value" style={{ fontSize: '1.15rem' }}>
            {data.vision ? `OD ${fmtDiopter(data.vision.od.sph)} · OE ${fmtDiopter(data.vision.oe.sph)}` : '—'}
          </span>
          <span className="stat-sub">{data.vision ? 'Esférico da última receita' : 'Cadastre sua receita'}</span>
        </Link>
        <Link to="/saude/remedios" className="stat">
          <span className="stat-label">
            <Pill size={16} aria-hidden /> Remédios hoje
          </span>
          <span className="stat-value">{doses.length ? `${takenCount}/${doses.length}` : '—'}</span>
          <span className="stat-sub">{doses.length ? 'doses tomadas' : 'Nenhum remédio hoje'}</span>
        </Link>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Próximas consultas</h2>
          <Link to="/agenda" className="btn ghost small">
            Ver agenda
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">Nenhuma consulta marcada.</p>
        ) : (
          <ul className="list">
            {upcoming.slice(0, 3).map((a) => {
              const start = parseDateTime(a.datetime);
              const rel = relativeDay(start, now);
              return (
                <li key={a.id}>
                  <Link to="/agenda" className="list-item" style={{ textDecoration: 'none' }}>
                    <div className="date-tile">
                      <small>{formatWeekday(start)}</small>
                      <strong>{start.getDate()}</strong>
                      <small>{formatMonthShort(start)}</small>
                    </div>
                    <div className="main">
                      <span className="title">
                        {KIND_LABELS[a.kind]}: {a.specialty}
                      </span>
                      <span className="meta">
                        {formatTime(start)}
                        {a.professional ? ` · ${a.professional}` : ''}
                      </span>
                      <span>
                        <StatusBadge value={{ label: capitalize(rel), level: rel === 'hoje' ? 'warning' : 'info' }} />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Registro rápido</h2>
        <div className="btn-row">
          <Link to="/alimentacao" className="btn secondary small">
            <Utensils size={16} /> Refeição
          </Link>
          <Link to="/agenda?nova=consulta" className="btn secondary small">
            <CalendarPlus size={16} /> Consulta
          </Link>
          <Link to="/saude/medidas" className="btn secondary small">
            <Plus size={16} /> Medida
          </Link>
          <Link to="/saude/sintomas" className="btn secondary small">
            <Plus size={16} /> Sintoma
          </Link>
        </div>
      </section>
    </>
  );
}
