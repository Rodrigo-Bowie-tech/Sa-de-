import type { SessionRecord, Settings } from '../types';

/** Nome do arquivo guardado na gist do GitHub. */
export const SYNC_FILE = 'treino-sync.json';

/** Tudo o que é sincronizado entre os aparelhos. */
export interface SyncDoc {
  app: 'treino';
  version: 1;
  settings?: Settings;
  sessions: SessionRecord[];
}

export function emptyDoc(): SyncDoc {
  return { app: 'treino', version: 1, sessions: [] };
}

export function parseDoc(text: string): SyncDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Os dados não são um JSON válido.');
  }
  const doc = parsed as Partial<SyncDoc>;
  if (!doc || doc.app !== 'treino' || !Array.isArray(doc.sessions)) {
    throw new Error('Estes dados não são do app Treino.');
  }
  for (const s of doc.sessions) {
    if (!s || typeof s.id !== 'string' || typeof s.updatedAt !== 'number' || !Array.isArray(s.entries)) {
      throw new Error('Há um treino com dados inválidos.');
    }
  }
  return { app: 'treino', version: 1, sessions: doc.sessions, ...(doc.settings ? { settings: doc.settings } : {}) };
}

/** JSON com as chaves em ordem alfabética (para comparar registros vindos de lugares diferentes). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Qual versão de um registro vence: a alterada por último. Num empate (raro),
 * a comparação do conteúdo garante que todos os aparelhos escolham a mesma.
 */
export function isNewer<T extends { updatedAt: number }>(candidate: T, current: T | undefined): boolean {
  if (!current) return true;
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return stableStringify(candidate) > stableStringify(current);
}

/** Junta dois conjuntos de dados registro a registro (exclusões incluídas). */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const sessions = new Map<string, SessionRecord>();
  for (const s of [...a.sessions, ...b.sessions]) {
    if (isNewer(s, sessions.get(s.id))) sessions.set(s.id, s);
  }
  let settings = a.settings;
  if (b.settings && isNewer(b.settings, settings)) settings = b.settings;
  return {
    app: 'treino',
    version: 1,
    ...(settings ? { settings } : {}),
    sessions: [...sessions.values()].sort((x, y) => x.startedAt.localeCompare(y.startedAt) || x.id.localeCompare(y.id)),
  };
}

export function docsEqual(a: SyncDoc, b: SyncDoc): boolean {
  const norm = (d: SyncDoc) => ({ ...d, sessions: [...d.sessions].sort((x, y) => x.id.localeCompare(y.id)) });
  return stableStringify(norm(a)) === stableStringify(norm(b));
}

/* ——— Código para conectar outro aparelho ——— */

export interface ConnectInfo {
  token: string;
  gistId?: string;
}

const CODE_PREFIX = 'TR1.';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeConnectCode(info: { token: string; gistId: string }): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify({ t: info.token, g: info.gistId }));
}

const TOKEN_RE = /^(ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{20,255}$/;

/** Aceita um código de conexão (de outro aparelho) ou um token do GitHub colado diretamente. */
export function parseConnectInput(input: string): ConnectInfo | undefined {
  const text = input.trim();
  if (TOKEN_RE.test(text)) return { token: text };
  const start = text.indexOf(CODE_PREFIX);
  if (start < 0) return undefined;
  const code = text.slice(start + CODE_PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0];
  if (!code) return undefined;
  try {
    const data = JSON.parse(fromBase64Url(code)) as { t?: unknown; g?: unknown };
    if (typeof data.t !== 'string' || !TOKEN_RE.test(data.t)) return undefined;
    return { token: data.t, gistId: typeof data.g === 'string' && /^[0-9a-f]+$/i.test(data.g) ? data.g : undefined };
  } catch {
    return undefined;
  }
}
