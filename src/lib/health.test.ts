import { describe, expect, it } from 'vitest';
import type { VisionRecord } from '../db/types';
import {
  bloodPressureCategory,
  bmi,
  bmiCategory,
  glucoseCategory,
  nextDoseStatus,
  rxText,
  sphericalEquivalent,
  visionDiagnoses,
} from './health';
import { addDaysKey, hoursBetween } from './dates';
import { capitalize, fmt, fmtDiopter, normalize, parseNumber } from './format';
import { niceTicks } from './ticks';

describe('IMC', () => {
  it('calcula e classifica', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
    expect(bmiCategory(17).label).toBe('Abaixo do peso');
    expect(bmiCategory(22.9).label).toBe('Peso normal');
    expect(bmiCategory(27).label).toBe('Sobrepeso');
    expect(bmiCategory(41).label).toBe('Obesidade grau III');
  });
});

describe('pressão arterial', () => {
  it('usa a pior classificação entre sistólica e diastólica', () => {
    expect(bloodPressureCategory(115, 75).label).toBe('Ótima');
    expect(bloodPressureCategory(125, 82).label).toBe('Normal');
    expect(bloodPressureCategory(118, 92).label).toBe('Hipertensão estágio 1');
    expect(bloodPressureCategory(165, 85).label).toBe('Hipertensão estágio 2');
    expect(bloodPressureCategory(185, 70).level).toBe('critical');
  });
});

describe('glicemia', () => {
  it('considera o contexto da medida', () => {
    expect(glucoseCategory(95, 'jejum').level).toBe('good');
    expect(glucoseCategory(110, 'jejum').label).toBe('Glicemia de jejum alterada');
    expect(glucoseCategory(130, 'jejum').level).toBe('critical');
    expect(glucoseCategory(130, 'pos_refeicao').level).toBe('good');
    expect(glucoseCategory(60, 'aleatoria').label).toBe('Hipoglicemia');
  });
});

describe('visão', () => {
  const record: VisionRecord = {
    date: '2026-01-10',
    kind: 'oculos',
    od: { sph: -2.5, cyl: -0.75, axis: 180 },
    oe: { sph: -2.25 },
  };

  it('formata grau', () => {
    expect(fmtDiopter(-2.5)).toBe('-2,50');
    expect(fmtDiopter(1.25)).toBe('+1,25');
    expect(fmtDiopter(0)).toBe('0,00');
    expect(rxText(record.od)).toBe('-2,50 -0,75 × 180°');
    expect(rxText({})).toBe('plano');
  });

  it('descreve miopia e astigmatismo', () => {
    expect(visionDiagnoses(record)).toEqual(['Miopia: OD -2,50 · OE -2,25', 'Astigmatismo: OD -0,75']);
    expect(visionDiagnoses({ ...record, od: {}, oe: {} })).toEqual(['Sem grau registrado']);
    expect(visionDiagnoses({ ...record, od: { sph: 1, add: 2 }, oe: { sph: 1.25, add: 2 } })).toEqual([
      'Hipermetropia: OD +1,00 · OE +1,25',
      'Presbiopia (vista cansada): adição OD +2,00 · OE +2,00',
    ]);
  });

  it('calcula equivalente esférico', () => {
    expect(sphericalEquivalent(record.od)).toBe(-2.875);
    expect(sphericalEquivalent({})).toBeUndefined();
  });
});

describe('números em pt-BR', () => {
  it('lê vírgula e ponto', () => {
    expect(parseNumber('72,5')).toBe(72.5);
    expect(parseNumber(' 80 ')).toBe(80);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
  });

  it('formata com vírgula', () => {
    expect(fmt(1234.56, 1)).toBe('1.234,6');
    expect(fmt(undefined)).toBe('—');
  });
});

describe('utilitários', () => {
  it('normaliza texto para busca', () => {
    expect(normalize(' Pão Francês ')).toBe('pao frances');
    expect(capitalize('sábado, 26 de setembro')).toBe('Sábado, 26 de setembro');
  });

  it('calcula horas de sono passando da meia-noite', () => {
    expect(hoursBetween('23:00', '07:00')).toBe(8);
    expect(hoursBetween('01:30', '06:45')).toBe(5.3);
  });

  it('soma dias em datas', () => {
    expect(addDaysKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('classifica a próxima dose de vacina', () => {
    expect(nextDoseStatus('2026-09-20', '2026-09-26').level).toBe('critical');
    expect(nextDoseStatus('2026-10-10', '2026-09-26').level).toBe('warning');
    expect(nextDoseStatus('2027-09-26', '2026-09-26').level).toBe('info');
  });

  it('gera marcas redondas para o eixo', () => {
    expect(niceTicks(0, 2420)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(-2.5, -1.5)).toEqual([-2.5, -2, -1.5]);
    expect(niceTicks(80, 80)).toEqual([70, 75, 80, 85, 90]);
  });
});
