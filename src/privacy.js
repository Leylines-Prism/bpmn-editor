// Mention de confidentialité de la version en ligne : un lien « Confidentialité »
// en bas du canevas ouvre une petite fenêtre. Le nom de l'hébergeur se règle au
// build avec VITE_SITE_HOST (par exemple « GitHub Pages ») ; sans lui, le texte
// reste générique.

import { T } from './i18n/lang.js'
import { analyticsHost } from './analytics.js'

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
        <li>${analyticsHost
          ? T('<strong>Your work stays with you.</strong> Your diagrams, your settings and your API keys stay in your browser, on your device. They are never sent to us.',
              "<strong>Votre travail reste chez vous.</strong> Vos diagrammes, vos réglages et vos clés d'API restent dans votre navigateur, sur votre appareil. Ils ne nous sont jamais envoyés.")
          : T('<strong>Nothing is sent to us.</strong> This site has no server of its own behind the page: your diagrams, your settings and your API keys stay in your browser, on your device.',
              "<strong>Rien ne nous est envoyé.</strong> Ce site n'a pas de serveur à lui derrière la page : vos diagrammes, vos réglages et vos clés d'API restent dans votre navigateur, sur votre appareil.")}</li>
        <li>${T('<strong>With the AI assistant</strong>, your messages, the diagram and your API key go straight from your browser to the AI provider you chose (Anthropic, OpenAI…), which applies its own terms and privacy policy and bills you for the calls.',
                "<strong>Avec l'assistant IA</strong>, vos messages, le diagramme et votre clé d'API partent directement de votre navigateur vers le fournisseur d'IA choisi (Anthropic, OpenAI…), qui applique ses propres conditions et sa politique de confidentialité, et vous facture les appels.")}</li>
        <li>${hostText}</li>
        ${analyticsHost ? `<li>${T(`<strong>Audience measurement, without cookies.</strong> The page counts visits and a few actions (assistant opened or used, provider connected, diagram created, opened or exported, active time by range) with Umami. No cookie and no identifier are stored on your device, your IP address is not kept, and nothing about your diagrams, messages or keys is sent. The data is used only to measure the audience of this site and is not shared. Your browser's "Do Not Track" or "Global Privacy Control" setting turns this measurement off.`,
                `<strong>Mesure d'audience, sans cookie.</strong> La page compte les visites et quelques actions (assistant ouvert ou utilisé, fournisseur connecté, diagramme créé, ouvert ou exporté, temps actif par tranche) avec Umami. Aucun cookie ni identifiant n'est déposé sur votre appareil, votre adresse IP n'est pas conservée, et rien de vos diagrammes, messages ou clés n'est envoyé. Les données servent uniquement à mesurer l'audience du site et ne sont pas partagées. Le réglage « Do Not Track » ou « Global Privacy Control » de votre navigateur désactive cette mesure.`)}</li>` : ''}
        <li>${analyticsHost
          ? T('No third-party scripts: the page only loads its own files.',
              'Pas de script tiers : la page ne charge que ses propres fichiers.')
          : T('No cookies, no analytics, no third-party scripts: the page only loads its own files.',
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
