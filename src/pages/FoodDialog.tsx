import { useMemo, useState, type ChangeEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Globe, Plus, Search, Zap } from 'lucide-react';
import { db } from '../db/db';
import type { FoodEntry, FoodItem, MealType, Nutrients } from '../db/types';
import { FOODS } from '../data/foods';
import { Modal } from '../components/Modal';
import { addDaysKey } from '../lib/dates';
import { fmt, normalize, parseNumber } from '../lib/format';
import { MEALS, nutrientsFor, per100FromEntry } from '../lib/nutrition';
import { lookupBarcode, searchOpenFoodFacts, type OnlineFood } from '../lib/openfoodfacts';

type Source = 'base' | 'meu' | 'recente' | 'online';

interface Candidate extends FoodItem {
  source: Source;
  brand?: string;
}

type Mode = 'search' | 'amount' | 'quick' | 'custom' | 'online';

interface FoodDialogProps {
  open: boolean;
  onClose: () => void;
  date: string;
  meal: MealType;
  /** Lançamento sendo editado. */
  entry?: FoodEntry;
}

const SOURCE_LABELS: Record<Source, string> = { base: '', meu: 'meu', recente: 'recente', online: 'online' };

function matches(name: string, words: string[]): boolean {
  const n = normalize(name);
  return words.every((w) => n.includes(w));
}

function NutrientLine({ n, suffix = '' }: { n: Nutrients; suffix?: string }) {
  return (
    <span className="meta">
      {fmt(n.kcal)} kcal{suffix} · P {fmt(n.protein, 1)} g · C {fmt(n.carbs, 1)} g · G {fmt(n.fat, 1)} g
    </span>
  );
}

export function FoodDialog(props: FoodDialogProps) {
  // Remonta o conteúdo a cada abertura para começar do zero.
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.entry ? 'Editar alimento' : 'Adicionar alimento'}>
      {props.open && <FoodDialogBody {...props} />}
    </Modal>
  );
}

function initialState(entry?: FoodEntry) {
  if (!entry) return { mode: 'search' as Mode, selected: undefined, amount: '' };
  const per100 = per100FromEntry(entry);
  if (per100) return { mode: 'amount' as Mode, selected: { ...per100, source: 'recente' as Source }, amount: String(entry.grams) };
  return { mode: 'quick' as Mode, selected: undefined, amount: '' };
}

