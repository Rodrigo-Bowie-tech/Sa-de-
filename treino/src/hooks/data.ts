import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings, withDefaults } from '../db';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../lib/syncEngine';
import { liveSessions } from '../lib/progress';
import type { SessionRecord, Settings } from '../types';

/** Ajustes atuais; `undefined` enquanto carrega. */
export function useSettings(): Settings | undefined {
  const row = useLiveQuery(async () => (await db.settings.get('me')) ?? null);
  return row === undefined ? undefined : withDefaults(row ?? undefined);
}

/**
 * Ajustes para formulários: a tela muda na hora e a gravação acontece em
 * seguida (o valor salvo, inclusive o que chega pela sincronização, prevalece).
 */
export function useEditableSettings(): [Settings | undefined, (changes: Partial<Settings>) => void] {
  const stored = useSettings();
  const [local, setLocal] = useState<Settings>();
  const version = stored?.updatedAt;
  useEffect(() => {
    if (stored) setLocal(stored);
    // Só quando o registro salvo muda.
  }, [version]);
  const change = useCallback((changes: Partial<Settings>) => {
    setLocal((l) => l && { ...l, ...changes });
    void saveSettings(db, changes);
  }, []);
  return [local ?? stored, change];
}

/** Todos os treinos (inclusive os marcadores de exclusão); `undefined` enquanto carrega. */
export function useAllSessions(): SessionRecord[] | undefined {
  return useLiveQuery(() => db.sessions.toArray());
}

/** Treinos válidos, do mais recente para o mais antigo. */
export function useSessions(): SessionRecord[] | undefined {
  const all = useAllSessions();
  return all && liveSessions(all);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
}
