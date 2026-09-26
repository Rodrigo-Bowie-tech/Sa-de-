import Dexie, { type EntityTable } from 'dexie';
import type {
  Activity,
  Appointment,
  CustomFood,
  Exam,
  FoodEntry,
  Measurement,
  Medication,
  MedicationLog,
  NotificationLogEntry,
  Profile,
  SleepEntry,
  Symptom,
  Vaccine,
  VisionRecord,
  WaterEntry,
} from './types';

export class HealthDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  foodEntries!: EntityTable<FoodEntry, 'id'>;
  customFoods!: EntityTable<CustomFood, 'id'>;
  water!: EntityTable<WaterEntry, 'id'>;
  measurements!: EntityTable<Measurement, 'id'>;
  appointments!: EntityTable<Appointment, 'id'>;
  vision!: EntityTable<VisionRecord, 'id'>;
  medications!: EntityTable<Medication, 'id'>;
  medicationLogs!: EntityTable<MedicationLog, 'id'>;
  exams!: EntityTable<Exam, 'id'>;
  vaccines!: EntityTable<Vaccine, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  sleep!: EntityTable<SleepEntry, 'id'>;
  symptoms!: EntityTable<Symptom, 'id'>;
  notificationLog!: EntityTable<NotificationLogEntry, 'key'>;

  constructor(name = 'minha-saude') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      foodEntries: '++id, date',
      customFoods: '++id, name',
      water: '++id, date',
      measurements: '++id, type, datetime, [type+datetime]',
      appointments: '++id, datetime, status',
      vision: '++id, date',
      medications: '++id',
      medicationLogs: '++id, date, [medicationId+date]',
      exams: '++id, date',
      vaccines: '++id, date, nextDate',
      activities: '++id, date',
      sleep: '++id, date',
      symptoms: '++id, datetime',
      notificationLog: 'key, firedAt',
    });
  }
}

export const db = new HealthDB();

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  name: '',
  activityLevel: 'leve',
  weightGoal: 'manter',
  waterGoalMl: 2000,
  morningAlertTime: '07:00',
};

export function withProfileDefaults(profile: Profile | undefined): Profile {
  return { ...DEFAULT_PROFILE, ...profile };
}

export async function saveProfile(changes: Partial<Profile>): Promise<void> {
  const current = withProfileDefaults(await db.profile.get('me'));
  await db.profile.put({ ...current, ...changes, id: 'me' });
}

/** Última medição de um tipo (a mais recente por data/hora). */
export function latestMeasurement(db: HealthDB, type: Measurement['type']) {
  return db.measurements
    .where('[type+datetime]')
    .between([type, Dexie.minKey], [type, Dexie.maxKey])
    .last();
}
