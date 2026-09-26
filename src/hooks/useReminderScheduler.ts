import { useEffect } from 'react';
import { useToasts } from '../components/Toasts';
import { db, withProfileDefaults } from '../db/db';
import { toDateKey, toDateTimeKey } from '../lib/dates';
import { showSystemNotification } from '../lib/notifications';
import { dueAppointmentNotifications, dueMedicationNotifications } from '../lib/reminders';

const CHECK_INTERVAL_MS = 30_000;
const LOG_RETENTION_MS = 90 * 86_400_000;

/**
 * Verifica periodicamente os alertas de consultas e remédios enquanto o app
 * está aberto (inclusive em segundo plano) e mostra notificações.
 */
export function useReminderScheduler(): void {
  const { notify } = useToasts();

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      const now = new Date();
      const profile = withProfileDefaults(await db.profile.get('me'));
      const from = toDateTimeKey(new Date(now.getTime() - 60 * 60_000));
      const [appointments, meds, logs, firedRows] = await Promise.all([
        db.appointments.where('datetime').aboveOrEqual(from).toArray(),
        db.medications.toArray(),
        db.medicationLogs.where('date').equals(toDateKey(now)).toArray(),
        db.notificationLog.toArray(),
      ]);
      const fired = new Set(firedRows.map((r) => r.key));
      const due = [
        ...dueAppointmentNotifications(appointments, now, fired, profile.morningAlertTime),
        ...dueMedicationNotifications(meds, logs, now, fired),
      ];
      for (const n of due) {
        if (stopped) return;
        await db.notificationLog.bulkPut(n.keys.map((key) => ({ key, firedAt: now.getTime() })));
        notify({ title: n.title, body: n.body, url: n.url });
        await showSystemNotification(n);
      }
    };

    // Evita alertas duplicados quando o app está aberto em mais de uma aba.
    const tick = () => {
      const locks = navigator.locks;
      const run = locks
        ? locks.request('minha-saude-alertas', { ifAvailable: true }, (lock) => (lock ? check() : undefined))
        : check();
      Promise.resolve(run).catch((e) => console.error('Falha ao verificar alertas', e));
    };

    tick();
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    db.notificationLog.where('firedAt').below(Date.now() - LOG_RETENTION_MS).delete().catch(() => {});

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [notify]);
}
