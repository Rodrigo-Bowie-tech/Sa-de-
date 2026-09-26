import type { HealthDB } from '../db/db';

export interface Backup {
  app: 'minha-saude';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportBackup(db: HealthDB, now = new Date()): Promise<Backup> {
  const data: Record<string, unknown[]> = {};
  for (const table of db.tables) data[table.name] = await table.toArray();
  return { app: 'minha-saude', version: 1, exportedAt: now.toISOString(), data };
}

export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const b = parsed as Partial<Backup>;
  if (!b || b.app !== 'minha-saude' || typeof b.data !== 'object' || b.data === null) {
    throw new Error('Este arquivo não é um backup do Minha Saúde.');
  }
  for (const [name, rows] of Object.entries(b.data)) {
    if (!Array.isArray(rows)) throw new Error(`Dados inválidos na tabela "${name}".`);
  }
  return b as Backup;
}

/** Substitui todos os dados atuais pelos do backup (em uma única transação). */
export async function restoreBackup(db: HealthDB, backup: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.data[table.name];
      if (rows?.length) await table.bulkPut(rows);
    }
  });
}

export async function clearAll(db: HealthDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
