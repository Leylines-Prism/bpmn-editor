// Version et canal du site, fixés au build (vite.config.js).
//   APP_VERSION : « v1.1.0 » sur une version, « v1.1.0-12-gabc1234 » entre deux.
//   SITE_CHANNEL : « dev » pour la page en ligne qui suit main (/dev/), vide sinon.
/* global __APP_VERSION__, __SITE_CHANNEL__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
export const SITE_CHANNEL = typeof __SITE_CHANNEL__ === 'string' ? __SITE_CHANNEL__ : ''
export const IS_DEV_SITE = SITE_CHANNEL === 'dev'

// La page stable en ligne propose la page de développement, et inversement. La page dev vit
// dans le dossier dev/ de la page stable. Rien dans l'image Docker ni en développement local.
const BASE = new URL(import.meta.env.BASE_URL, location.origin)
export const OTHER_SITE = IS_DEV_SITE
  ? new URL('../', BASE).href
  : import.meta.env.MODE === 'online' ? new URL('dev/', BASE).href : ''
