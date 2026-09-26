import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, GlassWater, Plus, Trash2, Undo2 } from 'lucide-react';
import { db } from '../db/db';
import type { FoodEntry, MealType } from '../db/types';
import { Meter } from '../components/Meter';
import { PageHeader } from '../components/PageHeader';
import { BarChart } from '../components/charts';
import { useLatestWeight, useProfile } from '../hooks/useProfile';
import { addDaysKey, formatLongDate, formatWeekday, formatDate, parseDateKey, relativeDay, todayKey } from '../lib/dates';
import { capitalize, fmt, fmtMl } from '../lib/format';
import { calorieGoal, macroTargets, MEALS, mealForTime, sumNutrients } from '../lib/nutrition';
import { FoodDialog } from './FoodDialog';

function DayNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rel = relativeDay(parseDateKey(date));
  const label = capitalize(
    rel === 'hoje' || rel === 'ontem' || rel === 'amanhã' ? `${rel}, ${formatDate(date).slice(0, 5)}` : formatLongDate(date),
  );
  return (
    <div className="day-nav card" style={{ padding: 8, flexDirection: 'row' }}>
      <button type="button" className="icon-btn" aria-label="Dia anterior" onClick={() => onChange(addDaysKey(date, -1))}>
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        className="day-label btn ghost"
        style={{ color: 'var(--ink)' }}
        onClick={() => inputRef.current?.showPicker?.()}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={date}
        aria-label="Escolher dia"
        tabIndex={-1}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      <button type="button" className="icon-btn" aria-label="Próximo dia" onClick={() => onChange(addDaysKey(date, 1))}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

export function FoodPage() {
  const [date, setDate] = useState(todayKey);
  const [dialog, setDialog] = useState<{ meal: MealType; entry?: FoodEntry } | null>(null);
  const profile = useProfile();
  const weight = useLatestWeight();
  const goal = calorieGoal(profile, weight, parseDateKey(date));

  const entries = useLiveQuery(() => db.foodEntries.where('date').equals(date).toArray(), [date]) ?? [];
  const water = useLiveQuery(() => db.water.where('date').equals(date).sortBy('createdAt'), [date]) ?? [];
  const activities = useLiveQuery(() => db.activities.where('date').equals(date).toArray(), [date]) ?? [];
  const week = useLiveQuery(
    () => db.foodEntries.where('date').between(addDaysKey(date, -6), date, true, true).toArray(),
    [date],
  );
  const customFoods = useLiveQuery(() => db.customFoods.orderBy('name').toArray()) ?? [];

  const totals = sumNutrients(entries);
  const burned = activities.reduce((s, a) => s + (a.kcal || 0), 0);
  const budget = goal != null ? goal + burned : undefined;
  const remaining = budget != null ? budget - totals.kcal : undefined;
  const targets = goal ? macroTargets(goal) : undefined;
  const waterTotal = water.reduce((s, w) => s + w.ml, 0);

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(date, i - 6);
    const kcal = (week ?? []).filter((e) => e.date === key).reduce((s, e) => s + e.kcal, 0);
    return { key, label: formatWeekday(key), title: formatLongDate(key), value: Math.round(kcal) };
  });

  const addWater = (ml: number) => db.water.add({ date, ml, createdAt: Date.now() });
  const undoWater = () => {
    const last = water[water.length - 1];
    if (last?.id != null) db.water.delete(last.id);
  };

  return (
    <>
      <PageHeader
        title="Alimentação"
        subtitle="Diário de refeições e calorias"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => setDialog({ meal: date === todayKey() ? mealForTime(new Date()) : 'almoco' })}
          >
            <Plus size={18} /> Alimento
          </button>
        }
      />
      <DayNav date={date} onChange={setDate} />

      <section className="card">
        <div className="card-header">
          <h2>Calorias</h2>
          {goal != null && <span className="muted small">Meta {fmt(goal)} kcal</span>}
        </div>
        <div className="hero">
          <span className="hero-value">{fmt(totals.kcal)}</span>
          <span className="hero-unit">kcal consumidas</span>
        </div>
        {budget != null && remaining != null ? (
          <>
            <Meter value={totals.kcal} max={budget} label="Calorias consumidas em relação à meta" />
            <p className="muted small">
              Meta {fmt(goal)} − alimentos {fmt(totals.kcal)}
              {burned ? ` + exercícios ${fmt(burned)}` : ''} ={' '}
              <strong style={{ color: 'var(--ink)' }}>
                {remaining >= 0 ? `restam ${fmt(remaining)} kcal` : `${fmt(-remaining)} kcal acima da meta`}
              </strong>
            </p>
          </>
        ) : (
          <p className="muted small">
            Para calcular sua meta diária, preencha sexo, altura e data de nascimento no <Link to="/perfil">Perfil</Link> e
            registre seu <Link to="/saude/medidas?tipo=peso">peso</Link>. Ou defina uma meta manual.
          </p>
        )}
        <div className="macro-row">
          {(
            [
              ['Proteína', totals.protein, targets?.protein],
              ['Carboidratos', totals.carbs, targets?.carbs],
              ['Gorduras', totals.fat, targets?.fat],
            ] as const
          ).map(([label, value, target]) => (
            <div key={label} className="macro">
              {label}
              <strong>{fmt(value)} g</strong>
              {target ? (
                <>
                  <Meter value={value} max={target} label={`${label}: ${fmt(value)} de ${target} gramas`} slim />
                  <small>meta {target} g</small>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Refeições</h2>
        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal === m.key).sort((a, b) => a.createdAt - b.createdAt);
          const kcal = items.reduce((s, e) => s + e.kcal, 0);
          return (
            <div key={m.key}>
              <div className="meal-head">
                <h3>{m.label}</h3>
                {kcal > 0 && <span className="kcal">{fmt(kcal)} kcal</span>}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Adicionar em ${m.label}`}
                  onClick={() => setDialog({ meal: m.key })}
                >
                  <Plus size={18} />
                </button>
              </div>
              {items.length > 0 && (
                <ul className="list">
                  {items.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="list-item" onClick={() => setDialog({ meal: m.key, entry: e })}>
                        <div className="main">
                          <span className="title">{e.name}</span>
                          <span className="meta">
                            {!e.grams && !e.protein && !e.carbs && !e.fat
                              ? 'Calorias informadas'
                              : `${e.grams ? `${fmt(e.grams, 1)} g · ` : ''}P ${fmt(e.protein, 1)} · C ${fmt(e.carbs, 1)} · G ${fmt(e.fat, 1)}`}
                          </span>
                        </div>
                        <span className="end">{fmt(e.kcal)} kcal</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>
            <GlassWater size={20} aria-hidden /> Água
          </h2>
          <span className="muted small">Meta {fmtMl(profile.waterGoalMl)}</span>
        </div>
        <div className="hero">
          <span className="hero-value">{fmtMl(waterTotal)}</span>
        </div>
        <Meter value={waterTotal} max={profile.waterGoalMl} label="Água consumida em relação à meta" />
        <div className="btn-row">
          <button type="button" className="btn secondary small" onClick={() => addWater(200)}>
            + Copo 200 ml
          </button>
          <button type="button" className="btn secondary small" onClick={() => addWater(300)}>
            + 300 ml
          </button>
          <button type="button" className="btn secondary small" onClick={() => addWater(500)}>
            + Garrafa 500 ml
          </button>
          {water.length > 0 && (
            <button type="button" className="btn ghost small" onClick={undoWater}>
              <Undo2 size={16} /> Desfazer
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Últimos 7 dias</h2>
        <BarChart
          data={weekData}
          goal={goal}
          goalLabel={goal ? `Meta ${fmt(goal)} kcal` : undefined}
          seriesName="Calorias consumidas"
          labelKey={date}
          formatValue={(v) => fmt(v)}
          ariaLabel="Calorias consumidas por dia nos últimos 7 dias"
        />
        {weekData.some((d) => d.value > 0) && (
          <p className="muted small">
            Média: {fmt(weekData.reduce((s, d) => s + d.value, 0) / Math.max(1, weekData.filter((d) => d.value > 0).length))}{' '}
            kcal/dia nos dias com registro.
          </p>
        )}
      </section>

      {customFoods.length > 0 && (
        <section className="card">
          <details>
            <summary>Meus alimentos ({customFoods.length})</summary>
            <ul className="list">
              {customFoods.map((f) => (
                <li key={f.id} className="list-item static">
                  <div className="main">
                    <span className="title">{f.name}</span>
                    <span className="meta">
                      {fmt(f.kcal)} kcal · P {fmt(f.protein, 1)} · C {fmt(f.carbs, 1)} · G {fmt(f.fat, 1)} por 100 g
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Excluir ${f.name}`}
                    onClick={() => confirm(`Excluir "${f.name}" dos seus alimentos?`) && db.customFoods.delete(f.id!)}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <FoodDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        date={date}
        meal={dialog?.meal ?? 'almoco'}
        entry={dialog?.entry}
      />
    </>
  );
}
