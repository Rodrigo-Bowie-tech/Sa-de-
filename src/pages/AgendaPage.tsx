import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  BellOff,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  MapPin,
  Phone,
  Plus,
  Repeat,
} from 'lucide-react';
import { db } from '../db/db';
import type { Appointment, AppointmentKind, AppointmentStatus } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useProfile } from '../hooks/useProfile';
import { useNow } from '../hooks/useNow';
import {
  addDays,
  addDaysKey,
  formatDate,
  formatMonthShort,
  formatMonthYear,
  formatTime,
  formatWeekday,
  parseDateTime,
  relativeDay,
  toDateKey,
  todayKey,
} from '../lib/dates';
import { openCalendarFile } from '../lib/download';
import { capitalize } from '../lib/format';
import { appointmentEvent, buildIcs, googleCalendarUrl } from '../lib/ics';
import type { Classification } from '../lib/health';
import { notificationPermission, requestNotificationPermission, type PermissionState } from '../lib/notifications';
import {
  appointmentReminderTimes,
  DEFAULT_REMINDERS,
  KIND_LABELS,
  pastReminderKeys,
  REMINDER_OPTIONS,
} from '../lib/reminders';

const SPECIALTIES = [
  'Clínico geral',
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Ginecologia',
  'Neurologia',
  'Nutrição',
  'Odontologia',
  'Oftalmologia',
  'Ortopedia',
  'Otorrinolaringologia',
  'Pediatria',
  'Pneumologia',
  'Psicologia',
  'Psiquiatria',
  'Reumatologia',
  'Urologia',
  'Fisioterapia',
];

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
};

interface ApptForm {
  id?: number;
  kind: AppointmentKind;
  specialty: string;
  professional: string;
  date: string;
  time: string;
  durationMin: number;
  location: string;
  phone: string;
  reason: string;
  notes: string;
  status: AppointmentStatus;
  reminders: number[];
  morningAlert: boolean;
  summary: string;
}

function blankForm(overrides: Partial<ApptForm> = {}): ApptForm {
  return {
    kind: 'consulta',
    specialty: '',
    professional: '',
    date: addDaysKey(todayKey(), 1),
    time: '09:00',
    durationMin: 60,
    location: '',
    phone: '',
    reason: '',
    notes: '',
    status: 'agendada',
    reminders: [...DEFAULT_REMINDERS],
    morningAlert: true,
    summary: '',
    ...overrides,
  };
}

function toForm(a: Appointment): ApptForm {
  const [date, time] = a.datetime.split('T');
  return {
    id: a.id,
    kind: a.kind,
    specialty: a.specialty,
    professional: a.professional ?? '',
    date,
    time,
    durationMin: a.durationMin,
    location: a.location ?? '',
    phone: a.phone ?? '',
    reason: a.reason ?? '',
    notes: a.notes ?? '',
    status: a.status,
    reminders: [...a.reminders],
    morningAlert: a.morningAlert,
    summary: a.summary ?? '',
  };
}

function endTime(a: Appointment): number {
  return parseDateTime(a.datetime).getTime() + (a.durationMin || 60) * 60_000;
}

function dayBadge(a: Appointment, now: Date): Classification | undefined {
  if (a.status === 'cancelada') return { label: 'Cancelada', level: 'critical' };
  if (a.status === 'realizada') return { label: 'Realizada', level: 'good' };
  const start = parseDateTime(a.datetime);
  if (endTime(a) < now.getTime()) return { label: 'Confirme se foi realizada', level: 'warning' };
  const rel = relativeDay(start, now);
  if (rel === 'hoje') return { label: 'Hoje', level: 'warning' };
  if (rel === 'amanhã') return { label: 'Amanhã', level: 'info' };
  return { label: capitalize(rel), level: 'info' };
}

