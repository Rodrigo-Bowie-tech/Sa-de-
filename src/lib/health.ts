import type { EyeRx, GlucoseContext, MeasurementType, VisionRecord } from '../db/types';
import { dayDiff, formatDate, formatShortDate, parseDateKey, todayKey } from './dates';
import { fmtDiopter } from './format';

/** Nível usado para colorir faixas de referência (sempre com texto junto). */
export type Level = 'good' | 'warning' | 'serious' | 'critical' | 'info';

export interface Classification {
  label: string;
  level: Level;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Classificação do IMC segundo a OMS. */
export function bmiCategory(value: number): Classification {
  if (value < 18.5) return { label: 'Abaixo do peso', level: 'warning' };
  if (value < 25) return { label: 'Peso normal', level: 'good' };
  if (value < 30) return { label: 'Sobrepeso', level: 'warning' };
  if (value < 35) return { label: 'Obesidade grau I', level: 'serious' };
  if (value < 40) return { label: 'Obesidade grau II', level: 'critical' };
  return { label: 'Obesidade grau III', level: 'critical' };
}

/** Pressão arterial (Diretriz Brasileira de Hipertensão 2020). Usa a pior das duas medidas. */
export function bloodPressureCategory(systolic: number, diastolic: number): Classification {
  const levels: Classification[] = [
    { label: 'Ótima', level: 'good' },
    { label: 'Normal', level: 'good' },
    { label: 'Pré-hipertensão', level: 'warning' },
    { label: 'Hipertensão estágio 1', level: 'serious' },
    { label: 'Hipertensão estágio 2', level: 'critical' },
    { label: 'Hipertensão estágio 3', level: 'critical' },
  ];
  const s = systolic < 120 ? 0 : systolic < 130 ? 1 : systolic < 140 ? 2 : systolic < 160 ? 3 : systolic < 180 ? 4 : 5;
  const d = diastolic < 80 ? 0 : diastolic < 85 ? 1 : diastolic < 90 ? 2 : diastolic < 100 ? 3 : diastolic < 110 ? 4 : 5;
  return levels[Math.max(s, d)];
}

export function glucoseCategory(mgdl: number, context: GlucoseContext = 'jejum'): Classification {
  if (mgdl < 70) return { label: 'Hipoglicemia', level: 'critical' };
  if (context === 'jejum') {
    if (mgdl < 100) return { label: 'Normal (jejum)', level: 'good' };
    if (mgdl < 126) return { label: 'Glicemia de jejum alterada', level: 'warning' };
    return { label: 'Elevada (jejum)', level: 'critical' };
  }
  if (context === 'pos_refeicao') {
    if (mgdl < 140) return { label: 'Normal (2 h após refeição)', level: 'good' };
    if (mgdl < 200) return { label: 'Alterada (2 h após refeição)', level: 'warning' };
    return { label: 'Elevada (2 h após refeição)', level: 'critical' };
  }
  if (mgdl < 200) return { label: 'Dentro do esperado', level: 'good' };
  return { label: 'Elevada', level: 'critical' };
}

export function heartRateCategory(bpm: number): Classification {
  if (bpm < 50) return { label: 'Baixa (bradicardia)', level: 'warning' };
  if (bpm <= 100) return { label: 'Normal em repouso', level: 'good' };
  return { label: 'Alta (taquicardia)', level: 'warning' };
}

export function temperatureCategory(celsius: number): Classification {
  if (celsius < 35) return { label: 'Hipotermia', level: 'critical' };
  if (celsius < 37.5) return { label: 'Normal', level: 'good' };
  if (celsius < 37.8) return { label: 'Febrícula', level: 'warning' };
  if (celsius < 39.5) return { label: 'Febre', level: 'serious' };
  return { label: 'Febre alta', level: 'critical' };
}

export function saturationCategory(pct: number): Classification {
  if (pct >= 95) return { label: 'Normal', level: 'good' };
  if (pct >= 91) return { label: 'Baixa', level: 'warning' };
  return { label: 'Muito baixa', level: 'critical' };
}

export function waistCategory(cm: number, sex?: 'feminino' | 'masculino'): Classification | undefined {
  if (!sex) return undefined;
  const [high, veryHigh] = sex === 'masculino' ? [94, 102] : [80, 88];
  if (cm < high) return { label: 'Risco cardiovascular baixo', level: 'good' };
  if (cm < veryHigh) return { label: 'Risco aumentado', level: 'warning' };
  return { label: 'Risco muito aumentado', level: 'serious' };
}

export interface MeasurementMeta {
  label: string;
  unit: string;
  digits: number;
  /** Rótulo do segundo valor, quando houver. */
  label2?: string;
  placeholder: string;
}

export const MEASUREMENT_TYPES: Record<MeasurementType, MeasurementMeta> = {
  peso: { label: 'Peso', unit: 'kg', digits: 1, placeholder: 'ex.: 72,5' },
  pressao: { label: 'Pressão arterial', unit: 'mmHg', digits: 0, label2: 'Diastólica', placeholder: 'ex.: 120' },
  glicemia: { label: 'Glicemia', unit: 'mg/dL', digits: 0, placeholder: 'ex.: 92' },
  frequencia: { label: 'Frequência cardíaca', unit: 'bpm', digits: 0, placeholder: 'ex.: 70' },
  temperatura: { label: 'Temperatura', unit: '°C', digits: 1, placeholder: 'ex.: 36,5' },
  saturacao: { label: 'Saturação (SpO₂)', unit: '%', digits: 0, placeholder: 'ex.: 98' },
  cintura: { label: 'Cintura', unit: 'cm', digits: 1, placeholder: 'ex.: 85' },
  gordura: { label: 'Gordura corporal', unit: '%', digits: 1, placeholder: 'ex.: 22' },
};

export function classifyMeasurement(
  type: MeasurementType,
  value: number,
  value2?: number,
  context?: GlucoseContext,
  sex?: 'feminino' | 'masculino',
): Classification | undefined {
  switch (type) {
    case 'pressao':
      return value2 != null ? bloodPressureCategory(value, value2) : undefined;
    case 'glicemia':
      return glucoseCategory(value, context);
    case 'frequencia':
      return heartRateCategory(value);
    case 'temperatura':
      return temperatureCategory(value);
    case 'saturacao':
      return saturationCategory(value);
    case 'cintura':
      return waistCategory(value, sex);
    default:
      return undefined;
  }
}

// ——— Visão ———

export interface EyeFindings {
  myopia?: number;
  hyperopia?: number;
  astigmatism?: { cyl: number; axis?: number };
  presbyopia?: number;
}

export function eyeFindings(eye: EyeRx): EyeFindings {
  const f: EyeFindings = {};
  if (eye.sph != null && eye.sph < 0) f.myopia = eye.sph;
  if (eye.sph != null && eye.sph > 0) f.hyperopia = eye.sph;
  if (eye.cyl) f.astigmatism = { cyl: eye.cyl, axis: eye.axis };
  if (eye.add && eye.add > 0) f.presbyopia = eye.add;
  return f;
}

/** Texto curto do grau: "-2,50 -0,75 × 180°". */
export function rxText(eye: EyeRx): string {
  const parts: string[] = [];
  parts.push(eye.sph != null ? fmtDiopter(eye.sph) : 'plano');
  if (eye.cyl) parts.push(`${fmtDiopter(eye.cyl)}${eye.axis != null ? ` × ${eye.axis}°` : ''}`);
  if (eye.add) parts.push(`adição ${fmtDiopter(eye.add)}`);
  return parts.join(' ');
}

/** Lista de diagnósticos legíveis para um exame de vista. */
export function visionDiagnoses(record: VisionRecord): string[] {
  const out: string[] = [];
  const od = eyeFindings(record.od);
  const oe = eyeFindings(record.oe);
  const both = (a?: number, b?: number) =>
    [a != null ? `OD ${fmtDiopter(a)}` : null, b != null ? `OE ${fmtDiopter(b)}` : null].filter(Boolean).join(' · ');
  if (od.myopia != null || oe.myopia != null) out.push(`Miopia: ${both(od.myopia, oe.myopia)}`);
  if (od.hyperopia != null || oe.hyperopia != null) out.push(`Hipermetropia: ${both(od.hyperopia, oe.hyperopia)}`);
  if (od.astigmatism || oe.astigmatism) out.push(`Astigmatismo: ${both(od.astigmatism?.cyl, oe.astigmatism?.cyl)}`);
  if (od.presbyopia != null || oe.presbyopia != null) out.push(`Presbiopia (vista cansada): adição ${both(od.presbyopia, oe.presbyopia)}`);
  if (out.length === 0) out.push('Sem grau registrado');
  return out;
}

/** Equivalente esférico (esférico + cilíndrico/2), usado para acompanhar a evolução da miopia. */
export function sphericalEquivalent(eye: EyeRx): number | undefined {
  if (eye.sph == null && eye.cyl == null) return undefined;
  return (eye.sph ?? 0) + (eye.cyl ?? 0) / 2;
}

// ——— Vacinas ———

/** Situação da próxima dose: atrasada, nos próximos 30 dias ou futura. */
export function nextDoseStatus(nextDate: string, today = todayKey()): Classification {
  const diff = dayDiff(parseDateKey(today), parseDateKey(nextDate));
  if (diff < 0) return { label: `Próxima dose atrasada (${formatShortDate(nextDate)})`, level: 'critical' };
  if (diff <= 30) return { label: `Próxima dose em ${formatShortDate(nextDate)}`, level: 'warning' };
  return { label: `Próxima dose em ${formatDate(nextDate)}`, level: 'info' };
}
