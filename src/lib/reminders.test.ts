import { describe, expect, it } from 'vitest';
import type { Appointment, Medication, MedicationLog } from '../db/types';
import {
  appointmentReminderTimes,
  dosesForDay,
  dueAppointmentNotifications,
  dueMedicationNotifications,
  pastReminderKeys,
} from './reminders';

const appt: Appointment = {
  id: 7,
  kind: 'consulta',
  specialty: 'Oftalmologia',
  professional: 'Dra. Ana',
  datetime: '2026-10-05T14:30',
  durationMin: 60,
  location: 'Clínica Visão',
  status: 'agendada',
  reminders: [1440, 120],
  morningAlert: true,
};

describe('alertas de consulta', () => {
  it('gera os horários em ordem, incluindo o alerta da manhã', () => {
    const times = appointmentReminderTimes(appt, '07:00');
    expect(times.map((t) => t.at.toString())).toEqual([
      new Date(2026, 9, 4, 14, 30).toString(),
      new Date(2026, 9, 5, 7, 0).toString(),
      new Date(2026, 9, 5, 12, 30).toString(),
    ]);
    expect(times[1].label).toBe('No dia, às 07:00');
    expect(times[1].minutesBefore).toBe(450);
  });

  it('não cria alerta da manhã depois do horário da consulta', () => {
    const early = { ...appt, datetime: '2026-10-05T06:30' };
    expect(appointmentReminderTimes(early, '07:00').some((t) => t.key.endsWith(':dia'))).toBe(false);
  });

  it('nada vence antes do primeiro alerta', () => {
    expect(dueAppointmentNotifications([appt], new Date(2026, 9, 4, 14, 0), new Set(), '07:00')).toEqual([]);
  });

  it('dispara um dia antes com texto relativo', () => {
    const due = dueAppointmentNotifications([appt], new Date(2026, 9, 4, 14, 31), new Set(), '07:00');
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('Consulta amanhã às 14:30');
    expect(due[0].body).toBe('Oftalmologia com Dra. Ana — Clínica Visão');
  });

  it('agrupa alertas vencidos juntos e não repete os já disparados', () => {
    const now = new Date(2026, 9, 5, 13, 0);
    const due = dueAppointmentNotifications([appt], now, new Set(), '07:00');
    expect(due).toHaveLength(1);
    expect(due[0].keys).toHaveLength(3);
    expect(due[0].title).toBe('Consulta hoje às 14:30');
    expect(dueAppointmentNotifications([appt], now, new Set(due[0].keys), '07:00')).toEqual([]);
  });

  it('ignora consultas canceladas ou já passadas', () => {
    expect(dueAppointmentNotifications([{ ...appt, status: 'cancelada' }], new Date(2026, 9, 5, 13), new Set(), '07:00')).toEqual([]);
    expect(dueAppointmentNotifications([appt], new Date(2026, 9, 5, 16), new Set(), '07:00')).toEqual([]);
  });

  it('remarcar a consulta rearma os alertas', () => {
    const fired = new Set(pastReminderKeys(appt, new Date(2026, 9, 5, 13), '07:00'));
    const moved = { ...appt, datetime: '2026-10-06T14:30' };
    const due = dueAppointmentNotifications([moved], new Date(2026, 9, 5, 15), fired, '07:00');
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('Consulta amanhã às 14:30');
  });
});

describe('remédios', () => {
  const med: Medication = {
    id: 3,
    name: 'Losartana',
    dosage: '50 mg',
    times: ['20:00', '08:00'],
    startDate: '2026-09-01',
    active: true,
    remind: true,
  };

  it('lista doses do dia em ordem e respeita o período', () => {
    expect(dosesForDay([med], [], '2026-09-26').map((d) => d.time)).toEqual(['08:00', '20:00']);
    expect(dosesForDay([med], [], '2026-08-31')).toEqual([]);
    expect(dosesForDay([{ ...med, endDate: '2026-09-10' }], [], '2026-09-26')).toEqual([]);
  });

  it('avisa no horário e para depois de tomado', () => {
    const now = new Date(2026, 8, 26, 8, 5);
    const due = dueMedicationNotifications([med], [], now, new Set());
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('Hora do remédio: Losartana');
    const log: MedicationLog = { medicationId: 3, date: '2026-09-26', time: '08:00', takenAt: 0 };
    expect(dueMedicationNotifications([med], [log], now, new Set())).toEqual([]);
  });

  it('não avisa muito tempo depois do horário', () => {
    expect(dueMedicationNotifications([med], [], new Date(2026, 8, 26, 11, 0), new Set())).toEqual([]);
  });
});
