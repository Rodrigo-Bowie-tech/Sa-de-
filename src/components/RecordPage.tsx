import { useState, type ReactNode } from 'react';
import type { EntityTable, IDType } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, type LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { EntityForm, fromFormValues, toFormValues, validateForm, type FieldDef, type FormValues } from './EntityForm';
import { Modal } from './Modal';
import { PageHeader } from './PageHeader';

interface RecordPageProps<T extends { id?: number }> {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  table: EntityTable<T, 'id'>;
  fields: FieldDef[];
  /** Campo usado para ordenar (mais recente primeiro). */
  sortKey: keyof T & string;
  newValues: () => FormValues;
  renderItem: (item: T) => ReactNode;
  /** Ajustes antes de salvar (cálculos automáticos, validações extras). */
  beforeSave?: (data: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  summary?: (items: T[]) => ReactNode;
  emptyText: string;
  /** Nome do item no singular, ex.: "exame". */
  itemName: string;
  /** "o" ou "a", para "Novo exame" / "Nova vacina". */
  gender?: 'o' | 'a';
}

/** Página genérica de lista + cadastro para registros simples. */
export function RecordPage<T extends { id?: number }>({
  title,
  subtitle,
  icon,
  table,
  fields,
  sortKey,
  newValues,
  renderItem,
  beforeSave,
  summary,
  emptyText,
  itemName,
  gender = 'o',
}: RecordPageProps<T>) {
  const items = useLiveQuery(async () => {
    const all = await table.toArray();
    return all.sort((a, b) => String(b[sortKey] ?? '').localeCompare(String(a[sortKey] ?? '')));
  }, [table, sortKey]);
  const [editing, setEditing] = useState<{ id?: number; values: FormValues } | null>(null);
  const [error, setError] = useState<string>();

  const open = (item?: T) => {
    setError(undefined);
    setEditing(item ? { id: item.id, values: toFormValues(fields, item) } : { values: newValues() });
  };

  const save = async () => {
    if (!editing) return;
    const problem = validateForm(fields, editing.values);
    if (problem) return setError(problem);
    try {
      let data = fromFormValues(fields, editing.values);
      if (beforeSave) data = await beforeSave(data);
      if (editing.id != null) data.id = editing.id;
      await table.put(data as T);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  };

  const remove = async () => {
    if (editing?.id == null || !confirm(`Excluir est${gender === 'a' ? 'a' : 'e'} ${itemName}?`)) return;
    await table.delete(editing.id as IDType<T, 'id'>);
    setEditing(null);
  };

  const novo = gender === 'a' ? 'Nova' : 'Novo';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        back="/saude"
        actions={
          <button type="button" className="btn" onClick={() => open()}>
            <Plus size={18} /> Adicionar
          </button>
        }
      />
      {items && items.length > 0 && summary?.(items)}
      <section className="card">
        {items === undefined ? null : items.length === 0 ? (
          <EmptyState icon={icon}>
            <p>{emptyText}</p>
            <button type="button" className="btn secondary" onClick={() => open()}>
              <Plus size={18} /> {novo} {itemName}
            </button>
          </EmptyState>
        ) : (
          <ul className="list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="list-item" onClick={() => open(item)}>
                  {renderItem(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id != null ? `Editar ${itemName}` : `${novo} ${itemName}`}
        footer={
          <>
            {editing?.id != null && (
              <button type="button" className="btn danger" onClick={remove}>
                Excluir
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={save}>
              Salvar
            </button>
          </>
        }
      >
        {editing && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <EntityForm fields={fields} values={editing.values} onChange={(values) => setEditing({ ...editing, values })} />
            {error && <p className="error">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
