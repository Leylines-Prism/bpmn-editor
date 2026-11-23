// Lien « Feedback » en bas du canevas : où envoyer un retour, et comment joindre
// l'auteur. Les adresses se règlent au build (aucune n'est écrite en dur pour une
// personne) :
//   VITE_FEEDBACK_URL : les retours. Par défaut, les Issues GitHub du dépôt ;
//                       « none » pour ne pas en proposer.
//   VITE_CONTACT_URL  : un contact (profil LinkedIn, page…). Aucun par défaut.
//   FEEDBACK_EMAIL    : une adresse mail. Aucune par défaut. vite.config.js la range
//                       encodée dans le code ; le lien mailto n'est construit qu'au clic.
// S'il n'y a qu'un choix, le lien l'ouvre directement ; sinon, une petite fenêtre
// les propose.

import { T } from './i18n/lang.js'

const DEFAULT_FEEDBACK_URL = 'https://github.com/Leylines-Prism/bpmn-editor/issues'
/* global __FEEDBACK_EMAIL__ */
const ENCODED_EMAIL = typeof __FEEDBACK_EMAIL__ === 'string' ? __FEEDBACK_EMAIL__ : ''

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Seules les adresses https: sont acceptées ; « www.… » reçoit https://.
export function cleanUrl(value) {
  let url = String(value || '').trim()
  if (!url || url.toLowerCase() === 'none') return null
  if (/^www\./i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

export function decodeEmail(encoded) {
  if (!encoded) return null
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const email = [...new TextDecoder().decode(bytes)].reverse().join('')
    return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : null
  } catch {
    return null
  }
}

function contactChoice(url) {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host.endsWith('linkedin.com')
    ? { title: T('Connect with the author on LinkedIn', "Retrouver l'auteur sur LinkedIn"), detail: T('To keep in touch, or for a professional contact.', 'Pour garder le contact, ou pour un échange professionnel.') }
    : { title: T('Contact the author', "Contacter l'auteur"), detail: host }
}

export function setupFeedback({ container, env = import.meta.env, encodedEmail = ENCODED_EMAIL }) {
  const raw = env.VITE_FEEDBACK_URL
  const feedback = cleanUrl(raw === undefined || raw === '' ? DEFAULT_FEEDBACK_URL : raw)
  const contact = cleanUrl(env.VITE_CONTACT_URL)
  const hasEmail = !!decodeEmail(encodedEmail)

  const choices = []
  if (feedback) {
    choices.push({
      url: feedback,
      title: T('Report a bug or suggest an idea', 'Signaler un bug ou proposer une idée'),
      detail: feedback.startsWith('https://github.com/')
        ? T('On GitHub, where everyone can see what has already been reported. It needs a free GitHub account.', 'Sur GitHub, où chacun voit ce qui a déjà été signalé. Il faut un compte GitHub, gratuit.')
        : new URL(feedback).hostname,
    })
  }
  if (contact) choices.push({ url: contact, ...contactChoice(contact) })
  if (hasEmail) {
    choices.push({
      email: true,
      title: T('Send an e-mail', 'Envoyer un e-mail'),
      detail: T('Your mail app opens with a new message to the author.', "Votre messagerie s'ouvre avec un nouveau message pour l'auteur."),
    })
  }
  if (!choices.length) return

  // Le mailto est construit au moment du clic : l'adresse n'est jamais dans la page.
  const openEmail = () => {
    const email = decodeEmail(encodedEmail)
    if (email) location.href = `mailto:${email}?subject=${encodeURIComponent('BPMN editor')}`
  }
  const label = T('Feedback', 'Feedback')
  container.append(document.createTextNode(' · '))

  // Un seul choix : un simple lien.
  if (choices.length === 1) {
    const [choice] = choices
    const link = document.createElement(choice.email ? 'button' : 'a')
    link.id = 'feedback-link'
    link.textContent = label
    if (choice.email) Object.assign(link, { type: 'button', onclick: openEmail })
    else Object.assign(link, { href: choice.url, target: '_blank', rel: 'noopener' })
    container.append(link)
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'feedback-link'
  button.textContent = label
  container.append(button)

  const dialog = document.createElement('dialog')
  dialog.id = 'feedback-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Feedback', 'Feedback')}</h2>
      <p class="hint">${T('A bug, an idea, a question? Your feedback helps improve the editor.', 'Un bug, une idée, une question ? Vos retours aident à améliorer l\'éditeur.')}</p>
      ${choices
        .map((c) =>
          c.email
            ? `<button type="button" class="choice" data-email><strong>${esc(c.title)}</strong><span>${esc(c.detail)}</span></button>`
            : `<a class="choice" href="${esc(c.url)}" target="_blank" rel="noopener"><strong>${esc(c.title)}</strong><span>${esc(c.detail)}</span></a>`,
        )
        .join('')}
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  document.body.append(dialog)
  button.addEventListener('click', () => dialog.showModal())
  dialog.addEventListener('click', (e) => {
    const choice = e.target.closest('.choice')
    if (!choice) return
    if (choice.hasAttribute('data-email')) openEmail()
    dialog.close()
  })
}
