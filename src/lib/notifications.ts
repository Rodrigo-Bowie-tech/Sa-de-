export type PermissionState = NotificationPermission | 'unsupported';

export function notificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

export interface ShowOptions {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Mostra uma notificação do sistema. Usa o service worker quando disponível
 * (obrigatório no Android) e cai para a API simples no computador.
 */
export async function showSystemNotification({ title, body, tag, url }: ShowOptions): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options: NotificationOptions = {
    body,
    tag,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: url ?? './' },
  };
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
