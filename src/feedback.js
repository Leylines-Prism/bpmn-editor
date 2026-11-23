// Lien « Feedback » en bas du canevas : où envoyer un retour, et comment joindre
// l'auteur. Les deux adresses se règlent au build (aucune n'est écrite en dur
// pour une personne) :
//   VITE_FEEDBACK_URL : les retours. Par défaut, les Issues GitHub du dépôt ;
//                       « none » pour ne pas en proposer.
//   VITE_CONTACT_URL  : un contact (profil LinkedIn, page, mailto:…). Aucun par défaut.
// S'il n'y a qu'une adresse, le lien l'ouvre directement ; s'il y en a deux, une
// petite fenêtre propose les deux.

import { T } from './i18n/lang.js'

const DEFAULT_FEEDBACK_URL = 'https://github.com/Leylines-Prism/bpmn-editor/issues'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Seules les adresses https: et mailto: sont acceptées ; « www.… » reçoit https://.
export function cleanUrl(value) {
  let url = String(value || '').trim()
  if (!url || url.toLowerCase() === 'none') return null
  if (/^www\./i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:' ? parsed.href : null
  } catch {
    return null
  }
}

function contactLabel(url) {
  if (url.startsWith('mailto:')) return { title: T('Write to the author', "Écrire à l'auteur"), detail: url.slice(7).split('?')[0] }
  const host = new URL(url).hostname.replace(/^www\./, '')
  if (host.endsWith('linkedin.com')) return { title: T('Connect with the author on LinkedIn', "Retrouver l'auteur sur LinkedIn"), detail: T('Questions, suggestions, or just to keep in touch.', 'Une question, une suggestion, ou simplement garder le contact.') }
  return { title: T('Contact the author', "Contacter l'auteur"), detail: host }
}

export function setupFeedback({ container, env = import.meta.env }) {
  const raw = env.VITE_FEEDBACK_URL
  const feedback = cleanUrl(raw === undefined || raw === '' ? DEFAULT_FEEDBACK_URL : raw)
  const contact = cleanUrl(env.VITE_CONTACT_URL)
  if (!feedback && !contact) return

  const sep = document.createTextNode(' · ')
  const label = T('Feedback', 'Feedback')
  const external = (url) => (url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"')

  // Une seule adresse : un simple lien.
  if (!feedback || !contact) {
    const url = feedback || contact
    const link = document.createElement('a')
    link.id = 'feedback-link'
    link.href = url
    if (!url.startsWith('mailto:')) Object.assign(link, { target: '_blank', rel: 'noopener' })
    link.textContent = label
    container.append(sep, link)
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'feedback-link'
  button.textContent = label
  container.append(sep, button)

  const who = contactLabel(contact)
  const dialog = document.createElement('dialog')
  dialog.id = 'feedback-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Feedback', 'Feedback')}</h2>
      <p class="hint">${T('A bug, an idea, a question? Your feedback helps improve the editor.', 'Un bug, une idée, une question ? Vos retours aident à améliorer l\'éditeur.')}</p>
      <a class="choice" href="${esc(feedback)}"${external(feedback)}>
        <strong>${T('Report a bug or suggest an idea', 'Signaler un bug ou proposer une idée')}</strong>
        <span>${feedback.startsWith('https://github.com/')
          ? T('On GitHub, where everyone can see what has already been reported. It needs a free GitHub account.', 'Sur GitHub, où chacun voit ce qui a déjà été signalé. Il faut un compte GitHub, gratuit.')
          : esc(new URL(feedback).hostname || feedback)}</span>
      </a>
      <a class="choice" href="${esc(contact)}"${external(contact)}>
        <strong>${esc(who.title)}</strong>
        <span>${esc(who.detail)}</span>
      </a>
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  document.body.append(dialog)
  button.addEventListener('click', () => dialog.showModal())
  dialog.addEventListener('click', (e) => { if (e.target.closest('a.choice')) dialog.close() })
}
