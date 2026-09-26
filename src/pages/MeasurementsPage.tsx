import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { Plus, Scale } from 'lucide-react';
import { db } from '../db/db';
import type { GlucoseContext, Measurement, MeasurementType } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { LineChart } from '../components/charts';
import { useProfile } from '../hooks/useProfile';
import { formatDateTime, formatShortDate, parseDateTime, toDateTimeKey } from '../lib/dates';
import { fmt, parseNumber } from '../lib/format';
import { bmi, bmiCategory, classifyMeasurement, MEASUREMENT_TYPES } from '../lib/health';

const TYPES = Object.keys(MEASUREMENT_TYPES) as MeasurementType[];

const GLUCOSE_CONTEXTS: Record<GlucoseContext, string> = {
  jejum: 'Em jejum',
  pos_refeicao: '2 h após refeição',
  aleatoria: 'Aleatória',
};

interface FormState {
  id?: number;
  datetime: string;
  value: string;
  value2: string;
  context: GlucoseContext;
  note: string;
}

function valueText(m: Measurement): string {
  const meta = MEASUREMENT_TYPES[m.type];
  if (m.type === 'pressao') return `${fmt(m.value)}/${fmt(m.value2)} ${meta.unit}`;
  return `${fmt(m.value, meta.digits)} ${meta.unit}`;
}

