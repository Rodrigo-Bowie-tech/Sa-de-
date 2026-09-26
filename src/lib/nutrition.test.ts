import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../db/db';
import type { FoodEntry } from '../db/types';
import {
  bmr,
  calorieGoal,
  estimateActivityKcal,
  estimateEnergy,
  MIN_CALORIE_GOAL,
  nutrientsFor,
  per100FromEntry,
  sumNutrients,
} from './nutrition';

describe('bmr (Mifflin-St Jeor)', () => {
  it('calcula para homem e mulher', () => {
    expect(bmr('masculino', 80, 180, 30)).toBeCloseTo(1780, 0);
    expect(bmr('feminino', 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });
});

describe('estimateEnergy', () => {
  const profile = {
    ...DEFAULT_PROFILE,
    sex: 'masculino' as const,
    heightCm: 180,
    birthDate: '1996-01-15',
    activityLevel: 'moderado' as const,
    weightGoal: 'perder' as const,
  };
  const today = new Date(2026, 8, 26);

  it('aplica fator de atividade e objetivo', () => {
    const e = estimateEnergy(profile, 80, today)!;
    expect(e.bmr).toBe(1780);
    expect(e.tdee).toBe(Math.round(1780 * 1.55));
    expect(e.goal).toBe(Math.round((1780 * 1.55 - 500) / 10) * 10);
  });

  it('precisa de sexo, altura, nascimento e peso', () => {
    expect(estimateEnergy({ ...profile, sex: undefined }, 80, today)).toBeUndefined();
    expect(estimateEnergy(profile, undefined, today)).toBeUndefined();
  });

  it('nunca fica abaixo do mínimo seguro', () => {
    const small = { ...profile, sex: 'feminino' as const, heightCm: 150, activityLevel: 'sedentario' as const };
    expect(estimateEnergy(small, 45, today)!.goal).toBeGreaterThanOrEqual(MIN_CALORIE_GOAL);
  });

  it('meta manual tem prioridade', () => {
    expect(calorieGoal({ ...profile, calorieGoalOverride: 1800 }, 80, today)).toBe(1800);
  });
});

describe('nutrientes', () => {
  it('calcula por quantidade', () => {
    const arroz = { kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2 };
    expect(nutrientsFor(arroz, 150)).toEqual({ kcal: 192, protein: 3.8, carbs: 42.2, fat: 0.3 });
  });

  it('soma lançamentos', () => {
    const total = sumNutrients([
      { kcal: 100, protein: 1.25, carbs: 10, fat: 1 },
      { kcal: 250, protein: 2.5, carbs: 0, fat: 3.3 },
    ]);
    expect(total).toEqual({ kcal: 350, protein: 3.8, carbs: 10, fat: 4.3 });
  });

  it('recupera valores por 100 g de um lançamento', () => {
    const entry: FoodEntry = { date: '2026-09-26', meal: 'almoco', name: 'X', grams: 200, kcal: 300, protein: 20, carbs: 30, fat: 10, createdAt: 0 };
    expect(per100FromEntry(entry)).toMatchObject({ kcal: 150, protein: 10, carbs: 15, fat: 5 });
    expect(per100FromEntry({ ...entry, grams: 0 })).toBeUndefined();
  });

  it('estima calorias de exercício por MET', () => {
    expect(estimateActivityKcal('Corrida', 30, 70)).toBe(Math.round(9.8 * 70 * 0.5));
    expect(estimateActivityKcal('Desconhecida', 60, 70)).toBe(280);
  });
});
