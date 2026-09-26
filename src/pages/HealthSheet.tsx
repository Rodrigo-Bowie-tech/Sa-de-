import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Printer } from 'lucide-react';
import { db, latestMeasurement } from '../db/db';
import type { Measurement, MeasurementType } from '../db/types';
import { PageHeader } from '../components/PageHeader';
import { useProfile } from '../hooks/useProfile';
import { ageOn, formatDate, formatDateTime, todayKey, toDateTimeKey } from '../lib/dates';
import { fmt } from '../lib/format';
import { bmi, MEASUREMENT_TYPES, rxText, visionDiagnoses } from '../lib/health';
import { KIND_LABELS } from '../lib/reminders';

const SHEET_TYPES: MeasurementType[] = ['peso', 'pressao', 'glicemia', 'frequencia', 'saturacao', 'cintura'];

function measurementText(m: Measurement): string {
  const meta = MEASUREMENT_TYPES[m.type];
  const value = m.type === 'pressao' ? `${fmt(m.value)}/${fmt(m.value2)}` : fmt(m.value, meta.digits);
  return `${value} ${meta.unit} (${formatDate(m.datetime)})`;
}

function Row({ label, children }: { label: string; children?: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className="pre-wrap">{children}</dd>
    </>
  );
}

export function HealthSheet() {
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const [measurements, meds, vision, vaccines, exams, appointments] = await Promise.all([
      Promise.all(SHEET_TYPES.map((t) => latestMeasurement(db, t))),
      db.medications.filter((m) => m.active).toArray(),
      db.vision.orderBy('date').last(),
      db.vaccines.orderBy('date').reverse().toArray(),
      db.exams.orderBy('date').reverse().limit(10).toArray(),
      db.appointments.where('datetime').aboveOrEqual(toDateTimeKey(new Date())).toArray(),
    ]);
    return {
      measurements: measurements.filter((m): m is Measurement => !!m),
      meds,
      vision,
      vaccines,
      exams,
      appointments: appointments.filter((a) => a.status === 'agendada'),
    };
  });

  if (!data) return null;
  const weight = data.measurements.find((m) => m.type === 'peso')?.value;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Ficha de saúde"
          subtitle="Resumo para levar às consultas"
          back="/saude"
          actions={
            <button type="button" className="btn" onClick={() => window.print()}>
              <Printer size={18} /> Imprimir / PDF
            </button>
          }
        />
      </div>
      <article className="sheet">
        <header>
          <h1>{profile.name || 'Ficha de saúde'}</h1>
          <p className="muted small">Gerada em {formatDate(todayKey())} pelo app Minha Saúde</p>
        </header>

        <section>
          <h2>Identificação</h2>
          <dl>
            <Row label="Nascimento">
              {profile.birthDate ? `${formatDate(profile.birthDate)} (${ageOn(profile.birthDate)} anos)` : undefined}
            </Row>
            <Row label="Sexo">{profile.sex === 'feminino' ? 'Feminino' : profile.sex === 'masculino' ? 'Masculino' : undefined}</Row>
            <Row label="Tipo sanguíneo">{profile.bloodType}</Row>
            <Row label="Altura">{profile.heightCm ? `${fmt(profile.heightCm)} cm` : undefined}</Row>
            <Row label="IMC">{weight && profile.heightCm ? fmt(bmi(weight, profile.heightCm), 1) : undefined}</Row>
            <Row label="Plano de saúde">
              {profile.healthPlan
                ? `${profile.healthPlan}${profile.healthPlanNumber ? ` — nº ${profile.healthPlanNumber}` : ''}`
                : undefined}
            </Row>
            <Row label="Cartão SUS">{profile.susCard}</Row>
            <Row label="Emergência">
              {profile.emergencyName || profile.emergencyPhone
                ? [profile.emergencyName, profile.emergencyPhone].filter(Boolean).join(' — ')
                : undefined}
            </Row>
          </dl>
        </section>

        <section>
          <h2>Histórico médico</h2>
          <dl>
            <Row label="Alergias">{profile.allergies || 'Nenhuma informada'}</Row>
            <Row label="Condições">{profile.conditions || 'Nenhuma informada'}</Row>
            <Row label="Cirurgias">{profile.surgeries}</Row>
            <Row label="Histórico familiar">{profile.familyHistory}</Row>
          </dl>
        </section>

        <section>
          <h2>Remédios em uso</h2>
          {data.meds.length === 0 ? (
            <p className="muted">Nenhum.</p>
          ) : (
            <ul>
              {data.meds.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>
                  {m.dosage ? ` — ${m.dosage}` : ''} · {m.times.join(', ')}
                  {m.instructions ? ` · ${m.instructions}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.measurements.length > 0 && (
          <section>
            <h2>Últimas medidas</h2>
            <dl>
              {data.measurements.map((m) => (
                <Row key={m.type} label={MEASUREMENT_TYPES[m.type].label}>
                  {measurementText(m)}
                </Row>
              ))}
            </dl>
          </section>
        )}

        {data.vision && (
          <section>
            <h2>Visão — receita de {formatDate(data.vision.date)}</h2>
            <dl>
              <Row label="Olho direito (OD)">{rxText(data.vision.od)}</Row>
              <Row label="Olho esquerdo (OE)">{rxText(data.vision.oe)}</Row>
              <Row label="Diagnóstico">{visionDiagnoses(data.vision).join('\n')}</Row>
            </dl>
          </section>
        )}

        {data.vaccines.length > 0 && (
          <section>
            <h2>Vacinas</h2>
            <ul>
              {data.vaccines.map((v) => (
                <li key={v.id}>
                  {v.name} — {v.dose} em {formatDate(v.date)}
                  {v.nextDate ? ` (próxima: ${formatDate(v.nextDate)})` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.exams.length > 0 && (
          <section>
            <h2>Exames recentes</h2>
            <ul>
              {data.exams.map((e) => (
                <li key={e.id}>
                  {formatDate(e.date)} — <strong>{e.name}</strong>
                  {e.result ? `: ${e.result.split('\n')[0]}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.appointments.length > 0 && (
          <section>
            <h2>Próximas consultas</h2>
            <ul>
              {data.appointments.map((a) => (
                <li key={a.id}>
                  {formatDateTime(a.datetime)} — {KIND_LABELS[a.kind]}: {a.specialty}
                  {a.professional ? ` (${a.professional})` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
