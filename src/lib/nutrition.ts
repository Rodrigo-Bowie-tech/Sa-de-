import type { ActivityLevel, FoodEntry, FoodItem, MealType, Nutrients, Profile, Sex, WeightGoal } from '../db/types';
import { ageOn } from './dates';

export const ACTIVITY_LEVELS: Record<ActivityLevel, { label: string; factor: number; hint: string }> = {
  sedentario: { label: 'Sedentário', factor: 1.2, hint: 'pouco ou nenhum exercício' },
  leve: { label: 'Levemente ativo', factor: 1.375, hint: 'exercício leve 1–3 dias/semana' },
  moderado: { label: 'Moderadamente ativo', factor: 1.55, hint: 'exercício 3–5 dias/semana' },
  intenso: { label: 'Muito ativo', factor: 1.725, hint: 'exercício intenso 6–7 dias/semana' },
  muito_intenso: { label: 'Extremamente ativo', factor: 1.9, hint: 'treino pesado ou trabalho físico' },
};

export const WEIGHT_GOALS: Record<WeightGoal, { label: string; delta: number }> = {
  perder: { label: 'Perder peso', delta: -500 },
  manter: { label: 'Manter o peso', delta: 0 },
  ganhar: { label: 'Ganhar peso', delta: 300 },
};

export const MIN_CALORIE_GOAL = 1200;

export const MEALS: { key: MealType; label: string }[] = [
  { key: 'cafe', label: 'Café da manhã' },
  { key: 'lanche_manha', label: 'Lanche da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche_tarde', label: 'Lanche da tarde' },
  { key: 'jantar', label: 'Jantar' },
  { key: 'ceia', label: 'Ceia' },
];

/** Refeição sugerida pelo horário atual. */
export function mealForTime(d: Date): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10) return 'cafe';
  if (h < 11.5) return 'lanche_manha';
  if (h < 15) return 'almoco';
  if (h < 18.5) return 'lanche_tarde';
  if (h < 22) return 'jantar';
  return 'ceia';
}

/** Divisão de referência das calorias: 20% proteína, 50% carboidratos, 30% gorduras. */
export function macroTargets(kcal: number): Omit<Nutrients, 'kcal'> {
  return {
    protein: Math.round((kcal * 0.2) / 4),
    carbs: Math.round((kcal * 0.5) / 4),
    fat: Math.round((kcal * 0.3) / 9),
  };
}

/** Taxa metabólica basal (Mifflin-St Jeor), em kcal/dia. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'masculino' ? base + 5 : base - 161;
}

export interface EnergyEstimate {
  bmr: number;
  tdee: number;
  goal: number;
}

/** Gasto diário estimado e meta calórica a partir do perfil. */
export function estimateEnergy(profile: Profile, weightKg: number | undefined, today = new Date()): EnergyEstimate | undefined {
  if (!profile.sex || !profile.heightCm || !profile.birthDate || !weightKg) return undefined;
  const age = ageOn(profile.birthDate, today);
  const basal = bmr(profile.sex, weightKg, profile.heightCm, age);
  const tdee = basal * ACTIVITY_LEVELS[profile.activityLevel].factor;
  const goal = Math.max(MIN_CALORIE_GOAL, tdee + WEIGHT_GOALS[profile.weightGoal].delta);
  return { bmr: Math.round(basal), tdee: Math.round(tdee), goal: Math.round(goal / 10) * 10 };
}

/** Meta do dia: a definida manualmente ou a estimada. */
export function calorieGoal(profile: Profile, weightKg: number | undefined, today = new Date()): number | undefined {
  return profile.calorieGoalOverride || estimateEnergy(profile, weightKg, today)?.goal;
}

/** Nutrientes de uma quantidade em gramas de um alimento (valores por 100 g). */
export function nutrientsFor(food: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal * f),
    protein: round1(food.protein * f),
    carbs: round1(food.carbs * f),
    fat: round1(food.fat * f),
  };
}

/** Valores por 100 g deduzidos de um lançamento (para editar ou repetir). */
export function per100FromEntry(entry: FoodEntry): FoodItem | undefined {
  if (!entry.grams) return undefined;
  const f = 100 / entry.grams;
  return {
    name: entry.name,
    kcal: round1(entry.kcal * f),
    protein: round1(entry.protein * f),
    carbs: round1(entry.carbs * f),
    fat: round1(entry.fat * f),
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const total = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + (i.kcal || 0),
      protein: acc.protein + (i.protein || 0),
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { kcal: Math.round(total.kcal), protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** MET aproximado por tipo de atividade (Compêndio de Atividades Físicas). */
export const ACTIVITY_METS: Record<string, number> = {
  Caminhada: 3.5,
  'Caminhada rápida': 5,
  Corrida: 9.8,
  Musculação: 5,
  Ciclismo: 7.5,
  Natação: 7,
  Hidroginástica: 5.3,
  Yoga: 2.5,
  Pilates: 3,
  Dança: 5,
  Futebol: 7,
  Funcional: 8,
  Alongamento: 2.3,
  Outro: 4,
};

/** Calorias gastas estimadas: MET × peso (kg) × horas. */
export function estimateActivityKcal(type: string, durationMin: number, weightKg: number): number {
  const met = ACTIVITY_METS[type] ?? ACTIVITY_METS.Outro;
  return Math.round(met * weightKg * (durationMin / 60));
}
