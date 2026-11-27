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
// Chaque envoi porte la version de l'app (champ « tag » d'Umami) et chaque événement la
// langue de l'interface (propriété « langue »), pour comparer avant et après une release.
//
// Exclure ses propres visites : ouvrir une fois le site avec « ?moi=1 » dans l'adresse pose
// la clé « umami.disabled » dans ce navigateur, « ?moi=0 » la retire.
//
// Ni cookie ni identifiant : Umami reconnaît une visite par une empreinte calculée
// côté serveur (adresse IP, navigateur, sel tournant) et ne garde pas l'adresse IP.
// Rien n'est envoyé si le navigateur demande de ne pas être suivi (Do Not Track,
// Global Privacy Control), ni si localStorage contient « umami.disabled » (même clé
// que le traceur officiel, pour exclure ses propres visites).

import { APP_VERSION, IS_DEV_SITE } from './site-channel.js'

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

// Rien sur la page de développement : seule la page stable est mesurée.
const ENDPOINT = import.meta.env.MODE === 'online' && !IS_DEV_SITE && WEBSITE ? collectUrl(RAW_URL) : ''

// « ?moi=1 » ou « ?moi=0 » : pose ou retire l'exclusion de ce navigateur, puis retire le
// paramètre de l'adresse pour qu'il ne parte pas dans la mesure.
function selfExclusion() {
  if (!ENDPOINT) return
  let url
  try { url = new URL(location.href) } catch { return }
  const value = url.searchParams.get('moi')
  if (value !== '1' && value !== '0') return
  try {
    if (value === '1') localStorage.setItem('umami.disabled', '1')
    else localStorage.removeItem('umami.disabled')
  } catch { return }
  url.searchParams.delete('moi')
  history.replaceState(history.state, '', url)
  const fr = document.documentElement.lang === 'fr' || navigator.language?.startsWith('fr')
  const message = value === '1'
    ? (fr ? 'Vos visites depuis ce navigateur ne sont plus mesurées.' : 'Your visits from this browser are no longer measured.')
    : (fr ? 'Vos visites depuis ce navigateur sont de nouveau mesurées.' : 'Your visits from this browser are measured again.')
  setTimeout(() => alert(message), 0)
}
selfExclusion()

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
let uiLang = document.documentElement.lang || ''
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
    ...(APP_VERSION && { tag: APP_VERSION }),
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
  send({ ...basePayload(), name, data: { ...data, ...(uiLang && { langue: uiLang }) } })
}

// Valeur numérique ramenée à une tranche lisible (« 2 à 5 »), pour ne pas disperser les rapports.
export function range(n, steps = [1, 5, 20, 100, 1000]) {
  if (n <= steps[0]) return String(Math.max(0, n))
  for (let i = 1; i < steps.length; i++) if (n <= steps[i]) return `${steps[i - 1] + 1} à ${steps[i]}`
  return `plus de ${steps[steps.length - 1]}`
}

// Fonction appelée une fois, à la fermeture de la page (envoi d'un bilan).
export function onPageHide(fn) {
  if (!enabled) return
  let done = false
  window.addEventListener('pagehide', () => {
    if (done) return
    done = true
    try { fn() } catch {}
  })
}

// Clics vers GitHub (dépôt, images Docker, issues) : intérêt pour la version Docker et le MCP.
// « endroit » dit d'où vient le clic : la fenêtre ou la page.
export function trackGithubLinks(root = document, page = '') {
  if (!enabled) return
  root.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href^="https://github.com/"]')
    if (!link) return
    const place = page || link.closest('dialog[id], [role="dialog"][id], aside[id], section[id], header[id], nav[id]')?.id || 'editeur'
    track('lien-github', { endroit: place })
  })
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

// Page vue au chargement, puis suivi du temps actif (éditeur seulement : sur les pages
// d'aide et la vitrine, le temps passé fausserait celui passé à dessiner).
//   lang : langue de l'interface, si elle n'est pas celle de la page (éditeur).
export function setupAnalytics({ lang, activeTime = true } = {}) {
  if (!enabled) return
  if (lang) uiLang = lang
  send(basePayload())
  if (activeTime) trackActiveTime()
}
