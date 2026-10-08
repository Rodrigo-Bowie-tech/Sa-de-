import type { ActiveSession } from './session';

/** O treino em andamento fica só neste aparelho; o histórico é que é sincronizado. */
const KEY = 'treino:em-andamento';

export function loadActive(): ActiveSession | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as ActiveSession;
    return s && s.plan && Array.isArray(s.plan.items) ? s : undefined;
  } catch {
    return undefined;
  }
}

export function saveActive(session: ActiveSession | undefined): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento: o treino continua, mas não sobrevive a um recarregamento.
  }
}