function NotificationCard() {
  const [permission, setPermission] = useState<PermissionState>(notificationPermission);
  if (permission === 'granted') return null;
  return (
    <div className="alert">
      <BellOff className="alert-icon" size={20} aria-hidden />
      <div className="alert-body">
        <strong>Ative os alertas de consulta</strong>
        {permission === 'unsupported' ? (
          <span>
            Este navegador não permite notificações. No iPhone, instale o app (Compartilhar → Adicionar à Tela de
            Início). Você também pode usar “Calendário” em cada consulta para receber o aviso do próprio celular.
          </span>
        ) : permission === 'denied' ? (
          <span>
            As notificações estão bloqueadas. Libere nas configurações do navegador para este site, ou use “Calendário”
            em cada consulta.
          </span>
        ) : (
          <>
            <span>Receba avisos antes das consultas e no dia, mesmo com o app em segundo plano.</span>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn small"
                onClick={async () => setPermission(await requestNotificationPermission())}
              >
                <Bell size={16} /> Ativar alertas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MonthCalendar({
  month,
  onMonth,
  selected,
  onSelect,
  marked,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  marked: Set<string>;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = days[35].getMonth() === month.getMonth() ? 6 : 5;
  const today = todayKey();
  const dows = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <section className="card">
      <div className="card-header">
        <button
          type="button"
          className="icon-btn"
          aria-label="Mês anterior"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={20} />
        </button>
        <h2>{capitalize(formatMonthYear(month))}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Próximo mês"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="month">
        {dows.map((d, i) => (
          <span key={i} className="dow" aria-hidden>
            {d}
          </span>
        ))}
        {days.slice(0, weeks * 7).map((d) => {
          const key = toDateKey(d);
          const classes = [d.getMonth() !== month.getMonth() ? 'outside' : '', key === today ? 'today' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={key}
              type="button"
              className={classes}
              aria-pressed={selected === key}
              aria-label={`${formatDate(key)}${marked.has(key) ? ', com consulta' : ''}`}
              onClick={() => onSelect(selected === key ? null : key)}
            >
              {d.getDate()}
              {marked.has(key) ? <span className="dot" /> : <span style={{ height: 6 }} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AgendaPage() {
  const now = useNow(30_000);
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const appointments = useLiveQuery(() => db.appointments.orderBy('datetime').toArray());
  const [form, setForm] = useState<ApptForm | null>(null);
  const [error, setError] = useState<string>();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Abre o formulário quando outra tela pede "Agendar…" (ex.: /agenda?nova=exame&especialidade=…).
  useEffect(() => {
    const kind = params.get('nova') as AppointmentKind | null;
    if (!kind) return;
    setError(undefined);
    setForm(blankForm({ kind: kind in KIND_LABELS ? kind : 'consulta', specialty: params.get('especialidade') ?? '' }));
    setParams({}, { replace: true });
  }, [params, setParams]);

  const marked = useMemo(
    () => new Set((appointments ?? []).filter((a) => a.status === 'agendada').map((a) => a.datetime.slice(0, 10))),
    [appointments],
  );

  const all = appointments ?? [];
  const upcoming = all.filter((a) => a.status === 'agendada' && endTime(a) >= now.getTime());
  const past = all.filter((a) => !upcoming.includes(a)).reverse();
  const dayList = selectedDay ? all.filter((a) => a.datetime.startsWith(selectedDay)) : null;

  const openNew = (overrides: Partial<ApptForm> = {}) => {
    setError(undefined);
    setForm(blankForm(overrides));
  };

  const openEdit = (a: Appointment, overrides: Partial<ApptForm> = {}) => {
    setError(undefined);
    setForm({ ...toForm(a), ...overrides });
  };

  const save = async () => {
    if (!form) return;
    if (!form.specialty.trim()) return setError('Informe a especialidade ou o tipo de atendimento.');
    if (!form.date || !form.time) return setError('Informe a data e o horário.');
    const appt: Appointment = {
      kind: form.kind,
      specialty: form.specialty.trim(),
      professional: form.professional.trim() || undefined,
      datetime: `${form.date}T${form.time}`,
      durationMin: form.durationMin,
      location: form.location.trim() || undefined,
      phone: form.phone.trim() || undefined,
      reason: form.reason.trim() || undefined,
      notes: form.notes.trim() || undefined,
      status: form.status,
      reminders: [...form.reminders].sort((a, b) => b - a),
      morningAlert: form.morningAlert,
      summary: form.summary.trim() || undefined,
    };
    if (form.id != null) appt.id = form.id;
    const id = await db.appointments.put(appt);
    // Alertas cujo horário já passou não devem disparar agora.
    const stale = pastReminderKeys({ ...appt, id }, new Date(), profile.morningAlertTime);
    if (stale.length) await db.notificationLog.bulkPut(stale.map((key) => ({ key, firedAt: Date.now() })));
    setForm(null);
  };

  const remove = async () => {
    if (form?.id == null || !confirm('Excluir esta consulta?')) return;
    await db.appointments.delete(form.id);
    setForm(null);
  };

  const exportIcs = (list: Appointment[], filename: string) =>
    openCalendarFile(filename, buildIcs(list.map((a) => appointmentEvent(a, profile.morningAlertTime))));

  const card = (a: Appointment) => {
    const start = parseDateTime(a.datetime);
    const badge = dayBadge(a, now);
    const reminders = a.status === 'agendada' ? appointmentReminderTimes(a, profile.morningAlertTime) : [];
    const isPastOpen = a.status === 'agendada' && endTime(a) < now.getTime();
    return (
      <li key={a.id} className="appt">
        <div className={`date-tile${a.status !== 'agendada' ? ' muted' : ''}`}>
          <small>{formatWeekday(start)}</small>
          <strong>{start.getDate()}</strong>
          <small>{formatMonthShort(start)}</small>
        </div>
        <div className="main">
          <strong>
            {KIND_LABELS[a.kind]}: {a.specialty}
          </strong>
          {a.professional && <span className="meta">{a.professional}</span>}
          <span className="meta">
            <Clock size={14} aria-hidden /> {formatTime(start)} · {formatDate(start)}
          </span>
          {a.location && (
            <span className="meta">
              <MapPin size={14} aria-hidden /> {a.location}
            </span>
          )}
          {a.phone && (
            <span className="meta">
              <Phone size={14} aria-hidden /> <a href={`tel:${a.phone}`}>{a.phone}</a>
            </span>
          )}
          {reminders.length > 0 && (
            <span className="meta">
              <Bell size={14} aria-hidden /> {reminders.map((r) => r.label).join(' · ')}
            </span>
          )}
          {a.summary && <span className="meta pre-wrap">📝 {a.summary}</span>}
          <span>{badge && <StatusBadge value={badge} />}</span>
          <div className="actions">
            {a.status === 'agendada' && !isPastOpen && (
              <>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => exportIcs([a], `consulta-${a.datetime.slice(0, 10)}.ics`)}
                >
                  <CalendarPlus size={16} /> Calendário
                </button>
                <a
                  className="btn secondary small"
                  href={googleCalendarUrl(appointmentEvent(a, profile.morningAlertTime))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} /> Google Agenda
                </a>
              </>
            )}
            {isPastOpen && (
              <button type="button" className="btn small" onClick={() => openEdit(a, { status: 'realizada' })}>
                <CalendarCheck size={16} /> Marcar como realizada
              </button>
            )}
            {a.status === 'realizada' && (
              <button
                type="button"
                className="btn secondary small"
                onClick={() =>
                  openNew({
                    kind: 'retorno',
                    specialty: a.specialty,
                    professional: a.professional ?? '',
                    location: a.location ?? '',
                    phone: a.phone ?? '',
                    time: a.datetime.slice(11, 16),
                    date: addDaysKey(todayKey(), 30),
                  })
                }
              >
                <Repeat size={16} /> Agendar retorno
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => openEdit(a)}>
              Editar
            </button>
          </div>
        </div>
      </li>
    );
  };

  const toggleReminder = (minutes: number) =>
    form &&
    setForm({
      ...form,
      reminders: form.reminders.includes(minutes)
        ? form.reminders.filter((m) => m !== minutes)
        : [...form.reminders, minutes],
    });

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Consultas, exames e retornos com alertas"
        actions={
          <button type="button" className="btn" onClick={() => openNew(selectedDay && selectedDay >= todayKey() ? { date: selectedDay } : {})}>
            <Plus size={18} /> Nova consulta
          </button>
        }
      />
      <NotificationCard />

      <MonthCalendar
        month={month}
        onMonth={setMonth}
        selected={selectedDay}
        onSelect={setSelectedDay}
        marked={marked}
      />

      {dayList ? (
        <section className="card">
          <div className="card-header">
            <h2>{formatDate(selectedDay!)}</h2>
            <button type="button" className="btn ghost small" onClick={() => setSelectedDay(null)}>
              Ver todas
            </button>
          </div>
          {dayList.length === 0 ? (
            <EmptyState icon={CalendarDays}>
              <p>Nada marcado neste dia.</p>
              {selectedDay! >= todayKey() && (
                <button type="button" className="btn secondary" onClick={() => openNew({ date: selectedDay! })}>
                  <Plus size={18} /> Agendar neste dia
                </button>
              )}
            </EmptyState>
          ) : (
            <ul className="list">{dayList.map(card)}</ul>
          )}
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-header">
              <h2>Próximas</h2>
              {upcoming.length > 1 && (
                <button type="button" className="btn ghost small" onClick={() => exportIcs(upcoming, 'consultas.ics')}>
                  <Download size={16} /> Exportar todas
                </button>
              )}
            </div>
            {appointments === undefined ? null : upcoming.length === 0 ? (
              <EmptyState icon={CalendarDays}>
                <p>Nenhuma consulta marcada.</p>
                <button type="button" className="btn secondary" onClick={() => openNew()}>
                  <Plus size={18} /> Agendar consulta
                </button>
              </EmptyState>
            ) : (
              <ul className="list">{upcoming.map(card)}</ul>
            )}
          </section>
          {past.length > 0 && (
            <section className="card">
              <details open={past.some((a) => a.status === 'agendada')}>
                <summary>Histórico ({past.length})</summary>
                <ul className="list">{past.map(card)}</ul>
              </details>
            </section>
          )}
        </>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id != null ? 'Editar consulta' : 'Nova consulta'}
        footer={
          <>
            {form?.id != null && (
              <button type="button" className="btn danger" onClick={remove}>
                Excluir
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={save}>
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>Tipo</span>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AppointmentKind })}>
                  {Object.entries(KIND_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{form.kind === 'exame' ? 'Exame *' : 'Especialidade *'}</span>
                <input
                  list="especialidades"
                  value={form.specialty}
                  placeholder={form.kind === 'exame' ? 'ex.: Hemograma' : 'ex.: Oftalmologia'}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                />
                <datalist id="especialidades">
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="field wide">
                <span>Profissional</span>
                <input
                  placeholder="ex.: Dra. Ana Souza"
                  value={form.professional}
                  onChange={(e) => setForm({ ...form, professional: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Data *</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="field">
                <span>Horário *</span>
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </label>
              <label className="field">
                <span>Duração</span>
                <select
                  value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
                >
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Telefone</span>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="field wide">
                <span>Local / endereço</span>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </label>
              <label className="field wide">
                <span>Motivo</span>
                <input
                  placeholder="ex.: consulta de rotina, dor no joelho"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
              <label className="field wide">
                <span>Observações</span>
                <textarea
                  placeholder="ex.: levar exames anteriores, ir em jejum, carteirinha do plano"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>

            <fieldset>
              <legend>Alertas</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.morningAlert}
                  onChange={(e) => setForm({ ...form, morningAlert: e.target.checked })}
                />
                No dia da consulta, às {profile.morningAlertTime}
              </label>
              <div className="check-grid">
                {REMINDER_OPTIONS.map((o) => (
                  <label key={o.minutes} className="check">
                    <input
                      type="checkbox"
                      checked={form.reminders.includes(o.minutes)}
                      onChange={() => toggleReminder(o.minutes)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              <p className="hint small muted">O horário do alerta do dia pode ser alterado no Perfil.</p>
            </fieldset>

            {form.id != null && (
              <div className="form-grid">
                <label className="field">
                  <span>Situação</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentStatus })}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {form.status === 'realizada' && (
                  <label className="field wide">
                    <span>Resumo e orientações</span>
                    <textarea
                      autoFocus
                      placeholder="Diagnóstico, remédios receitados, exames pedidos, quando voltar…"
                      value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
