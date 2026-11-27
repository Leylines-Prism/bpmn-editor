// Service worker de la version en ligne : l'éditeur, l'aide et la page vitrine s'ouvrent hors
// connexion, et l'application peut s'installer.
//
// Ce fichier n'est pas passé par Vite : le build (plugin « pwa » de vite.config.js) le copie à la
// racine du site sous le nom sw.js, en remplaçant les quatre valeurs ci-dessous par la version, l'empreinte de la
// liste des fichiers, le chemin du site et cette liste.
//
// Règles :
//   - seules les requêtes GET vers ce site passent par ici. Les fournisseurs d'IA, Ollama en local
//     et la mesure d'audience vont droit au réseau, sans copie ;
//   - les pages (HTML) passent par le réseau d'abord : en ligne, on a toujours la dernière version.
//     La copie ne sert que hors connexion ;
//   - les fichiers construits (noms avec empreinte) sont copiés à l'installation et servis depuis
//     la copie ;
//   - les GIF de l'aide (plus de 25 Mo) ne sont pas copiés à l'installation, seulement une fois vus ;
//   - une nouvelle version attend que la page la demande (message « activate ») : la page ne se
//     recharge jamais d'elle-même pendant qu'on travaille.

/* global __PWA_FILES__ */
const VERSION = '__PWA_VERSION__'
const HASH = '__PWA_HASH__'
const BASE = '__PWA_BASE__'
const FILES = __PWA_FILES__

const PREFIX = 'bpmn-pilot-'
const APP_CACHE = `${PREFIX}app-${HASH}`
const MEDIA_CACHE = `${PREFIX}media`

const url = (file) => new URL(BASE + file, self.location.origin).href

self.addEventListener('install', (event) => {
  // cache: 'reload' : jamais une copie du cache HTTP, qui pourrait être d'une autre version.
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(url(f), { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // On garde aussi la copie de la version précédente (caches.keys() suit l'ordre de création) :
    // un onglet resté ouvert sur elle y trouve encore les fichiers qu'il charge à la demande.
    const older = (await caches.keys()).filter((name) => name.startsWith(`${PREFIX}app-`) && name !== APP_CACHE)
    for (const name of older.slice(0, -1)) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ type: 'version', version: VERSION })
  if (event.data === 'activate') self.skipWaiting()
})

// Pages : réseau d'abord, copie hors connexion. « / » et « /aide » trouvent index.html et aide.html.
async function page(request) {
  try {
    return await fetch(request)
  } catch (err) {
    const cache = await caches.open(APP_CACHE)
    const path = new URL(request.url).pathname
    const file = path.endsWith('/') ? `${path}index.html` : path.endsWith('.html') ? path : `${path}.html`
    const copy = (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) || (await cache.match(new URL(file, self.location.origin).href, { ignoreVary: true }))
    if (copy) return copy
    throw err
  }
}

// Fichiers construits : copie d'abord, réseau sinon. ignoreVary : la copie, faite sans en-tête
// Origin, doit servir aussi les scripts chargés en mode cors (attribut crossorigin de Vite).
// caches.match cherche dans toutes les copies, celle de la version précédente comprise.
async function asset(request) {
  const copy = await caches.match(request, { ignoreSearch: true, ignoreVary: true })
  return copy || fetch(request)
}

// GIF : copie d'abord, sinon réseau, puis copie pour la prochaine fois.
async function media(request) {
  const cache = await caches.open(MEDIA_CACHE)
  const copy = await cache.match(request, { ignoreVary: true })
  if (copy) return copy
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const target = new URL(request.url)
  if (target.origin !== self.location.origin || !target.pathname.startsWith(BASE)) return
  if (target.pathname === `${BASE}sw.js`) return
  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (target.pathname.endsWith('.gif')) event.respondWith(media(request))
  else event.respondWith(asset(request))
})
