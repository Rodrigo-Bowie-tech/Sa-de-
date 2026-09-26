import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Classification, Level } from '../lib/health';

export const LEVEL_ICONS: Record<Level, LucideIcon> = {
  good: CircleCheck,
  warning: TriangleAlert,
  serious: TriangleAlert,
  critical: OctagonAlert,
  info: Info,
};

/** Selo de faixa de referência: a cor sempre vem acompanhada de ícone e texto. */
export function StatusBadge({ value }: { value: Classification }) {
  const Icon = LEVEL_ICONS[value.level];
  return (
    <span className={`badge ${value.level}`}>
      <Icon size={14} aria-hidden />
      {value.label}
    </span>
  );
}
