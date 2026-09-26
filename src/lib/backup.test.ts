import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { HealthDB } from '../db/db';
import { clearAll, exportBackup, parseBackup, restoreBackup } from './backup';
import { parseOffProduct } from './openfoodfacts';

describe('backup', () => {
  it('exporta e restaura todos os dados', async () => {
    const source = new HealthDB('origem');
    await source.profile.put({ id: 'me', name: 'Maria', activityLevel: 'leve', weightGoal: 'manter', waterGoalMl: 2000, morningAlertTime: '07:00' });
    await source.measurements.add({ type: 'peso', datetime: '2026-09-26T08:00', value: 70 });
    await source.appointments.add({
      kind: 'consulta',
      specialty: 'Clínico geral',
      datetime: '2026-10-01T10:00',
      durationMin: 60,
      status: 'agendada',
      reminders: [1440],
      morningAlert: false,
    });

    const text = JSON.stringify(await exportBackup(source));
    const target = new HealthDB('destino');
    await target.water.add({ date: '2026-01-01', ml: 300, createdAt: 0 });
    await restoreBackup(target, parseBackup(text));

    expect((await target.profile.get('me'))?.name).toBe('Maria');
    expect(await target.measurements.count()).toBe(1);
    expect(await target.appointments.count()).toBe(1);
    expect(await target.water.count()).toBe(0);

    await clearAll(target);
    expect(await target.appointments.count()).toBe(0);
  });

  it('rejeita arquivos inválidos', () => {
    expect(() => parseBackup('nada')).toThrow('JSON válido');
    expect(() => parseBackup('{"app":"outro","data":{}}')).toThrow('não é um backup');
    expect(() => parseBackup('{"app":"minha-saude","data":{"x":1}}')).toThrow('Dados inválidos');
  });
});

describe('Open Food Facts', () => {
  it('converte produto e calcula kcal a partir de kJ', () => {
    const food = parseOffProduct({
      code: '789',
      product_name: 'Iogurte Grego',
      brands: 'Marca A, Marca B',
      serving_quantity: 90,
      serving_size: '90 g',
      nutriments: { 'energy_100g': 418.4, proteins_100g: 5.12, carbohydrates_100g: 14, fat_100g: 5 },
    });
    expect(food).toMatchObject({ name: 'Iogurte Grego', brand: 'Marca A', kcal: 100, protein: 5.1, portionGrams: 90, portionLabel: 'porção (90 g)' });
    expect(parseOffProduct({ product_name: 'Sem energia', nutriments: {} })).toBeUndefined();
  });
});
