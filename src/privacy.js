// Mention de confidentialité de la version en ligne : un lien « Confidentialité »
// en bas du canevas ouvre une petite fenêtre. Le nom de l'hébergeur se règle au
// build avec VITE_SITE_HOST (par exemple « GitHub Pages ») ; sans lui, le texte
// reste générique.

import { T } from './i18n/lang.js'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function setupPrivacy({ container }) {
  const host = (import.meta.env.VITE_SITE_HOST || '').trim()

  const link = document.createElement('button')
  link.type = 'button'
  link.id = 'privacy-link'
  link.textContent = T('Privacy', 'Confidentialité')
  container.append(document.createTextNode(' · '), link)

  const dialog = document.createElement('dialog')
  dialog.id = 'privacy-dialog'
  const hostText = host
    ? T(`The host of this site, ${esc(host)}, serves the page and, like any web host, keeps technical logs such as your IP address and the pages requested.`,
        `L'hébergeur du site, ${esc(host)}, sert la page et, comme tout hébergeur web, garde des journaux techniques, comme votre adresse IP et les pages demandées.`)
    : T('The host of this site serves the page and, like any web host, keeps technical logs such as your IP address and the pages requested.',
        "L'hébergeur du site sert la page et, comme tout hébergeur web, garde des journaux techniques, comme votre adresse IP et les pages demandées.")
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Privacy', 'Confidentialité')}</h2>
      <ul>
        <li>${T('<strong>Nothing is sent to us.</strong> This site has no server of its own behind the page: your diagrams, your settings and your API keys stay in this browser, on this device.',
                "<strong>Rien ne nous est envoyé.</strong> Ce site n'a pas de serveur à lui derrière la page : vos diagrammes, vos réglages et vos clés d'API restent dans ce navigateur, sur cet appareil.")}</li>
        <li>${T('<strong>With the AI assistant</strong>, your messages, the diagram and your API key go straight from your browser to the AI provider you chose (Anthropic, OpenAI…), which applies its own terms and privacy policy and bills you for the calls.',
                "<strong>Avec l'assistant IA</strong>, vos messages, le diagramme et votre clé d'API partent directement de votre navigateur vers le fournisseur d'IA choisi (Anthropic, OpenAI…), qui applique ses propres conditions et sa politique de confidentialité, et vous facture les appels.")}</li>
        <li>${hostText}</li>
        <li>${T('No cookies, no analytics, no third-party scripts: the page only loads its own files.',
                'Pas de cookies, pas de mesure d\'audience, pas de script tiers : la page ne charge que ses propres fichiers.')}</li>
      </ul>
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  document.body.append(dialog)
  link.addEventListener('click', () => dialog.showModal())
}
