import Dexie, { type EntityTable } from 'dexie';
import type { SessionRecord, Settings } from './types';
import { isNewer, type SyncDoc } from './lib/sync';

export class TreinoDB extends Dexie {
  sessions!: EntityTable<SessionRecord, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'treino') {
    super(name);
    this.version(1).stores({
      sessions: 'id, startedAt',
      settings: 'id',
    });
  }
}

export const db = new TreinoDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'me',
  equipment: [],
  durationMin: 60,
  restSec: 60,
  fasciitis: true,
  footSide: 'ambos',
  weeklyGoal: 3,
  voice: true,
  sound: true,
  configured: false,
  updatedAt: 0,
};

export function withDefaults(settings: Settings | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

/* ——— Aviso de alteração local (dispara a sincronização) ——— */

const changeListeners = new Set<() => void>();

export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitLocalChange(): void {
  changeListeners.forEach((l) => l());
}

export async function saveSettings(target: TreinoDB, changes: Partial<Settings>): Promise<void> {
  const current = withDefaults(await target.settings.get('me'));
  await target.settings.put({ ...current, ...changes, id: 'me', updatedAt: Date.now() });
  emitLocalChange();
}

export async function saveSession(target: TreinoDB, record: SessionRecord): Promise<void> {
  await target.sessions.put({ ...record, updatedAt: Date.now() });
  emitLocalChange();
}

/** Exclui um treino deixando um marcador, para que a exclusão chegue aos outros aparelhos. */
export async function deleteSession(target: TreinoDB, id: string): Promise<void> {
  const current = await target.sessions.get(id);
  if (!current) return;
  await target.sessions.put({ ...current, entries: [], notes: undefined, footPain: undefined, deleted: true, updatedAt: Date.now() });
  emitLocalChange();
}

/* ——— Exportação e importação (sincronização e backup) ——— */

export async function exportDoc(target: TreinoDB): Promise<SyncDoc> {
  const [settings, sessions] = await Promise.all([target.settings.get('me'), target.sessions.toArray()]);
  return { app: 'treino', version: 1, ...(settings ? { settings } : {}), sessions };
}

/**
 * Grava os registros do documento que forem mais novos que os do aparelho.
 * Cada registro é comparado dentro da transação, então uma alteração feita
 * durante a sincronização não é sobrescrita. Retorna quantos registros mudaram.
 */
export async function importDoc(target: TreinoDB, doc: SyncDoc): Promise<number> {
  let changed = 0;
  await target.transaction('rw', target.sessions, target.settings, async () => {
    if (doc.settings && isNewer(doc.settings, await target.settings.get('me'))) {
      await target.settings.put({ ...doc.settings, id: 'me' });
      changed++;
    }
    const existing = new Map((await target.sessions.bulkGet(doc.sessions.map((s) => s.id))).map((s, i) => [doc.sessions[i].id, s]));
    const newer = doc.sessions.filter((s) => isNewer(s, existing.get(s.id)));
    if (newer.length) await target.sessions.bulkPut(newer);
    changed += newer.length;
  });
  return changed;
}
