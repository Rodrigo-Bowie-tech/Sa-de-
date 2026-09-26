import type { FoodItem } from '../db/types';

/** Busca de produtos industrializados na base aberta Open Food Facts (Brasil). */
const BASE = 'https://br.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

export interface OnlineFood extends FoodItem {
  brand?: string;
  code?: string;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

function requestError(status: number): Error {
  // A busca pública tem limite de uso e às vezes responde "ocupado".
  if (status === 429 || status === 503) return new Error('A base Open Food Facts está ocupada. Tente de novo em alguns segundos.');
  return new Error(`Falha na consulta (${status}).`);
}

export function parseOffProduct(p: OffProduct): OnlineFood | undefined {
  const n = p.nutriments ?? {};
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : undefined);
  const name = p.product_name?.trim();
  if (!name || kcal == null) return undefined;
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]?.trim();
  const serving = num(p.serving_quantity);
  return {
    name,
    brand: brand || undefined,
    code: p.code,
    kcal: Math.round(kcal),
    protein: round1(num(n['proteins_100g']) ?? 0),
    carbs: round1(num(n['carbohydrates_100g']) ?? 0),
    fat: round1(num(n['fat_100g']) ?? 0),
    portionLabel: serving ? `porção${p.serving_size ? ` (${p.serving_size})` : ''}` : undefined,
    portionGrams: serving || undefined,
  };
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<OnlineFood[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '30',
    fields: FIELDS,
  });
  const res = await fetch(`${BASE}/cgi/search.pl?${params}`, { signal });
  if (!res.ok) throw requestError(res.status);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(parseOffProduct).filter((f): f is OnlineFood => !!f);
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<OnlineFood | undefined> {
  const clean = code.replace(/\D/g, '');
  if (!clean) return undefined;
  const res = await fetch(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, { signal });
  if (res.status === 404) return undefined;
  if (!res.ok) throw requestError(res.status);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product) return undefined;
  return parseOffProduct({ ...data.product, code: clean });
}
