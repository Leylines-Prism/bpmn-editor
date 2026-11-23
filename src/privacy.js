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

  const yours = section('device', T('What stays with you', 'Ce qui reste chez vous'), `
          <p>${T('Your diagrams, your settings and your API keys stay in your browser, on your device.',
                 'Vos diagrammes, vos réglages et vos clés d\'API restent dans votre navigateur, sur votre appareil.')}</p>
          <p>${T(`They are never sent to us or to the host of this site${hostName}.`,
                 `Ils ne sont jamais envoyés, ni à nous ni à l'hébergeur du site${hostName}.`)}</p>`)

  const assistant = section('assistant', T('With the AI assistant', "Avec l'assistant IA"), `
          <p>${T('Your messages, the diagram and your API key go straight from your browser to the provider you chose (Anthropic, OpenAI…).',
                 "Vos messages, le diagramme et votre clé d'API partent directement de votre navigateur chez le fournisseur choisi (Anthropic, OpenAI…).")}</p>
          <p>${T('It applies its own terms and privacy policy, and bills you for the calls.',
                 'Il applique ses propres conditions et sa politique de confidentialité, et vous facture les appels.')}</p>`)

  const rows = [
    [T('Visit', 'Visite'), T('page, site you came from, campaign tags of the link (utm_…), date and time', "page, site d'où vous venez, balises de campagne du lien (utm_…), date et heure")],
    [T('Device', 'Appareil'), T('browser, system, device type, screen size, language', "navigateur, système, type d'appareil, taille d'écran, langue")],
    [T('Place', 'Lieu'), T('country, region and city, deduced from the IP address', "pays, région et ville, déduits de l'adresse IP")],
    [T('Actions', 'Actions'), T('diagram created, opened or exported (the format), assistant opened or used, provider connected (its type), active time by range', 'diagramme créé, ouvert ou exporté (le format), assistant ouvert ou utilisé, fournisseur connecté (son type), temps actif par tranche')],
  ]
  const audience = analyticsHost ? section('chart', T('Audience measurement', "Mesure d'audience"), `
          <p>${T('A small measurement, <strong>without cookies</strong>, with Umami, to know whether the site is used. <strong>Your IP address is not recorded.</strong>',
                 'Une petite mesure, <strong>sans cookie</strong>, avec Umami, pour savoir si le site sert. <strong>Votre adresse IP n\'est pas enregistrée.</strong>')}</p>
          <dl class="pv-table">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          <ul class="pv-facts">
            <li>${T('Never the content of your diagrams, messages or keys.', 'Jamais le contenu de vos diagrammes, messages ou clés.')}</li>
            <li>${T('Visitors are counted with a hashed identifier, renewed every month.', 'Les visiteurs sont comptés par un identifiant haché, renouvelé chaque mois.')}</li>
            <li>${T('Kept 25 months at most, never shared.', 'Conservé 25 mois au plus, jamais partagé.')}</li>
            <li>${T('Turned off by your browser\'s "Do Not Track" or "Global Privacy Control" setting.', 'Désactivée par le réglage « Do Not Track » ou « Global Privacy Control » de votre navigateur.')}</li>
          </ul>`) : ''

  const hosting = section('server', T('Hosting', 'Hébergement'), `
          <p>${T(`Like any web host, the host of this site${hostName} keeps technical logs, such as your IP address and the pages requested.`,
                 `Comme tout hébergeur web, celui du site${hostName} garde des journaux techniques, comme votre adresse IP et les pages demandées.`)}${analyticsHost
            ? T(' The measurement server may keep short technical logs too.', ' Le serveur de mesure peut aussi garder de courts journaux techniques.')
            : ''}</p>
          <p>${analyticsHost
            ? T('No third-party scripts: the page only loads its own files.', 'Aucun script tiers : la page ne charge que ses propres fichiers.')
            : T('No cookies, no audience measurement, no third-party scripts: the page only loads its own files.', "Ni cookie, ni mesure d'audience, ni script tiers : la page ne charge que ses propres fichiers.")}</p>`)

  const dialog = document.createElement('dialog')
  dialog.id = 'privacy-dialog'
  dialog.setAttribute('aria-labelledby', 'privacy-title')
  dialog.innerHTML = `
    <form method="dialog">
      <header class="pv-head" tabindex="-1" autofocus>
        <span class="pv-badge">${ICONS.shield}</span>
        <div>
          <h2 id="privacy-title">${T('Privacy', 'Confidentialité')}</h2>
          <p class="pv-lead">${T('In short: your work and your keys stay with you.', 'En bref : votre travail et vos clés restent chez vous.')}</p>
        </div>
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
