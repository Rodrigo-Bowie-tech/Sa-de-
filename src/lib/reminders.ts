import type { Appointment, AppointmentKind, Medication, MedicationLog } from '../db/types';
import { atTime, formatTime, parseDateTime, relativeDay, toDateKey } from './dates';
import { fmtDuration } from './format';

export const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 10080, label: '1 semana antes' },
  { minutes: 2880, label: '2 dias antes' },
  { minutes: 1440, label: '1 dia antes' },
  { minutes: 180, label: '3 horas antes' },
  { minutes: 120, label: '2 horas antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 30, label: '30 minutos antes' },
  { minutes: 0, label: 'Na hora' },
];

export const DEFAULT_REMINDERS = [1440, 120];

export const KIND_LABELS: Record<AppointmentKind, string> = {
  consulta: 'Consulta',
  retorno: 'Retorno',
  exame: 'Exame',
  procedimento: 'Procedimento',
  terapia: 'Terapia',
  vacina: 'Vacinação',
  outro: 'Compromisso',
};

export function reminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${fmtDuration(minutes)} antes`;
}

export interface ReminderTime {
  key: string;
  at: Date;
  label: string;
  minutesBefore: number;
}

/** Todos os momentos de alerta de uma consulta, em ordem cronológica. */
export function appointmentReminderTimes(appt: Appointment, morningTime: string): ReminderTime[] {
  if (appt.id == null) return [];
  const start = parseDateTime(appt.datetime);
  // A data/hora faz parte da chave: remarcar a consulta rearma os alertas.
  const base = `appt:${appt.id}:${appt.datetime}`;
  const list: ReminderTime[] = appt.reminders.map((m) => ({
    key: `${base}:${m}`,
    at: new Date(start.getTime() - m * 60_000),
    label: reminderLabel(m),
    minutesBefore: m,
  }));
  if (appt.morningAlert) {
    const morning = atTime(start, morningTime);
    const minutesBefore = Math.round((start.getTime() - morning.getTime()) / 60_000);
    if (minutesBefore > 0 && !list.some((r) => r.minutesBefore === minutesBefore)) {
      list.push({ key: `${base}:dia`, at: morning, label: `No dia, às ${morningTime}`, minutesBefore });
    }
  }
  return list.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface DueNotification {
  /** Chaves marcadas como disparadas quando a notificação é exibida. */
  keys: string[];
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Tolerância para o alerta "na hora" quando o app só é aberto depois do horário. */
const APPOINTMENT_GRACE_MS = 15 * 60_000;
/** Por quanto tempo um remédio atrasado ainda gera alerta. */
const MEDICATION_WINDOW_MS = 2 * 60 * 60_000;

export function appointmentTitle(appt: Appointment, now: Date): string {
  const start = parseDateTime(appt.datetime);
  const kind = KIND_LABELS[appt.kind] ?? 'Consulta';
  if (start.getTime() <= now.getTime()) return `${kind} agora (${formatTime(start)})`;
  return `${kind} ${relativeDay(start, now)} às ${formatTime(start)}`;
}

export function appointmentBody(appt: Appointment): string {
  let body = appt.specialty;
  if (appt.professional) body += ` com ${appt.professional}`;
  if (appt.location) body += ` — ${appt.location}`;
  return body;
}

/**
 * Alertas de consulta que já deveriam ter tocado e ainda não tocaram.
 * Se vários venceram juntos (app fechado por dias), só o mais recente é exibido.
 */
export function dueAppointmentNotifications(
  appointments: Appointment[],
  now: Date,
  fired: Set<string>,
  morningTime: string,
): DueNotification[] {
  const out: DueNotification[] = [];
  for (const appt of appointments) {
    if (appt.status !== 'agendada' || appt.id == null) continue;
    const start = parseDateTime(appt.datetime);
    if (now.getTime() > start.getTime() + APPOINTMENT_GRACE_MS) continue;
    const due = appointmentReminderTimes(appt, morningTime).filter(
      (r) => r.at.getTime() <= now.getTime() && !fired.has(r.key),
    );
    if (due.length === 0) continue;
    out.push({
      keys: due.map((r) => r.key),
      title: appointmentTitle(appt, now),
      body: appointmentBody(appt),
      url: '#/agenda',
      tag: `appt-${appt.id}`,
    });
  }
  return out;
}

/** Chaves de alertas que já passaram — usadas ao salvar para não disparar alertas antigos. */
export function pastReminderKeys(appt: Appointment, now: Date, morningTime: string): string[] {
  return appointmentReminderTimes(appt, morningTime)
    .filter((r) => r.at.getTime() <= now.getTime())
    .map((r) => r.key);
}

export function isMedicationActiveOn(med: Medication, dateKey: string): boolean {
  if (!med.active) return false;
  if (med.startDate && dateKey < med.startDate) return false;
  if (med.endDate && dateKey > med.endDate) return false;
  return true;
}

export interface Dose {
  med: Medication;
  time: string;
  log?: MedicationLog;
}

/** Doses previstas no dia, ordenadas por horário. */
export function dosesForDay(meds: Medication[], logs: MedicationLog[], dateKey: string): Dose[] {
  const doses: Dose[] = [];
  for (const med of meds) {
    if (med.id == null || !isMedicationActiveOn(med, dateKey)) continue;
    for (const time of med.times) {
      const log = logs.find((l) => l.medicationId === med.id && l.date === dateKey && l.time === time);
      doses.push({ med, time, log });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

export function medicationKey(medId: number, dateKey: string, time: string): string {
  return `med:${medId}:${dateKey}:${time}`;
}

export function dueMedicationNotifications(
  meds: Medication[],
  logs: MedicationLog[],
  now: Date,
  fired: Set<string>,
): DueNotification[] {
  const today = toDateKey(now);
  const out: DueNotification[] = [];
  for (const dose of dosesForDay(meds, logs, today)) {
    if (!dose.med.remind || dose.log) continue;
    const at = atTime(now, dose.time);
    const late = now.getTime() - at.getTime();
    const key = medicationKey(dose.med.id!, today, dose.time);
    if (late < 0 || late > MEDICATION_WINDOW_MS || fired.has(key)) continue;
    out.push({
      keys: [key],
      title: `Hora do remédio: ${dose.med.name}`,
      body: `${dose.med.dosage ? `${dose.med.dosage} — ` : ''}horário das ${dose.time}`,
      url: '#/saude/remedios',
      tag: key,
    });
  }
  return out;
}
