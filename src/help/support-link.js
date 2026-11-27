// Pages d'aide : vue de la page, clics sur le lien de soutien (voir src/support.js) et sur
// les liens vers GitHub (voir src/analytics.js). Pas de temps actif ici.
import { trackSupportClicks } from '../support.js'
import { setupAnalytics, trackGithubLinks } from '../analytics.js'

setupAnalytics({ activeTime: false })
trackSupportClicks()
trackGithubLinks(document, document.documentElement.lang === 'fr' ? 'aide' : 'help')
