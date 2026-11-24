// Pages d'aide : lien vers l'autre page en ligne (stable ou développement), dans le pied de page.
import { IS_DEV_SITE, OTHER_SITE } from '../site-channel.js'

const link = document.querySelector(IS_DEV_SITE ? '[data-channel="stable"]' : '[data-channel="dev"]')
if (link && OTHER_SITE) {
  link.querySelector('a').href = OTHER_SITE + location.pathname.split('/').pop()
  link.hidden = false
}
