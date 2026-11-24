// Lien de soutien au projet (Ko-fi), sur la page vitrine et dans les pages d'aide.
// Ko-fi n'accepte pas de mesure d'audience sur ses pages : le clic est compté ici,
// par l'événement Umami « soutien » (voir src/analytics.js), avec la page d'origine.

import { track } from './analytics.js'

export const SUPPORT_URL = 'https://ko-fi.com/leylines_prism'

// Tasse sur sa soucoupe, au trait, comme les icônes de contact de feedback.js.
export const CUP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h12v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 12.5z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 2.5v2.5M12 2.5v2.5"/><path d="M3 21h14"/></svg>'

// Compte les clics sur les liens marqués data-support="<page>".
export function trackSupportClicks(root = document) {
  root.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[data-support]')
    if (link) track('soutien', { page: link.dataset.support })
  })
}
