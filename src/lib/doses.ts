import { db } from '../db/db';
import { formatTime, timeToMinutes } from './dates';
import type { Classification } from './health';
import type { Dose } from './reminders';

/** Marca ou desmarca uma dose como tomada. */
export async function toggleDose(dose: Dose, date: string): Promise<void> {
  if (dose.log?.id != null) await db.medicationLogs.delete(dose.log.id);
  else await db.medicationLogs.add({ medicationId: dose.med.id!, date, time: dose.time, takenAt: Date.now() });
}

export function doseStatus(dose: Dose, now: Date): Classification {
  if (dose.log) return { label: `Tomado às ${formatTime(new Date(dose.log.takenAt))}`, level: 'good' };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (timeToMinutes(dose.time) <= nowMin) return { label: 'Pendente', level: 'warning' };
  return { label: `Às ${dose.time}`, level: 'info' };
}
