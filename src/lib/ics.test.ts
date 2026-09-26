import { describe, expect, it } from 'vitest';
import type { Appointment, Medication } from '../db/types';
import { appointmentEvent, buildIcs, escapeText, foldLine, googleCalendarUrl, medicationEvents } from './ics';

const appt: Appointment = {
  id: 1,
  kind: 'consulta',
  specialty: 'Cardiologia',
  professional: 'Dr. João',
  datetime: '2026-10-05T09:00',
  durationMin: 30,
  location: 'Rua A, 123; sala 4',
  status: 'agendada',
  reminders: [1440, 60],
  morningAlert: true,
};

describe('ics', () => {
  it('escapa caracteres especiais', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  it('quebra linhas longas em até 75 bytes', () => {
    const line = `DESCRIPTION:${'á'.repeat(100)}`;
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });

  it('gera evento de consulta com alarmes', () => {
    const ics = buildIcs([appointmentEvent(appt, '07:00')], new Date(Date.UTC(2026, 8, 26, 12)));
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261005T090000\r\n');
    expect(ics).toContain('DTEND:20261005T093000\r\n');
    expect(ics).toContain('DTSTAMP:20260926T120000Z\r\n');
    expect(ics).toContain('SUMMARY:Consulta: Cardiologia — Dr. João\r\n');
    expect(ics).toContain('LOCATION:Rua A\\, 123\\; sala 4\r\n');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics).toContain('TRIGGER:-PT1440M');
    expect(ics).toContain('TRIGGER:-PT120M');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('gera eventos diários para remédios', () => {
    const med: Medication = {
      id: 2,
      name: 'Vitamina D',
      dosage: '1 cápsula',
      times: ['08:00', '20:00'],
      startDate: '2026-09-26',
      endDate: '2026-10-26',
      active: true,
      remind: true,
    };
    const events = medicationEvents(med);
    expect(events).toHaveLength(2);
    expect(events[1].rrule).toBe('FREQ=DAILY;UNTIL=20261026T235900');
    const ics = buildIcs(events);
    expect(ics).toContain('DTSTART:20260926T200000');
    expect(ics).toContain('TRIGGER:PT0M');
  });

  it('monta link do Google Agenda', () => {
    const url = new URL(googleCalendarUrl(appointmentEvent(appt, '07:00')));
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20261005T090000/20261005T093000');
    expect(url.searchParams.get('text')).toBe('Consulta: Cardiologia — Dr. João');
  });
});
