import { useLiveQuery } from 'dexie-react-hooks';
import { db, latestMeasurement, withProfileDefaults } from '../db/db';
import type { Profile } from '../db/types';

export function useProfile(): Profile {
  const profile = useLiveQuery(() => db.profile.get('me'));
  return withProfileDefaults(profile);
}

export function useLatestWeight(): number | undefined {
  return useLiveQuery(() => latestMeasurement(db, 'peso'))?.value;
}
