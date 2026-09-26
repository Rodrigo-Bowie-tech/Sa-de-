export type ThemeChoice = 'auto' | 'claro' | 'escuro';

const KEY = 'minha-saude:tema';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'claro' || v === 'escuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice = getTheme()): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice === 'escuro' ? 'dark' : 'light');
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Sem armazenamento local: o tema vale só nesta sessão.
  }
  applyTheme(choice);
}
