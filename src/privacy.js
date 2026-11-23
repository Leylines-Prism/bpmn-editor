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
        ${analyticsHost ? `<li>${T(`<strong>A small audience measurement, without cookies</strong>, with Umami, to know whether the site is used. Umami does not record your IP address: it only reads it during the visit to deduce an approximate location, then forgets it. No cookie and no identifier are stored on your device. What is recorded:`,
                `<strong>Une petite mesure d'audience, sans cookie</strong>, avec Umami, pour savoir si le site sert. Umami n'enregistre pas votre adresse IP : il la lit seulement pendant la visite pour en déduire une localisation approximative, puis l'oublie. Aucun cookie ni identifiant n'est déposé sur votre appareil. Ce qui est enregistré :`)}
          <ul>
            <li>${T('the visit: page address and title, the site you came from and the campaign tags of the link (utm_…), date and time;',
                    "la visite : adresse et titre de la page, le site d'où vous venez et les balises de campagne du lien (utm_…), date et heure ;")}</li>
            <li>${T('your device, as reported by the browser: browser, operating system, device type, screen size, language, and country, region and city deduced from the IP address;',
                    "votre appareil, tel que le navigateur le décrit : navigateur, système, type d'appareil, taille d'écran, langue, et pays, région et ville déduits de l'adresse IP ;")}</li>
            <li>${T('a few actions, without their content: diagram created, file opened (file or pasted XML), export (format only), assistant opened, assistant used (first message sent), provider connected (its type only: Anthropic, OpenAI, Ollama or compatible), and active time on the page by range (less than 1 min, 1 to 5, 5 to 15, 15 to 30, 30 min and more).',
                    "quelques actions, sans leur contenu : diagramme créé, fichier ouvert (fichier ou XML collé), export (le format seulement), assistant ouvert, assistant utilisé (premier message envoyé), fournisseur connecté (son type seulement : Anthropic, OpenAI, Ollama ou compatible), et temps actif sur la page par tranche (moins de 1 min, 1 à 5, 5 à 15, 15 à 30, 30 min et plus).")}</li>
          </ul>
          ${T(`Nothing of your diagrams, messages or keys is sent. To count visitors, the server computes a hashed identifier from the IP address and the browser, which cannot be turned back into the address and changes at least every month. Like any web server, the measurement server may keep short technical logs. The data is used only to measure the audience of this site, is not shared, and is kept for 25 months at most. Your browser's "Do Not Track" or "Global Privacy Control" setting turns this measurement off.`,
               `Rien de vos diagrammes, messages ou clés n'est envoyé. Pour compter les visiteurs, le serveur calcule un identifiant haché à partir de l'adresse IP et du navigateur, qui ne permet pas de retrouver l'adresse et change au moins chaque mois. Comme tout serveur web, le serveur de mesure peut garder de courts journaux techniques. Les données servent uniquement à mesurer l'audience du site, ne sont pas partagées et sont conservées 25 mois au plus. Le réglage « Do Not Track » ou « Global Privacy Control » de votre navigateur désactive cette mesure.`)}</li>` : ''}
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