export function MeasurementsPage() {
  const [params, setParams] = useSearchParams();
  const typeParam = params.get('tipo') as MeasurementType | null;
  const type: MeasurementType = typeParam && TYPES.includes(typeParam) ? typeParam : 'peso';
  const meta = MEASUREMENT_TYPES[type];
  const profile = useProfile();

  const items = useLiveQuery(
    () =>
      db.measurements
        .where('[type+datetime]')
        .between([type, Dexie.minKey], [type, Dexie.maxKey])
        .toArray(),
    [type],
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string>();

  const latest = items?.[items.length - 1];
  const classification = latest
    ? classifyMeasurement(latest.type, latest.value, latest.value2, latest.context, profile.sex)
    : undefined;

  const openForm = (m?: Measurement) => {
    setError(undefined);
    setForm(
      m
        ? {
            id: m.id,
            datetime: m.datetime,
            value: String(m.value).replace('.', ','),
            value2: m.value2 != null ? String(m.value2) : '',
            context: m.context ?? 'jejum',
            note: m.note ?? '',
          }
        : { datetime: toDateTimeKey(new Date()), value: '', value2: '', context: 'jejum', note: '' },
    );
  };

  const save = async () => {
    if (!form) return;
    const value = parseNumber(form.value);
    const value2 = parseNumber(form.value2);
    if (value == null) return setError(`Informe ${type === 'pressao' ? 'a pressão sistólica' : 'o valor'}.`);
    if (type === 'pressao' && value2 == null) return setError('Informe a pressão diastólica.');
    if (!form.datetime) return setError('Informe a data e a hora.');
    const record: Measurement = {
      type,
      datetime: form.datetime,
      value,
      value2: type === 'pressao' ? value2 : undefined,
      context: type === 'glicemia' ? form.context : undefined,
      note: form.note.trim() || undefined,
    };
    if (form.id != null) record.id = form.id;
    await db.measurements.put(record);
    setForm(null);
  };

  const remove = async () => {
    if (form?.id == null || !confirm('Excluir esta medida?')) return;
    await db.measurements.delete(form.id);
    setForm(null);
  };

  const chartSeries =
    type === 'pressao'
      ? [
          { name: 'Sistólica', color: 'var(--series-1)' },
          { name: 'Diastólica', color: 'var(--series-2)' },
        ]
      : [{ name: meta.label, color: 'var(--series-1)' }];
  const chartData = (items ?? []).slice(-60).map((m) => ({
    x: parseDateTime(m.datetime).getTime(),
    values: type === 'pressao' ? [m.value, m.value2] : [m.value],
  }));

  const currentBmi = type === 'peso' && latest && profile.heightCm ? bmi(latest.value, profile.heightCm) : undefined;
  const first = items?.[0];
  const change = type === 'peso' && latest && first && latest !== first ? latest.value - first.value : undefined;

  return (
    <>
      <PageHeader
        title="Medidas"
        subtitle="Acompanhe seus sinais e sua evolução"
        back="/saude"
        actions={
          <button type="button" className="btn" onClick={() => openForm()}>
            <Plus size={18} /> Registrar
          </button>
        }
      />
      <div className="chips" role="group" aria-label="Tipo de medida">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            aria-pressed={t === type}
            onClick={() => setParams({ tipo: t }, { replace: true })}
          >
            {MEASUREMENT_TYPES[t].label}
          </button>
        ))}
      </div>

      {latest ? (
        <section className="card">
          <div className="card-header">
            <h2>{meta.label}</h2>
            <span className="muted small">{formatDateTime(latest.datetime)}</span>
          </div>
          <div className="hero">
            <span className="hero-value">
              {type === 'pressao' ? `${fmt(latest.value)}/${fmt(latest.value2)}` : fmt(latest.value, meta.digits)}
            </span>
            <span className="hero-unit">{meta.unit}</span>
          </div>
          <div className="btn-row">
            {classification && <StatusBadge value={classification} />}
            {currentBmi && <StatusBadge value={{ ...bmiCategory(currentBmi), label: `IMC ${fmt(currentBmi, 1)} · ${bmiCategory(currentBmi).label}` }} />}
            {change != null && (
              <span className="muted small">
                {change > 0 ? '+' : ''}
                {fmt(change, 1)} kg desde {formatShortDate(first!.datetime)}
              </span>
            )}
          </div>
          {type === 'peso' && !profile.heightCm && (
            <p className="muted small">Informe sua altura no Perfil para calcular o IMC.</p>
          )}
          {chartData.length > 1 && (
            <LineChart
              ariaLabel={`Evolução de ${meta.label.toLowerCase()}`}
              series={chartSeries}
              data={chartData}
              formatY={(v) => fmt(v, meta.digits)}
              formatX={(x) => formatShortDate(new Date(x))}
            />
          )}
          <p className="muted small">
            Faixas de referência são informativas e não substituem a avaliação de um profissional de saúde.
          </p>
        </section>
      ) : null}

      <section className="card">
        <h2>Histórico</h2>
        {items === undefined ? null : items.length === 0 ? (
          <EmptyState icon={Scale}>
            <p>Nenhuma medida de {meta.label.toLowerCase()} ainda.</p>
            <button type="button" className="btn secondary" onClick={() => openForm()}>
              <Plus size={18} /> Registrar {meta.label.toLowerCase()}
            </button>
          </EmptyState>
        ) : (
          <ul className="list">
            {[...items].reverse().map((m) => {
              const c = classifyMeasurement(m.type, m.value, m.value2, m.context, profile.sex);
              return (
                <li key={m.id}>
                  <button type="button" className="list-item" onClick={() => openForm(m)}>
                    <div className="main">
                      <span className="title">{valueText(m)}</span>
                      <span className="meta">
                        {formatDateTime(m.datetime)}
                        {m.context ? ` · ${GLUCOSE_CONTEXTS[m.context]}` : ''}
                        {m.note ? ` · ${m.note}` : ''}
                      </span>
                    </div>
                    {c && <StatusBadge value={c} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={`${form?.id != null ? 'Editar' : 'Registrar'} ${meta.label.toLowerCase()}`}
        footer={
          <>
            {form?.id != null && (
              <button type="button" className="btn danger" onClick={remove}>
                Excluir
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={save}>
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>{type === 'pressao' ? 'Sistólica (máxima)' : meta.label}</span>
                <div className="input-suffix">
                  <input
                    inputMode="decimal"
                    autoFocus
                    placeholder={meta.placeholder}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                  <em>{meta.unit}</em>
                </div>
              </label>
              {type === 'pressao' && (
                <label className="field">
                  <span>Diastólica (mínima)</span>
                  <div className="input-suffix">
                    <input
                      inputMode="decimal"
                      placeholder="ex.: 80"
                      value={form.value2}
                      onChange={(e) => setForm({ ...form, value2: e.target.value })}
                    />
                    <em>{meta.unit}</em>
                  </div>
                </label>
              )}
              {type === 'glicemia' && (
                <label className="field">
                  <span>Momento</span>
                  <select value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value as GlucoseContext })}>
                    {Object.entries(GLUCOSE_CONTEXTS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Data e hora</span>
                <input
                  type="datetime-local"
                  value={form.datetime}
                  required
                  onChange={(e) => setForm({ ...form, datetime: e.target.value })}
                />
              </label>
              <label className="field wide">
                <span>Observação</span>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
