// O app Treino saiu deste endereço (agora fica em https://rodrigo-bowie-tech.github.io/treino/).
// Este service worker substitui o antigo de /Sa-de-/treino/ nos aparelhos que já tinham aberto o
// Treino aqui: apaga os arquivos que ele guardou e se remove, para o endereço antigo levar ao novo.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.includes(scope)).map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
