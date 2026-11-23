// Mention de confidentialité de la version en ligne : un bouton « Confidentialité »
// en bas à droite du canevas ouvre une fenêtre en courtes sections titrées. Le nom
// de l'hébergeur se règle au build avec VITE_SITE_HOST (par exemple « GitHub Pages ») ;
// sans lui, le texte reste générique. La section « Mesure d'audience » n'apparaît que
// si la mesure est réglée au build (voir src/analytics.js).

import { T } from './i18n/lang.js'
import { analyticsHost } from './analytics.js'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const ICONS = {
  shield: svg('<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  device: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  assistant: svg('<path d="M12 3v3M5 9h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  server: svg('<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
}

function section(icon, title, body) {
  return `<section class="pv-section">
        <span class="pv-icon">${ICONS[icon]}</span>
        <div class="pv-body"><h3>${title}</h3>${body}</div>
      </section>`
}

export function setupPrivacy({ container }) {
  const host = (import.meta.env.VITE_SITE_HOST || '').trim()
  const hostName = host ? ` (${esc(host)})` : ''

  // Bouton visible en bas à droite du canevas, au-dessus de « Votre avis » s'il existe.
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'privacy-button'
  button.innerHTML = `${ICONS.shield}<span>${T('Privacy', 'Confidentialité')}</span>`
  container.append(button)

  const yours = section('device', T('Your data', 'Vos données'), `
          <p>${T('Your diagrams, your settings and your API keys stay in your browser, on your device.',
                 'Vos diagrammes, vos réglages et vos clés d\'API restent dans votre navigateur, sur votre appareil.')}</p>
          <p>${T(`They are not sent to us, nor to the host of this site${hostName}.`,
                 `Ils ne sont transmis ni à nous ni à l'hébergeur du site${hostName}.`)}</p>`)

  const assistant = section('assistant', T('With the AI assistant', "Avec l'assistant IA"), `
          <p>${T('Your messages, the diagram and your API key are sent from your browser directly to the provider you selected (Anthropic, OpenAI, etc.).',
                 "Vos messages, le diagramme et votre clé d'API sont envoyés directement de votre navigateur au fournisseur que vous avez choisi (Anthropic, OpenAI, etc.).")}</p>
          <p>${T("The provider's own terms and privacy policy apply, and it bills you for usage.",
                 "Les conditions d'utilisation et la politique de confidentialité de ce fournisseur s'appliquent, et c'est lui qui vous facture l'usage.")}</p>`)

  const audience = analyticsHost ? section('chart', T('Audience measurement', "Mesure d'audience"), `
          <p>${T('The site measures its audience with Umami.', 'Le site mesure sa fréquentation avec Umami.')}</p>
          <ul class="pv-facts">
            <li class="pv-key">${T('The content of your diagrams, messages and keys is never collected.', 'Le contenu de vos diagrammes, de vos messages et de vos clés n\'est jamais collecté.')}</li>
            <li>${T('The measurement follows the recommendations of the CNIL (the French data protection authority) for audience measurement exempt from consent:', "La mesure suit les recommandations de la CNIL pour les mesures d'audience exemptées de consentement :")}</li>
            <li class="pv-sub">${T('No cookie is set and your IP address is not recorded.', "Aucun cookie n'est déposé et votre adresse IP n'est pas enregistrée.")}</li>
            <li class="pv-sub">${T('Visitors are counted with a hashed identifier, renewed every month.', 'Les visiteurs sont comptés au moyen d\'un identifiant haché, renouvelé chaque mois.')}</li>
            <li class="pv-sub">${T('The data is kept for 25 months at most and is not shared with third parties.', 'Les données sont conservées 25 mois au maximum et ne sont pas transmises à des tiers.')}</li>
            <li class="pv-sub">${T('The measurement is turned off if your browser sends a "Do Not Track" or "Global Privacy Control" signal.', 'La mesure est désactivée si votre navigateur envoie le signal « Do Not Track » ou « Global Privacy Control ».')}</li>
          </ul>`) : ''

  const hosting = section('server', T('Hosting', 'Hébergement'), `
          <p>${T(`The host of this site${hostName} keeps technical logs, as any web host does, including your IP address and the pages requested.`,
                 `L'hébergeur du site${hostName} conserve, comme tout hébergeur web, des journaux techniques qui incluent votre adresse IP et les pages demandées.`)}${analyticsHost
            ? T(' The measurement server may also keep technical logs for a short period.', ' Le serveur de mesure peut également conserver des journaux techniques pendant une courte durée.')
            : ''}</p>
          <p>${analyticsHost
            ? T('The page loads no third-party scripts.', 'La page ne charge aucun script tiers.')
            : T('The page sets no cookies, measures no audience and loads no third-party scripts.', "La page ne dépose aucun cookie, ne mesure pas l'audience et ne charge aucun script tiers.")}</p>`)

  const dialog = document.createElement('dialog')
  dialog.id = 'privacy-dialog'
  dialog.setAttribute('aria-labelledby', 'privacy-title')
  dialog.innerHTML = `
    <form method="dialog">
      <header class="pv-head" tabindex="-1" autofocus>
        <span class="pv-badge">${ICONS.shield}</span>
        <h2 id="privacy-title">${T('Privacy', 'Confidentialité')}</h2>
      </header>
      <div class="pv-pair">
      ${yours}
      ${assistant}
      </div>
      ${audience}
      ${hosting}
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn primary" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  document.body.append(dialog)
  button.addEventListener('click', () => {
    dialog.showModal()
    // La fenêtre s'ouvre en haut, même si le focus va au bouton Fermer.
    dialog.scrollTop = 0
  })
}
