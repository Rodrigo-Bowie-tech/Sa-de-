import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, CalendarPlus, Check, Pill, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import type { Medication } from '../db/types';
import { EmptyState } from '../components/EmptyState';
import { Meter } from '../components/Meter';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useNow } from '../hooks/useNow';
import { addDaysKey, formatDate, timeToMinutes, toDateKey } from '../lib/dates';
import { openCalendarFile } from '../lib/download';
import { buildIcs, medicationEvents } from '../lib/ics';
import { doseStatus, toggleDose } from '../lib/doses';
import { dosesForDay } from '../lib/reminders';

interface MedForm {
  id?: number;
  name: string;
  dosage: string;
  times: string[];
  startDate: string;
  endDate: string;
  instructions: string;
  prescriber: string;
  remind: boolean;
  active: boolean;
}

export function MedicationsPage() {
  const now = useNow(30_000);
  const today = toDateKey(now);
  const weekStart = addDaysKey(today, -6);
  const meds = useLiveQuery(() => db.medications.toArray());
  const logs = useLiveQuery(() => db.medicationLogs.where('date').aboveOrEqual(weekStart).toArray(), [weekStart]);
  const [form, setForm] = useState<MedForm | null>(null);
  const [error, setError] = useState<string>();

  const todayDoses = meds && logs ? dosesForDay(meds, logs, today) : [];
  const active = (meds ?? []).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));
  const inactive = (meds ?? []).filter((m) => !m.active);

  // Adesão: doses previstas nos últimos 7 dias (até agora) × doses marcadas como tomadas.
  let expected = 0;
  let taken = 0;
  if (meds && logs) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (let i = 6; i >= 0; i--) {
      const day = addDaysKey(today, -i);
      for (const d of dosesForDay(meds, logs, day)) {
        if (day === today && timeToMinutes(d.time) > nowMin && !d.log) continue;
        expected++;
        if (d.log) taken++;
      }
    }
  }

  const openForm = (m?: Medication) => {
    setError(undefined);
    setForm(
      m
        ? {
            id: m.id,
            name: m.name,
            dosage: m.dosage,
            times: [...m.times],
            startDate: m.startDate,
            endDate: m.endDate ?? '',
            instructions: m.instructions ?? '',
            prescriber: m.prescriber ?? '',
            remind: m.remind,
            active: m.active,
          }
        : {
            name: '',
            dosage: '',
            times: ['08:00'],
            startDate: today,
            endDate: '',
            instructions: '',
            prescriber: '',
            remind: true,
            active: true,
          },
    );
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError('Informe o nome do remédio.');
    const times = [...new Set(form.times.filter(Boolean))].sort();
    if (times.length === 0) return setError('Informe pelo menos um horário.');
    if (!form.startDate) return setError('Informe a data de início.');
    if (form.endDate && form.endDate < form.startDate) return setError('O fim do tratamento deve ser depois do início.');
    const med: Medication = {
      name: form.name.trim(),
      dosage: form.dosage.trim(),
      times,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      instructions: form.instructions.trim() || undefined,
      prescriber: form.prescriber.trim() || undefined,
      remind: form.remind,
      active: form.active,
    };
    if (form.id != null) med.id = form.id;
    await db.medications.put(med);
    setForm(null);
  };

  const remove = async () => {
    if (form?.id == null || !confirm('Excluir este remédio e o histórico de doses?')) return;
    const id = form.id;
    await db.transaction('rw', db.medications, db.medicationLogs, async () => {
      await db.medications.delete(id);
      await db.medicationLogs.filter((l) => l.medicationId === id).delete();
    });
    setForm(null);
  };

  const exportCalendar = (list: Medication[]) => {
    const ics = buildIcs(list.flatMap(medicationEvents));
    openCalendarFile(list.length === 1 ? `remedio-${list[0].name}.ics` : 'remedios.ics', ics);
  };

  const medItem = (m: Medication) => (
    <li key={m.id}>
      <button type="button" className="list-item" onClick={() => openForm(m)}>
        <div className="main">
          <span className="title">
            {m.name}
            {m.dosage ? ` · ${m.dosage}` : ''}
          </span>
          <span className="meta">
            {m.times.join(', ')} · desde {formatDate(m.startDate)}
            {m.endDate ? ` até ${formatDate(m.endDate)}` : ' (uso contínuo)'}
          </span>
          {m.instructions && <span className="meta">{m.instructions}</span>}
        </div>
        {m.remind && <Bell size={18} aria-label="Com lembrete" />}
      </button>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Remédios"
        subtitle="Horários, lembretes e controle de doses"
        back="/saude"
        actions={
          <button type="button" className="btn" onClick={() => openForm()}>
            <Plus size={18} /> Novo remédio
          </button>
        }
      />

      {todayDoses.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2>Doses de hoje</h2>
            <span className="muted small">
              {todayDoses.filter((d) => d.log).length} de {todayDoses.length} tomadas
            </span>
          </div>
          <ul className="list">
            {todayDoses.map((d) => (
              <li key={`${d.med.id}-${d.time}`} className="list-item static">
                <div className="main">
                  <span className="title">
                    {d.time} · {d.med.name}
                  </span>
                  <span>
                    <StatusBadge value={doseStatus(d, now)} />
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn small ${d.log ? 'secondary' : ''}`}
                  onClick={() => toggleDose(d, today)}
                  aria-pressed={!!d.log}
                >
                  <Check size={16} /> {d.log ? 'Desfazer' : 'Tomei'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {expected > 0 && (
        <section className="card">
          <div className="card-header">
            <h2>Adesão nos últimos 7 dias</h2>
            <strong>{Math.round((taken / expected) * 100)}%</strong>
          </div>
          <Meter value={taken} max={expected} label="Doses tomadas nos últimos 7 dias" />
          <p className="muted small">
            {taken} de {expected} doses previstas foram marcadas como tomadas.
          </p>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Em uso</h2>
          {active.length > 0 && (
            <button type="button" className="btn ghost small" onClick={() => exportCalendar(active)}>
              <CalendarPlus size={16} /> Lembretes no calendário
            </button>
          )}
        </div>
        {meds === undefined ? null : active.length === 0 ? (
          <EmptyState icon={Pill}>
            <p>Cadastre seus remédios para receber lembretes nos horários certos.</p>
            <button type="button" className="btn secondary" onClick={() => openForm()}>
              <Plus size={18} /> Novo remédio
            </button>
          </EmptyState>
        ) : (
          <ul className="list">{active.map(medItem)}</ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="card">
          <details>
            <summary>Tratamentos encerrados ({inactive.length})</summary>
            <ul className="list">{inactive.map(medItem)}</ul>
          </details>
        </section>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id != null ? 'Editar remédio' : 'Novo remédio'}
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
                <span>Nome *</span>
                <input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Dose</span>
                <input
                  placeholder="ex.: 50 mg, 1 comprimido"
                  value={form.dosage}
                  onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                />
              </label>
            </div>
            <fieldset>
              <legend>Horários *</legend>
              <div className="form">
                {form.times.map((t, i) => (
                  <div key={i} className="btn-row">
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      type="time"
                      aria-label={`Horário ${i + 1}`}
                      value={t}
                      onChange={(e) => setForm({ ...form, times: form.times.map((x, j) => (j === i ? e.target.value : x)) })}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remover horário ${i + 1}`}
                      disabled={form.times.length === 1}
                      onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setForm({ ...form, times: [...form.times, ''] })}
                >
                  <Plus size={16} /> Adicionar horário
                </button>
              </div>
            </fieldset>
            <div className="form-grid">
              <label className="field">
                <span>Início *</span>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </label>
              <label className="field">
                <span>Fim</span>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                <small className="hint">Em branco = uso contínuo.</small>
              </label>
              <label className="field wide">
                <span>Como tomar</span>
                <input
                  placeholder="ex.: em jejum, com água"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                />
              </label>
              <label className="field wide">
                <span>Receitado por</span>
                <input value={form.prescriber} onChange={(e) => setForm({ ...form, prescriber: e.target.value })} />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.remind} onChange={(e) => setForm({ ...form, remind: e.target.checked })} />
              Avisar nos horários
            </label>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Em uso (desmarque quando o tratamento terminar)
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
