import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Glasses, Plus } from 'lucide-react';
import { db } from '../db/db';
import type { EyeRx, VisionRecord } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { LineChart } from '../components/charts';
import { addDays, formatDate, parseDateKey, todayKey, toDateKey } from '../lib/dates';
import { fmt, fmtDiopter, parseNumber } from '../lib/format';
import { visionDiagnoses } from '../lib/health';

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

// "—" fica entre os positivos e o zero, para o seletor abrir perto do 0.
const SPH_POSITIVE = range(15, 0.25, -0.25);
const SPH_NEGATIVE = range(0, -25, -0.25);
const CYL_POSITIVE = range(6, 0.25, -0.25);
const CYL_NEGATIVE = range(-0.25, -10, -0.25);
const ADD_VALUES = range(0.75, 4, 0.25);

interface EyeForm {
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  acuity: string;
}

interface VisionForm {
  id?: number;
  date: string;
  kind: VisionRecord['kind'];
  professional: string;
  od: EyeForm;
  oe: EyeForm;
  dnp: string;
  iopOD: string;
  iopOE: string;
  notes: string;
}

const emptyEye: EyeForm = { sph: '', cyl: '', axis: '', add: '', acuity: '' };

function eyeToForm(e: EyeRx): EyeForm {
  return {
    sph: e.sph != null ? String(e.sph) : '',
    cyl: e.cyl != null ? String(e.cyl) : '',
    axis: e.axis != null ? String(e.axis) : '',
    add: e.add != null ? String(e.add) : '',
    acuity: e.acuity ?? '',
  };
}

function formToEye(f: EyeForm): EyeRx {
  return {
    sph: f.sph === '' ? undefined : Number(f.sph),
    cyl: f.cyl === '' ? undefined : Number(f.cyl),
    axis: parseNumber(f.axis),
    add: f.add === '' ? undefined : Number(f.add),
    acuity: f.acuity.trim() || undefined,
  };
}

function DiopterSelect({
  value,
  onChange,
  positive,
  negative,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  positive: number[];
  negative: number[];
  label: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {positive.map((v) => (
        <option key={v} value={String(v)}>
          {fmtDiopter(v)}
        </option>
      ))}
      <option value="">—</option>
      {negative.map((v) => (
        <option key={v} value={String(v)}>
          {v === 0 ? '0,00 (plano)' : fmtDiopter(v)}
        </option>
      ))}
    </select>
  );
}

function RxTable({ record }: { record: VisionRecord }) {
  const row = (label: string, e: EyeRx) => (
    <tr>
      <td>{label}</td>
      <td>{fmtDiopter(e.sph)}</td>
      <td>{fmtDiopter(e.cyl)}</td>
      <td>{e.axis != null ? `${e.axis}°` : '—'}</td>
      <td>{fmtDiopter(e.add)}</td>
      <td>{e.acuity ?? '—'}</td>
    </tr>
  );
  return (
    <table className="rx-table">
      <thead>
        <tr>
          <th scope="col">Olho</th>
          <th scope="col" title="Esférico">Esf.</th>
          <th scope="col" title="Cilíndrico">Cil.</th>
          <th scope="col">Eixo</th>
          <th scope="col" title="Adição">Ad.</th>
          <th scope="col" title="Acuidade visual">AV</th>
        </tr>
      </thead>
      <tbody>
        {row('OD', record.od)}
        {row('OE', record.oe)}
      </tbody>
    </table>
  );
}

function progressionText(prev: VisionRecord, last: VisionRecord): string[] {
  const out: string[] = [];
  for (const [label, a, b] of [
    ['olho direito', prev.od.sph, last.od.sph],
    ['olho esquerdo', prev.oe.sph, last.oe.sph],
  ] as const) {
    if (a == null || b == null || a === b) continue;
    const delta = b - a;
    const abs = fmt(Math.abs(delta), 2);
    if (b < 0 && delta < 0) out.push(`Miopia aumentou ${abs} no ${label}`);
    else if (a < 0 && delta > 0) out.push(`Miopia diminuiu ${abs} no ${label}`);
    else out.push(`Grau esférico mudou ${delta > 0 ? '+' : '-'}${abs} no ${label}`);
  }
  return out;
}

