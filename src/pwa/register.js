// Application installable et hors connexion (version en ligne seulement).
//
// Enregistre le service worker (src/pwa/sw.js, copié à la racine du site par le build) et
// surveille les nouvelles versions. Une nouvelle version s'installe en arrière-plan puis attend :
//   - si la page ouverte est déjà cette version (elle vient du réseau), elle prend la main sans
//     rien afficher ;
//   - sinon, un bandeau propose de recharger. Rien ne se recharge sans clic : le travail en cours
//     n'est jamais interrompu.

import { T } from '../i18n/lang.js'
import { APP_VERSION } from '../site-channel.js'

const BASE = import.meta.env.BASE_URL
const HOUR = 60 * 60 * 1000

export function setupPwa({ before, canvas, save } = {}) {
  if (import.meta.env.MODE !== 'online' || import.meta.env.DEV || !('serviceWorker' in navigator)) return
  // Après le chargement : l'installation du service worker ne ralentit pas l'ouverture de l'éditeur.
  if (document.readyState === 'complete') register({ before, canvas, save })
  else window.addEventListener('load', () => register({ before, canvas, save }), { once: true })
}

async function register({ before, canvas, save }) {
  let reg
  try {
    reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
  } catch (err) {
    console.warn('[pwa] service worker non enregistré :', err)
    return
  }

  let reloading = false
  let asked = false
  const reload = () => {
    if (reloading) return
    reloading = true
    location.reload()
  }
  // Recharge, après avoir enregistré. Si la nouvelle version attend encore, on la libère d'abord
  // et le rechargement suit sa prise de main.
  const activate = async () => {
    try { await save?.() } catch {}
    asked = true
    if (reg.waiting) reg.waiting.postMessage('activate')
    else reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (asked) reload()
    // Un autre onglet, ouvert sur la nouvelle version, l'a fait passer : on demande son numéro.
    else navigator.serviceWorker.controller?.postMessage('version')
  })

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'version') return
    const version = event.data.version
    if (reg.waiting && version === APP_VERSION) reg.waiting.postMessage('activate')
    else if (version !== APP_VERSION) showNotice({ before, canvas, version, activate })
  })

  const check = () => {
    // Pas de service worker actif : première installation, elle prend la main seule.
    if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('version')
  }
  check()
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') check()
    })
  })

  // Une session peut durer des heures : on regarde de temps en temps, et au retour sur l'onglet.
  const update = () => navigator.onLine && reg.update().catch(() => {})
  setInterval(update, HOUR)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update()
  })
}

function showNotice({ before, canvas, version, activate }) {
  if (!before || document.getElementById('update-notice')) return
  const bar = document.createElement('div')
  bar.id = 'update-notice'
  bar.className = 'app-notice'
  bar.setAttribute('role', 'status')
  const p = document.createElement('p')
  p.textContent = T(
    `A new version of BPMN-Pilot is available (${version}). Reloading keeps the diagram you are working on.`,
    `Une nouvelle version de BPMN-Pilot est disponible (${version}). Recharger garde le diagramme en cours.`,
  )
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.className = 'btn primary'
  reload.textContent = T('Reload', 'Recharger')
  reload.addEventListener('click', () => {
    reload.disabled = true
    activate()
  })
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'close'
  close.textContent = '×'
  close.title = T('Later', 'Plus tard')
  close.setAttribute('aria-label', T('Close this message', 'Fermer ce message'))
  close.addEventListener('click', () => {
    bar.remove()
    canvas?.resized()
  })
  bar.append(p, reload, close)
  before.before(bar)
  canvas?.resized()
}
