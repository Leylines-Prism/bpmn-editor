// Mesure d'audience de la version en ligne, par Umami.
//
// Aucun script tiers n'est chargé : ce module envoie lui-même les mesures au point
// de collecte d'Umami (POST /api/send, même format que son traceur officiel). La
// politique de sécurité du contenu reste donc « script-src 'self' » et rien d'autre
// que ce code ne s'exécute à côté des clés d'API du visiteur.
//
// Réglages au build (variables GitHub, voir .github/workflows/pages.yml) :
//   VITE_UMAMI_URL         adresse d'Umami (https://umami.example.com) ou de son point
//                          de collecte complet (https://umami.example.com/api/send)
//   VITE_UMAMI_WEBSITE_ID  identifiant du site dans Umami
// Sans ces deux variables, ou hors de la version en ligne, rien n'est envoyé.
//
// Ni cookie ni identifiant : Umami reconnaît une visite par une empreinte calculée
// côté serveur (adresse IP, navigateur, sel tournant) et ne garde pas l'adresse IP.
// Rien n'est envoyé si le navigateur demande de ne pas être suivi (Do Not Track,
// Global Privacy Control), ni si localStorage contient « umami.disabled » (même clé
// que le traceur officiel, pour exclure ses propres visites).

const RAW_URL = (import.meta.env.VITE_UMAMI_URL || '').trim()
const WEBSITE = (import.meta.env.VITE_UMAMI_WEBSITE_ID || '').trim()

function collectUrl(raw) {
  try {
    const u = new URL(raw)
    // https obligatoire, sauf vers sa propre machine pour les essais.
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return ''
    if (u.pathname === '/' || u.pathname === '') u.pathname = '/api/send'
    return u.toString()
  } catch {
    return ''
  }
}

const ENDPOINT = import.meta.env.MODE === 'online' && WEBSITE ? collectUrl(RAW_URL) : ''

function optedOut() {
  try {
    if (localStorage.getItem('umami.disabled')) return true
  } catch {}
  const dnt = navigator.doNotTrack || window.doNotTrack
  return dnt === '1' || dnt === 'yes' || navigator.globalPrivacyControl === true
}

const enabled = !!ENDPOINT && !optedOut()

// Nom d'hôte du service de mesure, pour la mention de confidentialité ('' sans mesure).
export const analyticsHost = ENDPOINT ? new URL(ENDPOINT).hostname : ''
let cache // jeton renvoyé par Umami, gardé en mémoire seulement
let disabled = false

function basePayload() {
  const url = new URL(location.href)
  url.hash = ''
  let referrer = document.referrer || ''
  // Un référent interne au site n'est pas une provenance.
  if (referrer.startsWith(location.origin + '/') || referrer === location.origin) referrer = ''
  return {
    website: WEBSITE,
    hostname: location.hostname,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    title: document.title,
    url: url.toString(),
    referrer,
  }
}

function send(payload) {
  if (!enabled || disabled) return
  const headers = { 'Content-Type': 'application/json' }
  if (cache) headers['x-umami-cache'] = cache
  // keepalive : la requête part même si la page se ferme juste après.
  fetch(ENDPOINT, { method: 'POST', keepalive: true, credentials: 'omit', headers, body: JSON.stringify({ type: 'event', payload }) })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) {
        disabled = !!data.disabled
        cache = data.cache
      }
    })
    .catch(() => {})
}

// Événement nommé, avec des propriétés facultatives (jamais de contenu du diagramme).
export function track(name, data) {
  send({ ...basePayload(), name, ...(data && { data }) })
}

// Événement envoyé une seule fois par chargement de la page (pour un même nom et
// les mêmes propriétés).
const once = new Set()
export function trackOnce(name, data) {
  const key = name + JSON.stringify(data || {})
  if (once.has(key)) return
  once.add(key)
  track(name, data)
}

// Temps d'utilisation réelle : compté seulement quand l'onglet est visible et qu'une
// action (clic, touche, molette, mouvement) a eu lieu dans la dernière minute.
// Envoyé une fois, à la fermeture de la page, par tranche.
const TICK = 5000
const IDLE = 60000

function bucket(minutes) {
  if (minutes < 1) return 'moins de 1 min'
  if (minutes < 5) return '1 à 5 min'
  if (minutes < 15) return '5 à 15 min'
  if (minutes < 30) return '15 à 30 min'
  return '30 min et plus'
}

function trackActiveTime() {
  let active = 0
  let lastAction = Date.now()
  let sent = false
  const touch = () => { lastAction = Date.now() }
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(type, touch, { passive: true, capture: true })
  }
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastAction < IDLE) active += TICK
  }, TICK)
  window.addEventListener('pagehide', () => {
    if (sent) return
    sent = true
    const minutes = active / 60000
    track('temps-actif', { tranche: bucket(minutes), minutes: Math.round(minutes * 10) / 10 })
  })
}

// Page vue au chargement, puis suivi du temps actif.
export function setupAnalytics() {
  if (!enabled) return
  send(basePayload())
  trackActiveTime()
}