export function VisionPage() {
  const records = useLiveQuery(() => db.vision.orderBy('date').toArray());
  const [form, setForm] = useState<VisionForm | null>(null);
  const [error, setError] = useState<string>();

  const latest = records?.[records.length - 1];
  const previous = records && records.length > 1 ? records[records.length - 2] : undefined;
  const nextExam = latest ? toDateKey(addDays(parseDateKey(latest.date), 365)) : undefined;
  const examOverdue = nextExam ? nextExam <= todayKey() : false;

  const openForm = (r?: VisionRecord) => {
    setError(undefined);
    setForm(
      r
        ? {
            id: r.id,
            date: r.date,
            kind: r.kind,
            professional: r.professional ?? '',
            od: eyeToForm(r.od),
            oe: eyeToForm(r.oe),
            dnp: r.dnp ?? '',
            iopOD: r.iopOD != null ? String(r.iopOD) : '',
            iopOE: r.iopOE != null ? String(r.iopOE) : '',
            notes: r.notes ?? '',
          }
        : {
            date: todayKey(),
            kind: 'oculos',
            professional: latest?.professional ?? '',
            od: { ...emptyEye },
            oe: { ...emptyEye },
            dnp: latest?.dnp ?? '',
            iopOD: '',
            iopOE: '',
            notes: '',
          },
    );
  };

  const save = async () => {
    if (!form) return;
    if (!form.date) return setError('Informe a data do exame.');
    const axisInvalid = [form.od.axis, form.oe.axis].some((a) => {
      if (a.trim() === '') return false;
      const n = parseNumber(a);
      return n == null || n < 0 || n > 180;
    });
    if (axisInvalid) return setError('O eixo deve ser um número entre 0 e 180.');
    const record: VisionRecord = {
      date: form.date,
      kind: form.kind,
      professional: form.professional.trim() || undefined,
      od: formToEye(form.od),
      oe: formToEye(form.oe),
      dnp: form.dnp.trim() || undefined,
      iopOD: parseNumber(form.iopOD),
      iopOE: parseNumber(form.iopOE),
      notes: form.notes.trim() || undefined,
    };
    if (form.id != null) record.id = form.id;
    await db.vision.put(record);
    setForm(null);
  };

  const remove = async () => {
    if (form?.id == null || !confirm('Excluir este exame de vista?')) return;
    await db.vision.delete(form.id);
    setForm(null);
  };

  const setEye = (eye: 'od' | 'oe', field: keyof EyeForm, value: string) =>
    form && setForm({ ...form, [eye]: { ...form[eye], [field]: value } });

  const chartData = (records ?? [])
    .filter((r) => r.od.sph != null || r.oe.sph != null)
    .map((r) => ({ x: parseDateKey(r.date).getTime(), values: [r.od.sph, r.oe.sph] }));

  return (
    <>
      <PageHeader
        title="Visão"
        subtitle="Grau dos óculos e lentes, miopia e evolução"
        back="/saude"
        actions={
          <button type="button" className="btn" onClick={() => openForm()}>
            <Plus size={18} /> Nova receita
          </button>
        }
      />

      {latest && (
        <section className="card">
          <div className="card-header">
            <h2>Grau atual</h2>
            <span className="muted small">Receita de {formatDate(latest.date)}</span>
          </div>
          <RxTable record={latest} />
          <ul className="list">
            {visionDiagnoses(latest).map((d) => (
              <li key={d} className="list-item static">
                {d}
              </li>
            ))}
          </ul>
          {previous &&
            progressionText(previous, latest).map((t) => (
              <p key={t} className="muted small">
                {t} desde {formatDate(previous.date)}.
              </p>
            ))}
          <div className="btn-row">
            <StatusBadge
              value={
                examOverdue
                  ? { label: 'Exame de vista anual vencido', level: 'warning' }
                  : { label: `Próximo exame recomendado: ${formatDate(nextExam!)}`, level: 'info' }
              }
            />
            <Link className="btn secondary small" to="/agenda?nova=consulta&especialidade=Oftalmologia">
              <CalendarPlus size={16} /> Agendar oftalmologista
            </Link>
          </div>
        </section>
      )}

      {chartData.length > 1 && (
        <section className="card">
          <h2>Evolução do grau (esférico)</h2>
          <LineChart
            ariaLabel="Evolução do grau esférico do olho direito e esquerdo"
            series={[
              { name: 'Olho direito (OD)', color: 'var(--series-1)' },
              { name: 'Olho esquerdo (OE)', color: 'var(--series-2)' },
            ]}
            data={chartData}
            formatY={fmtDiopter}
            formatX={(x) => formatDate(new Date(x))}
          />
          <p className="muted small">Valores negativos indicam miopia; positivos, hipermetropia.</p>
        </section>
      )}

      <section className="card">
        <h2>Histórico de receitas</h2>
        {records === undefined ? null : records.length === 0 ? (
          <EmptyState icon={Glasses}>
            <p>Cadastre sua receita de óculos ou lentes para acompanhar o grau da miopia, astigmatismo e outros.</p>
            <button type="button" className="btn secondary" onClick={() => openForm()}>
              <Plus size={18} /> Cadastrar receita
            </button>
          </EmptyState>
        ) : (
          <ul className="list">
            {[...records].reverse().map((r) => (
              <li key={r.id}>
                <button type="button" className="list-item" onClick={() => openForm(r)} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className="main">
                    <span className="title">
                      {formatDate(r.date)} · {r.kind === 'oculos' ? 'Óculos' : 'Lentes de contato'}
                    </span>
                    {r.professional && <span className="meta">{r.professional}</span>}
                  </div>
                  <RxTable record={r} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id != null ? 'Editar receita' : 'Nova receita de óculos/lentes'}
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
                <span>Data do exame *</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as VisionRecord['kind'] })}>
                  <option value="oculos">Óculos</option>
                  <option value="lentes">Lentes de contato</option>
                </select>
              </label>
              <label className="field wide">
                <span>Oftalmologista / clínica</span>
                <input value={form.professional} onChange={(e) => setForm({ ...form, professional: e.target.value })} />
              </label>
            </div>

            <fieldset>
              <legend>Grau (copie da receita)</legend>
              <div className="rx-form">
                <span />
                <span className="head">Esférico</span>
                <span className="head">Cilíndrico</span>
                <span className="head">Eixo</span>
                <span className="head">Adição</span>
                {(['od', 'oe'] as const).map((eye) => (
                  <div key={eye} style={{ display: 'contents' }}>
                    <span className="eye">{eye.toUpperCase()}</span>
                    <DiopterSelect
                      label={`Esférico ${eye.toUpperCase()}`}
                      value={form[eye].sph}
                      onChange={(v) => setEye(eye, 'sph', v)}
                      positive={SPH_POSITIVE}
                      negative={SPH_NEGATIVE}
                    />
                    <DiopterSelect
                      label={`Cilíndrico ${eye.toUpperCase()}`}
                      value={form[eye].cyl}
                      onChange={(v) => setEye(eye, 'cyl', v)}
                      positive={CYL_POSITIVE}
                      negative={CYL_NEGATIVE}
                    />
                    <input
                      aria-label={`Eixo ${eye.toUpperCase()}`}
                      inputMode="numeric"
                      placeholder="0–180"
                      value={form[eye].axis}
                      onChange={(e) => setEye(eye, 'axis', e.target.value)}
                    />
                    <select aria-label={`Adição ${eye.toUpperCase()}`} value={form[eye].add} onChange={(e) => setEye(eye, 'add', e.target.value)}>
                      <option value="">—</option>
                      {ADD_VALUES.map((v) => (
                        <option key={v} value={String(v)}>
                          {fmtDiopter(v)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="hint small muted" style={{ marginTop: 8 }}>
                OD = olho direito · OE = olho esquerdo. Miopia aparece como esférico negativo (ex.: -2,50).
              </p>
            </fieldset>

            <div className="form-grid">
              <label className="field">
                <span>Acuidade visual OD</span>
                <input placeholder="ex.: 20/20" value={form.od.acuity} onChange={(e) => setEye('od', 'acuity', e.target.value)} />
              </label>
              <label className="field">
                <span>Acuidade visual OE</span>
                <input placeholder="ex.: 20/25" value={form.oe.acuity} onChange={(e) => setEye('oe', 'acuity', e.target.value)} />
              </label>
              <label className="field">
                <span>Pressão intraocular OD</span>
                <div className="input-suffix">
                  <input inputMode="decimal" value={form.iopOD} onChange={(e) => setForm({ ...form, iopOD: e.target.value })} />
                  <em>mmHg</em>
                </div>
              </label>
              <label className="field">
                <span>Pressão intraocular OE</span>
                <div className="input-suffix">
                  <input inputMode="decimal" value={form.iopOE} onChange={(e) => setForm({ ...form, iopOE: e.target.value })} />
                  <em>mmHg</em>
                </div>
              </label>
              <label className="field">
                <span>DNP (distância pupilar)</span>
                <input placeholder="ex.: 31/32 mm" value={form.dnp} onChange={(e) => setForm({ ...form, dnp: e.target.value })} />
              </label>
              <label className="field wide">
                <span>Observações</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
