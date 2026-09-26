import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, Download, FileText, Monitor, Moon, Smartphone, Sun, Trash2, Upload } from 'lucide-react';
import { db, latestMeasurement, saveProfile, withProfileDefaults } from '../db/db';
import type { ActivityLevel, Profile, Sex, WeightGoal } from '../db/types';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useToasts } from '../components/Toasts';
import { isStandalone, useInstallPrompt } from '../hooks/useInstallPrompt';
import { clearAll, exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { ageOn, todayKey } from '../lib/dates';
import { downloadFile } from '../lib/download';
import { fmt, parseNumber } from '../lib/format';
import { bmi, bmiCategory } from '../lib/health';
import {
  notificationPermission,
  requestNotificationPermission,
  showSystemNotification,
  type PermissionState,
} from '../lib/notifications';
import { ACTIVITY_LEVELS, estimateEnergy, WEIGHT_GOALS } from '../lib/nutrition';
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

type TextFields = Omit<Profile, 'id' | 'heightCm' | 'calorieGoalOverride' | 'waterGoalMl'> & {
  heightCm: string;
  calorieGoalOverride: string;
  waterGoalMl: string;
};

function toText(p: Profile): TextFields {
  return {
    ...p,
    heightCm: p.heightCm != null ? String(p.heightCm) : '',
    calorieGoalOverride: p.calorieGoalOverride != null ? String(p.calorieGoalOverride) : '',
    waterGoalMl: String(p.waterGoalMl),
  };
}

function ProfileForm({ initial, weight }: { initial: Profile; weight?: number }) {
  const { notify } = useToasts();
  const [f, setF] = useState<TextFields>(() => toText(initial));
  const [error, setError] = useState<string>();

  const set = <K extends keyof TextFields>(k: K, v: TextFields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const text = (k: keyof TextFields) => ({
    value: (f[k] as string | undefined) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
  });

  const parsed: Profile = {
    ...f,
    id: 'me',
    name: f.name.trim(),
    heightCm: parseNumber(f.heightCm),
    calorieGoalOverride: parseNumber(f.calorieGoalOverride),
    waterGoalMl: parseNumber(f.waterGoalMl) ?? 2000,
    birthDate: f.birthDate || undefined,
    sex: f.sex || undefined,
    morningAlertTime: f.morningAlertTime || '07:00',
  };
  const energy = estimateEnergy(parsed, weight);
  const age = parsed.birthDate ? ageOn(parsed.birthDate) : undefined;
  const currentBmi = weight && parsed.heightCm ? bmi(weight, parsed.heightCm) : undefined;

  const save = async () => {
    if (f.heightCm && (parsed.heightCm == null || parsed.heightCm < 50 || parsed.heightCm > 250))
      return setError('Informe a altura em centímetros (ex.: 170).');
    if (f.birthDate && f.birthDate > todayKey()) return setError('A data de nascimento está no futuro.');
    setError(undefined);
    await saveProfile(parsed);
    notify({ title: 'Perfil salvo' });
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="card">
        <h2>Dados pessoais</h2>
        <div className="form-grid">
          <label className="field wide">
            <span>Nome</span>
            <input autoComplete="name" {...text('name')} />
          </label>
          <label className="field">
            <span>Data de nascimento</span>
            <input type="date" {...text('birthDate')} />
          </label>
          <label className="field">
            <span>Sexo biológico</span>
            <select value={f.sex ?? ''} onChange={(e) => set('sex', (e.target.value || undefined) as Sex | undefined)}>
              <option value="">—</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
            </select>
          </label>
          <label className="field">
            <span>Altura</span>
            <div className="input-suffix">
              <input inputMode="decimal" placeholder="ex.: 170" {...text('heightCm')} />
              <em>cm</em>
            </div>
          </label>
          <label className="field">
            <span>Tipo sanguíneo</span>
            <select {...text('bloodType')}>
              <option value="">—</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="btn-row">
          {age != null && <span className="badge">{age} anos</span>}
          {weight != null ? (
            <span className="badge">Peso atual: {fmt(weight, 1)} kg</span>
          ) : (
            <Link to="/saude/medidas?tipo=peso" className="small">
              Registrar peso
            </Link>
          )}
          {currentBmi && (
            <StatusBadge value={{ ...bmiCategory(currentBmi), label: `IMC ${fmt(currentBmi, 1)} · ${bmiCategory(currentBmi).label}` }} />
          )}
        </div>
      </section>

      <section className="card">
        <h2>Metas</h2>
        <div className="form-grid">
          <label className="field">
            <span>Nível de atividade</span>
            <select value={f.activityLevel} onChange={(e) => set('activityLevel', e.target.value as ActivityLevel)}>
              {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.hint})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Objetivo</span>
            <select value={f.weightGoal} onChange={(e) => set('weightGoal', e.target.value as WeightGoal)}>
              {Object.entries(WEIGHT_GOALS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Meta de calorias manual</span>
            <div className="input-suffix">
              <input inputMode="numeric" placeholder={energy ? String(energy.goal) : 'ex.: 2000'} {...text('calorieGoalOverride')} />
              <em>kcal</em>
            </div>
            <small className="hint">Em branco = cálculo automático.</small>
          </label>
          <label className="field">
            <span>Meta de água</span>
            <div className="input-suffix">
              <input inputMode="numeric" {...text('waterGoalMl')} />
              <em>ml</em>
            </div>
          </label>
        </div>
        {energy ? (
          <div className="alert">
            <div className="alert-body">
              <strong>Meta calculada: {fmt(energy.goal)} kcal/dia</strong>
              <span>
                Metabolismo basal {fmt(energy.bmr)} kcal · gasto diário estimado {fmt(energy.tdee)} kcal (fórmula de
                Mifflin-St Jeor). Converse com um nutricionista para uma meta individual.
              </span>
            </div>
          </div>
        ) : (
          <p className="muted small">Preencha nascimento, sexo, altura e registre o peso para calcular a meta.</p>
        )}
      </section>

      <section className="card">
        <h2>Informações médicas</h2>
        <div className="form-grid">
          <label className="field wide">
            <span>Alergias</span>
            <textarea placeholder="Medicamentos, alimentos, outros" {...text('allergies')} />
          </label>
          <label className="field wide">
            <span>Doenças e condições</span>
            <textarea placeholder="ex.: hipertensão, diabetes, asma" {...text('conditions')} />
          </label>
          <label className="field wide">
            <span>Cirurgias e internações</span>
            <textarea {...text('surgeries')} />
          </label>
          <label className="field wide">
            <span>Histórico familiar</span>
            <textarea placeholder="Doenças na família (pais, avós, irmãos)" {...text('familyHistory')} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Emergência e plano de saúde</h2>
        <div className="form-grid">
          <label className="field">
            <span>Contato de emergência</span>
            <input {...text('emergencyName')} />
          </label>
          <label className="field">
            <span>Telefone de emergência</span>
            <input type="tel" {...text('emergencyPhone')} />
          </label>
          <label className="field">
            <span>Plano de saúde</span>
            <input {...text('healthPlan')} />
          </label>
          <label className="field">
            <span>Nº da carteirinha</span>
            <input {...text('healthPlanNumber')} />
          </label>
          <label className="field">
            <span>Cartão SUS</span>
            <input inputMode="numeric" {...text('susCard')} />
          </label>
          <label className="field">
            <span>Horário do alerta no dia da consulta</span>
            <input type="time" {...text('morningAlertTime')} />
          </label>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn block">
        Salvar perfil
      </button>
    </form>
  );
}

function NotificationsCard() {
  const { notify } = useToasts();
  const [permission, setPermission] = useState<PermissionState>(notificationPermission);
  const labels: Record<PermissionState, string> = {
    granted: 'Notificações ativadas',
    default: 'Notificações ainda não ativadas',
    denied: 'Notificações bloqueadas no navegador',
    unsupported: 'Este navegador não suporta notificações',
  };

  const test = async () => {
    let p = permission;
    if (p === 'default') {
      p = await requestNotificationPermission();
      setPermission(p);
    }
    notify({ title: 'Teste de alerta', body: 'É assim que os avisos aparecem dentro do app.' });
    if (p === 'granted') await showSystemNotification({ title: 'Minha Saúde', body: 'As notificações estão funcionando!', tag: 'teste' });
  };

  return (
    <section className="card">
      <h2>
        <Bell size={20} aria-hidden /> Alertas
      </h2>
      <StatusBadge value={{ label: labels[permission], level: permission === 'granted' ? 'good' : 'warning' }} />
      <p className="muted small">
        O app avisa das consultas (no dia e nos horários escolhidos) e dos remédios enquanto estiver aberto ou em
        segundo plano. Para garantir o aviso mesmo com o app fechado, use o botão “Calendário” em cada consulta: ele
        adiciona o compromisso com alarmes ao calendário do seu celular.
      </p>
      <div className="btn-row">
        <button type="button" className="btn secondary small" onClick={test}>
          {permission === 'default' ? 'Ativar e testar' : 'Testar alerta'}
        </button>
      </div>
    </section>
  );
}

function AppearanceCard() {
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'auto', label: 'Automático', icon: Monitor },
    { value: 'claro', label: 'Claro', icon: Sun },
    { value: 'escuro', label: 'Escuro', icon: Moon },
  ];
  return (
    <section className="card">
      <h2>Aparência</h2>
      <div className="chips" role="group" aria-label="Tema">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={theme === value}
            onClick={() => {
              setTheme(value);
              setThemeState(value);
            }}
          >
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function DataCard() {
  const { notify } = useToasts();
  const fileRef = useRef<HTMLInputElement>(null);
  const install = useInstallPrompt();

  const doExport = async () => {
    const backup = await exportBackup(db);
    downloadFile(`minha-saude-backup-${todayKey()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    notify({ title: 'Backup gerado', body: 'Guarde o arquivo em local seguro (ex.: Google Drive).' });
  };

  const doImport = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      if (!confirm('Restaurar este backup? Os dados atuais deste aparelho serão substituídos.')) return;
      await restoreBackup(db, backup);
      notify({ title: 'Backup restaurado' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  };

  const doClear = async () => {
    if (!confirm('Apagar TODOS os dados deste aparelho? Esta ação não pode ser desfeita.')) return;
    if (!confirm('Tem certeza? Recomendamos fazer um backup antes.')) return;
    await clearAll(db);
    notify({ title: 'Dados apagados' });
  };

  return (
    <section className="card">
      <h2>Seus dados</h2>
      <p className="muted small">
        Tudo fica guardado somente neste aparelho, sem conta nem servidor. Faça backups de vez em quando e use-os para
        levar seus dados para outro celular ou computador.
      </p>
      <div className="btn-row">
        <button type="button" className="btn secondary small" onClick={doExport}>
          <Download size={16} /> Fazer backup
        </button>
        <button type="button" className="btn secondary small" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Restaurar backup
        </button>
        <Link to="/ficha" className="btn secondary small">
          <FileText size={16} /> Ficha de saúde
        </Link>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) doImport(file);
          }}
        />
      </div>
      {!isStandalone() && (
        <div className="alert">
          <Smartphone className="alert-icon" size={20} aria-hidden />
          <div className="alert-body">
            <strong>Instale o app no celular</strong>
            <span>
              Android: menu ⋮ do Chrome → “Instalar app”. iPhone: botão Compartilhar do Safari → “Adicionar à Tela de
              Início”. Assim ele abre como um aplicativo e funciona sem internet.
            </span>
            {install && (
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button type="button" className="btn small" onClick={install}>
                  Instalar agora
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div>
        <button type="button" className="btn danger small" onClick={doClear}>
          <Trash2 size={16} /> Apagar todos os dados
        </button>
      </div>
    </section>
  );
}

export function ProfilePage() {
  // null = carregado e sem perfil ainda; undefined = carregando.
  const stored = useLiveQuery(() => db.profile.get('me').then((p) => p ?? null));
  const weight = useLiveQuery(() => latestMeasurement(db, 'peso'))?.value;

  return (
    <>
      <PageHeader title="Perfil" subtitle="Seus dados, metas e configurações" />
      {stored !== undefined && <ProfileForm key={JSON.stringify(stored)} initial={withProfileDefaults(stored ?? undefined)} weight={weight} />}
      <NotificationsCard />
      <AppearanceCard />
      <DataCard />
      <p className="muted small" style={{ textAlign: 'center' }}>
        Minha Saúde · as informações e faixas de referência deste app não substituem orientação médica.
      </p>
    </>
  );
}
