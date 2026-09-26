// Datas são guardadas como texto local: "AAAA-MM-DD" e "AAAA-MM-DDTHH:mm".

export type Sex = 'feminino' | 'masculino';
export type ActivityLevel = 'sedentario' | 'leve' | 'moderado' | 'intenso' | 'muito_intenso';
export type WeightGoal = 'perder' | 'manter' | 'ganhar';

export interface Profile {
  id: 'me';
  name: string;
  birthDate?: string;
  sex?: Sex;
  heightCm?: number;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
  /** Meta calórica definida manualmente (substitui o cálculo automático). */
  calorieGoalOverride?: number;
  waterGoalMl: number;
  bloodType?: string;
  allergies?: string;
  conditions?: string;
  surgeries?: string;
  familyHistory?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  healthPlan?: string;
  healthPlanNumber?: string;
  susCard?: string;
  /** Horário do alerta "no dia da consulta". */
  morningAlertTime: string;
}

export type MealType = 'cafe' | 'lanche_manha' | 'almoco' | 'lanche_tarde' | 'jantar' | 'ceia';

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Alimento com valores por 100 g (ou 100 ml). */
export interface FoodItem extends Nutrients {
  name: string;
  portionLabel?: string;
  portionGrams?: number;
}

export interface CustomFood extends FoodItem {
  id?: number;
}

export interface FoodEntry extends Nutrients {
  id?: number;
  date: string;
  meal: MealType;
  name: string;
  /** Quantidade em gramas; 0 quando as calorias foram informadas diretamente. */
  grams: number;
  createdAt: number;
}

export interface WaterEntry {
  id?: number;
  date: string;
  ml: number;
  createdAt: number;
}

export type MeasurementType =
  | 'peso'
  | 'pressao'
  | 'glicemia'
  | 'frequencia'
  | 'temperatura'
  | 'saturacao'
  | 'cintura'
  | 'gordura';

export type GlucoseContext = 'jejum' | 'pos_refeicao' | 'aleatoria';

export interface Measurement {
  id?: number;
  type: MeasurementType;
  datetime: string;
  /** Valor principal (ex.: peso, sistólica, glicemia). */
  value: number;
  /** Valor secundário (diastólica na pressão). */
  value2?: number;
  context?: GlucoseContext;
  note?: string;
}

export type AppointmentKind = 'consulta' | 'retorno' | 'exame' | 'procedimento' | 'terapia' | 'vacina' | 'outro';
export type AppointmentStatus = 'agendada' | 'realizada' | 'cancelada';

export interface Appointment {
  id?: number;
  kind: AppointmentKind;
  specialty: string;
  professional?: string;
  datetime: string;
  durationMin: number;
  location?: string;
  phone?: string;
  reason?: string;
  notes?: string;
  status: AppointmentStatus;
  /** Lembretes em minutos antes do horário. */
  reminders: number[];
  /** Alerta na manhã do dia da consulta (horário do perfil). */
  morningAlert: boolean;
  /** Resumo / orientações após a consulta. */
  summary?: string;
}

export interface EyeRx {
  sph?: number;
  cyl?: number;
  axis?: number;
  add?: number;
  acuity?: string;
}

export interface VisionRecord {
  id?: number;
  date: string;
  kind: 'oculos' | 'lentes';
  professional?: string;
  od: EyeRx;
  oe: EyeRx;
  dnp?: string;
  iopOD?: number;
  iopOE?: number;
  notes?: string;
}

export interface Medication {
  id?: number;
  name: string;
  dosage: string;
  times: string[];
  startDate: string;
  endDate?: string;
  instructions?: string;
  prescriber?: string;
  active: boolean;
  remind: boolean;
}

export interface MedicationLog {
  id?: number;
  medicationId: number;
  date: string;
  time: string;
  takenAt: number;
}

export interface Exam {
  id?: number;
  date: string;
  name: string;
  category: string;
  lab?: string;
  requestedBy?: string;
  result?: string;
  notes?: string;
}

export interface Vaccine {
  id?: number;
  name: string;
  dose: string;
  date: string;
  nextDate?: string;
  lot?: string;
  place?: string;
  notes?: string;
}

export interface Activity {
  id?: number;
  date: string;
  type: string;
  durationMin: number;
  kcal?: number;
  distanceKm?: number;
  notes?: string;
}

export interface SleepEntry {
  id?: number;
  date: string;
  bedtime?: string;
  wakeTime?: string;
  hours: number;
  quality: number;
  notes?: string;
}

export interface Symptom {
  id?: number;
  datetime: string;
  name: string;
  intensity: number;
  notes?: string;
}

export interface NotificationLogEntry {
  key: string;
  firedAt: number;
}
