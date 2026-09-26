import { useEffect, useState } from 'react';

/** Data/hora atual, atualizada periodicamente (para textos como "hoje", "amanhã"). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
