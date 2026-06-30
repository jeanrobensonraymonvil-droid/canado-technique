const CACHE = 'canado-v24';
const ASSETS = ['./index.html', './data.json', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne JAMAIS mettre en cache les appels API ni les requêtes non-GET ni les autres domaines
  // (connexion, Rooby, évaluations, modules, notifications...) — sinon données périmées.
  if (e.request.method !== 'GET' ||
      url.hostname !== self.location.hostname ||
      url.pathname.includes('/api/')) {
    return; // laisser le navigateur gérer normalement (réseau direct, sans cache SW)
  }

  // data.json : RÉSEAU D'ABORD (contenu à jour quand en ligne, cache en secours hors-ligne).
  // Évite que tarifs / bibliothèque / actualités restent figés sur une vieille version.
  if (url.pathname.endsWith('/data.json') || url.pathname.endsWith('data.json')) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put('./data.json', clone));
        }
        return resp;
      }).catch(() => caches.match('./data.json'))
    );
    return;
  }

  // Ne jamais renvoyer index.html pour les fichiers cours
  // (sinon l'iframe affiche la page d'accueil au lieu du cours)
  if (url.pathname.includes('/cours/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        });
        // Pas de fallback index.html ici !
      })
    );
    return;
  }

  // Toutes les autres ressources
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        return resp;
      }).catch(() => {
        // Fallback index.html seulement pour la navigation de page (pas les assets)
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 404 });
      });
    })
  );
});
