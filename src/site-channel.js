// Version et canal du site, fixés au build (vite.config.js).
//   APP_VERSION : « v1.1.0 » sur une version, « v1.1.0-12-gabc1234 » entre deux.
//   SITE_CHANNEL : « dev » pour la page en ligne qui suit main (/dev/), vide sinon.
/* global __APP_VERSION__, __SITE_CHANNEL__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
export const SITE_CHANNEL = typeof __SITE_CHANNEL__ === 'string' ? __SITE_CHANNEL__ : ''
export const IS_DEV_SITE = SITE_CHANNEL === 'dev'

// La page stable en ligne propose la page de développement, et inversement. VITE_OTHER_SITE_URL
// donne l'adresse complète de l'autre page quand elle vit sur sa propre origine (la page dev sur
// un sous-domaine, pour qu'elle ne puisse pas lire le stockage de la page stable). Sans elle, la
// page dev est dans le dossier dev/ de la page stable. Rien dans l'image Docker ni en local.
const BASE = new URL(import.meta.env.BASE_URL, location.origin)
function otherSite() {
  if (import.meta.env.MODE !== 'online') return ''
  const given = (import.meta.env.VITE_OTHER_SITE_URL || '').trim()
  try {
    if (given) {
      const url = new URL(given)
      if (url.protocol === 'https:') return url.href.endsWith('/') ? url.href : url.href + '/'
    }
  } catch {}
  return IS_DEV_SITE ? new URL('../', BASE).href : new URL('dev/', BASE).href
}
export const OTHER_SITE = otherSite()
