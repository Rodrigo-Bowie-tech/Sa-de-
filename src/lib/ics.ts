import type { Appointment, Medication } from '../db/types';
import { atTime, parseDateKey, parseDateTime } from './dates';
import { appointmentBody, appointmentReminderTimes, KIND_LABELS } from './reminders';

export interface CalendarEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  /** Alarmes em minutos antes do início. */
  alarms: number[];
  rrule?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data/hora local "flutuante" (sem fuso): o calendário usa o fuso do aparelho. */
export function icsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Quebra linhas com mais de 75 bytes (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function alarmTrigger(minutes: number): string {
  return minutes === 0 ? 'PT0M' : `-PT${minutes}M`;
}

export function buildIcs(events: CalendarEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Minha Saude//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${icsUtc(now)}`,
      `DTSTART:${icsLocal(ev.start)}`,
      `DTEND:${icsLocal(ev.end)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    for (const minutes of [...new Set(ev.alarms)].sort((a, b) => b - a)) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(ev.summary)}`,
        `TRIGGER:${alarmTrigger(minutes)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function appointmentEvent(appt: Appointment, morningTime: string): CalendarEvent {
  const start = parseDateTime(appt.datetime);
  const end = new Date(start.getTime() + (appt.durationMin || 60) * 60_000);
  const summary = `${KIND_LABELS[appt.kind] ?? 'Consulta'}: ${appt.specialty}${appt.professional ? ` — ${appt.professional}` : ''}`;
  const description = [
    appointmentBody(appt),
    appt.reason && `Motivo: ${appt.reason}`,
    appt.phone && `Telefone: ${appt.phone}`,
    appt.notes && `Observações: ${appt.notes}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    uid: `consulta-${appt.id ?? 'nova'}-${icsLocal(start)}@minha-saude`,
    start,
    end,
    summary,
    description,
    location: appt.location,
    alarms: appointmentReminderTimes(appt, morningTime).map((r) => r.minutesBefore),
  };
}

/** Um evento diário recorrente por horário do remédio, com alarme na hora. */
export function medicationEvents(med: Medication): CalendarEvent[] {
  const first = parseDateKey(med.startDate);
  const until = med.endDate ? `;UNTIL=${icsLocal(atTime(parseDateKey(med.endDate), '23:59'))}` : '';
  return med.times.map((time) => {
    const start = atTime(first, time);
    return {
      uid: `remedio-${med.id ?? 'novo'}-${time.replace(':', '')}@minha-saude`,
      start,
      end: new Date(start.getTime() + 15 * 60_000),
      summary: `Remédio: ${med.name}${med.dosage ? ` (${med.dosage})` : ''}`,
      description: med.instructions,
      alarms: [0],
      rrule: `FREQ=DAILY${until}`,
    };
  });
}

/** Link para criar o evento no Google Agenda. */
export function googleCalendarUrl(ev: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.summary,
    dates: `${icsLocal(ev.start)}/${icsLocal(ev.end)}`,
    details: ev.description ?? '',
    location: ev.location ?? '',
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