function FoodDialogBody({ onClose, date, meal: initialMeal, entry }: FoodDialogProps) {
  const init = initialState(entry);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Candidate | undefined>(init.selected);
  const [unit, setUnit] = useState<'g' | 'porcao'>('g');
  const [amount, setAmount] = useState(init.amount);
  const [meal, setMeal] = useState<MealType>(entry?.meal ?? initialMeal);
  const [saveOnline, setSaveOnline] = useState(true);
  const [error, setError] = useState<string>();
  const [quick, setQuick] = useState({
    name: entry && !entry.grams ? entry.name : '',
    kcal: entry && !entry.grams ? String(entry.kcal) : '',
    protein: entry && !entry.grams ? String(entry.protein || '') : '',
    carbs: entry && !entry.grams ? String(entry.carbs || '') : '',
    fat: entry && !entry.grams ? String(entry.fat || '') : '',
  });
  const [custom, setCustom] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', portionLabel: '', portionGrams: '' });
  const [online, setOnline] = useState<{ query: string; code: string; loading: boolean; results?: OnlineFood[]; error?: string }>({
    query: '',
    code: '',
    loading: false,
  });

  const customFoods = useLiveQuery(() => db.customFoods.toArray());
  const recentEntries = useLiveQuery(() => db.foodEntries.where('date').aboveOrEqual(addDaysKey(date, -60)).toArray(), [date]);

  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const e of [...(recentEntries ?? [])].sort((a, b) => b.createdAt - a.createdAt)) {
      const per100 = per100FromEntry(e);
      const key = normalize(e.name);
      if (!per100 || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...per100, source: 'recente' });
    }
    return out;
  }, [recentEntries]);

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const mine: Candidate[] = (customFoods ?? []).map((f) => ({ ...f, source: 'meu' }));
    if (words.length === 0) return [...mine, ...recents.slice(0, 12)];
    const base: Candidate[] = FOODS.map((f) => ({ ...f, source: 'base' }));
    const seen = new Set<string>();
    return [...mine, ...recents, ...base]
      .filter((c) => matches(c.name, words))
      .filter((c) => {
        const key = normalize(c.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 40);
  }, [query, customFoods, recents]);

  const choose = (c: Candidate) => {
    setSelected(c);
    setError(undefined);
    if (c.portionGrams) {
      setUnit('porcao');
      setAmount('1');
    } else {
      setUnit('g');
      setAmount('100');
    }
    setMode('amount');
  };

  const grams = (() => {
    const n = parseNumber(amount);
    if (n == null || !selected) return undefined;
    return unit === 'porcao' && selected.portionGrams ? n * selected.portionGrams : n;
  })();
  const computed = selected && grams != null ? nutrientsFor(selected, grams) : undefined;

  const persist = async (data: Omit<FoodEntry, 'id' | 'createdAt' | 'date' | 'meal'>) => {
    const record: FoodEntry = { ...data, date, meal, createdAt: entry?.createdAt ?? Date.now() };
    if (entry?.id != null) record.id = entry.id;
    await db.foodEntries.put(record);
    onClose();
  };

  const saveAmount = async () => {
    if (!selected || grams == null || grams <= 0 || !computed) return setError('Informe a quantidade.');
    if (selected.source === 'online' && saveOnline) {
      const exists = (customFoods ?? []).some((f) => normalize(f.name) === normalize(selected.name));
      if (!exists) {
        const { name, kcal, protein, carbs, fat, portionLabel, portionGrams } = selected;
        await db.customFoods.add({ name, kcal, protein, carbs, fat, portionLabel, portionGrams });
      }
    }
    await persist({ name: selected.name, grams: Math.round(grams * 10) / 10, ...computed });
  };

  const saveQuick = async () => {
    const kcal = parseNumber(quick.kcal);
    if (!quick.name.trim()) return setError('Informe o nome.');
    if (kcal == null || kcal < 0) return setError('Informe as calorias.');
    await persist({
      name: quick.name.trim(),
      grams: 0,
      kcal: Math.round(kcal),
      protein: parseNumber(quick.protein) ?? 0,
      carbs: parseNumber(quick.carbs) ?? 0,
      fat: parseNumber(quick.fat) ?? 0,
    });
  };

  const saveCustom = async () => {
    const kcal = parseNumber(custom.kcal);
    if (!custom.name.trim()) return setError('Informe o nome do alimento.');
    if (kcal == null) return setError('Informe as calorias por 100 g.');
    const food: FoodItem = {
      name: custom.name.trim(),
      kcal,
      protein: parseNumber(custom.protein) ?? 0,
      carbs: parseNumber(custom.carbs) ?? 0,
      fat: parseNumber(custom.fat) ?? 0,
      portionLabel: custom.portionLabel.trim() || undefined,
      portionGrams: parseNumber(custom.portionGrams),
    };
    await db.customFoods.add(food);
    choose({ ...food, source: 'meu' });
  };

  const runOnline = async (kind: 'texto' | 'codigo') => {
    setOnline((o) => ({ ...o, loading: true, error: undefined, results: undefined }));
    try {
      if (kind === 'codigo') {
        const food = await lookupBarcode(online.code);
        if (!food) throw new Error('Produto não encontrado para este código.');
        setOnline((o) => ({ ...o, loading: false }));
        choose({ ...food, source: 'online' });
        return;
      }
      const found = await searchOpenFoodFacts(online.query.trim());
      setOnline((o) => ({
        ...o,
        loading: false,
        results: found,
        error: found.length ? undefined : 'Nenhum produto encontrado. Tente outro nome.',
      }));
    } catch (e) {
      // fetch() rejeita com TypeError quando não há conexão ou o servidor não responde.
      const network = e instanceof TypeError || !navigator.onLine;
      setOnline((o) => ({
        ...o,
        loading: false,
        error: network
          ? 'Não foi possível acessar a base de alimentos. Verifique sua conexão com a internet.'
          : e instanceof Error
            ? e.message
            : 'Falha na busca.',
      }));
    }
  };

  const mealSelect = (
    <label className="field">
      <span>Refeição</span>
      <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
        {MEALS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );

  const back = !entry && mode !== 'search' && (
    <button type="button" className="btn ghost small" onClick={() => (setMode('search'), setError(undefined))}>
      <ChevronLeft size={16} /> Voltar à busca
    </button>
  );

  if (mode === 'amount' && selected) {
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          saveAmount();
        }}
      >
        {back}
        <div>
          <h3>{selected.name}</h3>
          {selected.brand && <span className="meta muted">{selected.brand} · </span>}
          <NutrientLine n={selected} suffix=" por 100 g" />
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Quantidade</span>
            <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="field">
            <span>Medida</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'g' | 'porcao')}>
              <option value="g">gramas (g/ml)</option>
              {selected.portionGrams && (
                <option value="porcao">
                  {selected.portionLabel ?? 'porção'} ({fmt(selected.portionGrams, 1)} g)
                </option>
              )}
            </select>
          </label>
          {mealSelect}
        </div>
        {computed && (
          <div className="alert">
            <Zap className="alert-icon" size={20} aria-hidden />
            <div className="alert-body">
              <strong>
                {fmt(computed.kcal)} kcal{grams != null ? ` em ${fmt(grams, 1)} g` : ''}
              </strong>
              <span>
                Proteína {fmt(computed.protein, 1)} g · Carboidratos {fmt(computed.carbs, 1)} g · Gorduras{' '}
                {fmt(computed.fat, 1)} g
              </span>
            </div>
          </div>
        )}
        {selected.source === 'online' && (
          <label className="check">
            <input type="checkbox" checked={saveOnline} onChange={(e) => setSaveOnline(e.target.checked)} />
            Salvar em “Meus alimentos”
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block">
          {entry ? 'Salvar alterações' : 'Adicionar'}
        </button>
        {entry && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              await db.foodEntries.delete(entry.id!);
              onClose();
            }}
          >
            Remover do diário
          </button>
        )}
      </form>
    );
  }

  if (mode === 'quick') {
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          saveQuick();
        }}
      >
        {back}
        <p className="muted small">Use quando já souber as calorias (ex.: rótulo da embalagem, cardápio).</p>
        <div className="form-grid">
          <label className="field wide">
            <span>Nome *</span>
            <input autoFocus value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Calorias *</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={quick.kcal} onChange={(e) => setQuick({ ...quick, kcal: e.target.value })} />
              <em>kcal</em>
            </div>
          </label>
          {mealSelect}
          <label className="field">
            <span>Proteína</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={quick.protein} onChange={(e) => setQuick({ ...quick, protein: e.target.value })} />
              <em>g</em>
            </div>
          </label>
          <label className="field">
            <span>Carboidratos</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={quick.carbs} onChange={(e) => setQuick({ ...quick, carbs: e.target.value })} />
              <em>g</em>
            </div>
          </label>
          <label className="field">
            <span>Gorduras</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={quick.fat} onChange={(e) => setQuick({ ...quick, fat: e.target.value })} />
              <em>g</em>
            </div>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block">
          {entry ? 'Salvar alterações' : 'Adicionar'}
        </button>
        {entry && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              await db.foodEntries.delete(entry.id!);
              onClose();
            }}
          >
            Remover do diário
          </button>
        )}
      </form>
    );
  }

  if (mode === 'custom') {
    const set = (k: keyof typeof custom) => (e: ChangeEvent<HTMLInputElement>) => setCustom({ ...custom, [k]: e.target.value });
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          saveCustom();
        }}
      >
        {back}
        <p className="muted small">Informe os valores por 100 g (ou 100 ml), como na tabela nutricional.</p>
        <div className="form-grid">
          <label className="field wide">
            <span>Nome *</span>
            <input autoFocus value={custom.name} onChange={set('name')} />
          </label>
          <label className="field">
            <span>Calorias por 100 g *</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={custom.kcal} onChange={set('kcal')} />
              <em>kcal</em>
            </div>
          </label>
          <label className="field">
            <span>Proteína</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={custom.protein} onChange={set('protein')} />
              <em>g</em>
            </div>
          </label>
          <label className="field">
            <span>Carboidratos</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={custom.carbs} onChange={set('carbs')} />
              <em>g</em>
            </div>
          </label>
          <label className="field">
            <span>Gorduras</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={custom.fat} onChange={set('fat')} />
              <em>g</em>
            </div>
          </label>
          <label className="field">
            <span>Nome da porção</span>
            <input placeholder="ex.: fatia, unidade" value={custom.portionLabel} onChange={set('portionLabel')} />
          </label>
          <label className="field">
            <span>Peso da porção</span>
            <div className="input-suffix">
              <input inputMode="decimal" value={custom.portionGrams} onChange={set('portionGrams')} />
              <em>g</em>
            </div>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block">
          Salvar e continuar
        </button>
      </form>
    );
  }

  if (mode === 'online') {
    return (
      <div className="form">
        {back}
        <p className="muted small">
          Busca produtos industrializados na base aberta Open Food Facts. Confira os valores com o rótulo.
        </p>
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (online.query.trim()) runOnline('texto');
          }}
        >
          <input
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Nome do produto ou marca"
            autoFocus
            value={online.query}
            onChange={(e) => setOnline({ ...online, query: e.target.value })}
          />
          <button type="submit" className="btn" disabled={online.loading || !online.query.trim()}>
            <Search size={18} /> Buscar
          </button>
        </form>
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (online.code.trim()) runOnline('codigo');
          }}
        >
          <input
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            inputMode="numeric"
            placeholder="Código de barras (EAN)"
            value={online.code}
            onChange={(e) => setOnline({ ...online, code: e.target.value })}
          />
          <button type="submit" className="btn secondary" disabled={online.loading || !online.code.trim()}>
            Consultar
          </button>
        </form>
        {online.loading && <p className="muted">Buscando…</p>}
        {online.error && <p className="error">{online.error}</p>}
        {online.results && online.results.length > 0 && (
          <div className="results">
            {online.results.map((f, i) => (
              <button key={`${f.code}-${i}`} type="button" className="food-result" onClick={() => choose({ ...f, source: 'online' })}>
                <div className="main">
                  <div className="title">{f.name}</div>
                  <div className="meta">
                    {f.brand ? `${f.brand} · ` : ''}
                    {fmt(f.kcal)} kcal / 100 g
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="form">
      <div className="btn-row">
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          type="search"
          placeholder="Buscar alimento (ex.: arroz, banana)"
          autoFocus
          aria-label="Buscar alimento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="btn-row">
        <button type="button" className="btn secondary small" onClick={() => (setMode('quick'), setError(undefined))}>
          <Zap size={16} /> Só as calorias
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setCustom({ ...custom, name: query });
            setError(undefined);
            setMode('custom');
          }}
        >
          <Plus size={16} /> Cadastrar alimento
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setOnline({ ...online, query });
            setMode('online');
          }}
        >
          <Globe size={16} /> Buscar online
        </button>
      </div>
      {!query && results.length > 0 && <span className="section-title">Meus alimentos e recentes</span>}
      <div className="results">
        {results.map((c, i) => (
          <button key={`${c.source}-${c.name}-${i}`} type="button" className="food-result" onClick={() => choose(c)}>
            <div className="main">
              <div className="title">{c.name}</div>
              <div className="meta">
                {fmt(c.kcal)} kcal / 100 g
                {c.portionGrams ? ` · ${c.portionLabel} ≈ ${fmt((c.kcal * c.portionGrams) / 100)} kcal` : ''}
              </div>
            </div>
            {SOURCE_LABELS[c.source] && <span className="tag">{SOURCE_LABELS[c.source]}</span>}
          </button>
        ))}
        {query && results.length === 0 && (
          <p className="muted" style={{ padding: 8 }}>
            Nada encontrado. Tente “Buscar online” ou cadastre o alimento.
          </p>
        )}
        {!query && results.length === 0 && (
          <p className="muted" style={{ padding: 8 }}>
            Digite para buscar entre {FOODS.length} alimentos comuns (valores da tabela TACO).
          </p>
        )}
      </div>
    </div>
  );
}
