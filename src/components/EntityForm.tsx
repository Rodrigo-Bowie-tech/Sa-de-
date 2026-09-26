import { useId } from 'react';
import { parseNumber } from '../lib/format';

export type FieldType = 'text' | 'number' | 'date' | 'datetime-local' | 'time' | 'textarea' | 'select' | 'tel';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Sugestões de preenchimento (datalist). */
  suggestions?: string[];
  hint?: string;
  suffix?: string;
  wide?: boolean;
}

export type FormValues = Record<string, string>;

export function toFormValues(fields: FieldDef[], record: object): FormValues {
  const r = record as Record<string, unknown>;
  const values: FormValues = {};
  for (const f of fields) {
    const v = r[f.name];
    values[f.name] = v == null ? '' : f.type === 'number' ? String(v).replace('.', ',') : String(v);
  }
  return values;
}

export function fromFormValues(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (values[f.name] ?? '').trim();
    out[f.name] = f.type === 'number' ? parseNumber(raw) : raw === '' ? undefined : raw;
  }
  return out;
}

/** Retorna a mensagem do primeiro campo obrigatório vazio ou número inválido. */
export function validateForm(fields: FieldDef[], values: FormValues): string | undefined {
  for (const f of fields) {
    const raw = (values[f.name] ?? '').trim();
    if (f.required && raw === '') return `Preencha "${f.label}".`;
    if (f.type === 'number' && raw !== '' && parseNumber(raw) == null) return `"${f.label}" precisa ser um número.`;
  }
  return undefined;
}

interface EntityFormProps {
  fields: FieldDef[];
  values: FormValues;
  onChange: (values: FormValues) => void;
}

export function EntityForm({ fields, values, onChange }: EntityFormProps) {
  const baseId = useId();
  const set = (name: string, value: string) => onChange({ ...values, [name]: value });

  return (
    <div className="form-grid">
      {fields.map((f) => {
        const id = `${baseId}-${f.name}`;
        const listId = f.suggestions ? `${id}-list` : undefined;
        const common = {
          id,
          name: f.name,
          value: values[f.name] ?? '',
          required: f.required,
          placeholder: f.placeholder,
        };
        let control;
        if (f.type === 'textarea') {
          control = <textarea {...common} onChange={(e) => set(f.name, e.target.value)} />;
        } else if (f.type === 'select') {
          control = (
            <select {...common} onChange={(e) => set(f.name, e.target.value)}>
              {!f.required && <option value="">—</option>}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        } else {
          const input = (
            <input
              {...common}
              type={f.type === 'number' ? 'text' : f.type}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              list={listId}
              autoComplete="off"
              onChange={(e) => set(f.name, e.target.value)}
            />
          );
          control = f.suffix ? (
            <div className="input-suffix">
              {input}
              <em>{f.suffix}</em>
            </div>
          ) : (
            input
          );
        }
        return (
          <label key={f.name} className={`field${f.wide || f.type === 'textarea' ? ' wide' : ''}`} htmlFor={id}>
            <span>
              {f.label}
              {f.required ? ' *' : ''}
            </span>
            {control}
            {f.suggestions && (
              <datalist id={listId}>
                {f.suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
            {f.hint && <small className="hint">{f.hint}</small>}
          </label>
        );
      })}
    </div>
  );
}
