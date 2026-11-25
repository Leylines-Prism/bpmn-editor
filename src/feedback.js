// Bouton « Feedback » en bas du canevas : où envoyer un retour, et comment joindre
// l'auteur. Les adresses se règlent au build (aucune n'est écrite en dur pour une
// personne) :
//   VITE_FEEDBACK_URL : les retours. Par défaut, les Issues GitHub du dépôt ;
//                       « none » pour ne pas en proposer.
//   CONTACT_URL       : un contact (profil LinkedIn, page…). Aucun par défaut.
//   FEEDBACK_EMAIL    : une adresse mail. Aucune par défaut.
// Le contact et l'adresse mail sont chiffrés au build par vite.config.js (module
// d'obfuscation d'ALTCHA, voir seal.js) : au clic, le navigateur retrouve la clé par une
// preuve de travail (une seconde environ), puis ouvre le lien. Ni l'un ni l'autre
// n'est lisible dans le code de la page.
// Le bouton « Feedback » ouvre une petite fenêtre qui propose les choix réglés.
// La page vitrine (about.html) les montre aussi, en icônes.

import { T } from './i18n/lang.js'
import { SUPPORT_URL, CUP_ICON, trackSupportClicks } from './support.js'

const DEFAULT_FEEDBACK_URL = 'https://github.com/Leylines-Prism/bpmn-pilot/issues'
/* global __FEEDBACK_EMAIL__, __CONTACT_LINK__ */
// contact : { sealed, linkedin, host }, où seul sealed est chiffré (l'icône et le texte
// du choix en dépendent, pas le profil).
const SEALED = {
  email: typeof __FEEDBACK_EMAIL__ === 'string' ? __FEEDBACK_EMAIL__ : '',
  contact: typeof __CONTACT_LINK__ === 'object' && __CONTACT_LINK__ ? __CONTACT_LINK__ : null,
}

// Icônes des choix : marques GitHub et LinkedIn (tracés Simple Icons, CC0), et enveloppe.
const svg = (body, filled = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`
const ICONS = {
  github: svg('<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>'),
  linkedin: svg('<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>', false),
  idea: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>', false),
  link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', false),
}
const BUBBLE = svg('<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>', false)
const CHEVRON = svg('<path d="m9 6 6 6-6 6"/>', false)

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

// Donnée chiffrée au build : du JSON en base64, avec le défi et le texte chiffré.
// On vérifie sa forme sans la déchiffrer, pour savoir s'il faut proposer le choix.
export function isSealed(sealed) {
  if (!sealed) return false
  try {
    const data = JSON.parse(atob(sealed))
    return !!(data?.parameters?.salt && data?.cipher?.data)
  } catch {
    return false
  }
}

// Preuve de travail puis déchiffrement. Le module d'ALTCHA n'est chargé qu'à ce moment-là.
// Le résultat est vérifié : une adresse mail, ou une adresse https.
export async function reveal(sealed, kind) {
  if (!isSealed(sealed)) return null
  const { Obfuscation } = await import('./seal.js')
  const value = (await Obfuscation.deobfuscate(sealed)).trim()
  if (kind === 'mail') return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null
  return cleanUrl(value)
}

const CHECKING = {
  busy: () => T('Checking that you are not a robot…', "Vérification que vous n'êtes pas un robot…"),
  error: () => T('The check failed. Click to try again.', 'La vérification a échoué. Cliquez pour réessayer.'),
}

function contactChoice({ linkedin, host }) {
  return linkedin
    ? { icon: 'linkedin', title: T('Connect with the author on LinkedIn', "Retrouver l'auteur sur LinkedIn"), detail: T('To keep in touch, or for a professional contact.', 'Pour garder le contact, ou pour un échange professionnel.') }
    : { icon: 'link', title: T('Contact the author', "Contacter l'auteur"), detail: host }
}

// Les choix réglés au build : retours, contact, e-mail. Partagés par la fenêtre
// Feedback et par la page vitrine (about.html). Un choix chiffré porte sealed et kind
// ('link' ou 'mail'), et les textes busy et error montrés pendant la vérification.
export function contactChoices({ env = import.meta.env, sealed = SEALED } = {}) {
  const raw = env.VITE_FEEDBACK_URL
  const feedback = cleanUrl(raw === undefined || raw === '' ? DEFAULT_FEEDBACK_URL : raw)

  const choices = []
  if (feedback) {
    choices.push({
      url: feedback,
      icon: feedback.startsWith('https://github.com/') ? 'github' : 'idea',
      title: T('Report a bug or suggest an idea', 'Signaler un bug ou proposer une idée'),
      detail: feedback.startsWith('https://github.com/')
        ? T('Open an issue on GitHub.', 'Ouvrir un ticket sur GitHub.')
        : new URL(feedback).hostname,
    })
  }
  if (isSealed(sealed.contact?.sealed)) {
    choices.push({ sealed: sealed.contact.sealed, kind: 'link', ...contactChoice(sealed.contact) })
  }
  if (isSealed(sealed.email)) {
    choices.push({
      sealed: sealed.email,
      kind: 'mail',
      icon: 'mail',
      title: T('Send an e-mail', 'Envoyer un e-mail'),
      detail: T('Your mail app opens with a new message to the author.', "Votre messagerie s'ouvre avec un nouveau message pour l'auteur."),
    })
  }
  return choices.map((c) => ({ ...c, svg: ICONS[c.icon], ...(c.sealed ? { busy: CHECKING.busy(), error: CHECKING.error() } : {}) }))
}

// Ouvre un choix chiffré : le lien n'est construit qu'au clic, il n'est jamais dans la page.
// Pendant le calcul, le bouton porte data-state="busy" (puis "error" en cas d'échec) :
// un double clic ne relance pas le calcul.
export async function openSealed(button, { sealed, kind }) {
  if (button?.dataset.state === 'busy') return false
  if (button) { button.dataset.state = 'busy'; button.setAttribute('aria-busy', 'true') }
  // Lien : l'onglet s'ouvre tout de suite, pendant le clic, sinon le bloqueur de fenêtres
  // l'arrêterait une fois le calcul fini. Il reçoit l'adresse dès qu'elle est déchiffrée.
  const tab = kind === 'link' ? window.open('about:blank', '_blank') : null
  if (tab) tab.opener = null
  const start = performance.now()
  let value = null
  try {
    value = await reveal(sealed, kind)
  } catch (err) {
    console.warn('[feedback] contact not revealed:', err)
  }
  // L'état « Vérification… » reste visible au moins un instant, même sur une machine rapide.
  if (!tab) await new Promise((resolve) => setTimeout(resolve, Math.max(0, 600 - (performance.now() - start))))
  if (button) {
    button.removeAttribute('aria-busy')
    if (value) delete button.dataset.state
    else button.dataset.state = 'error'
  }
  if (!value) tab?.close()
  else if (kind === 'mail') location.href = `mailto:${value}?subject=${encodeURIComponent('BPMN editor')}`
  else if (tab) tab.location.href = value
  else window.open(value, '_blank', 'noopener')
  return !!value
}

export function setupFeedback({ container, env = import.meta.env, sealed = SEALED }) {
  const choices = contactChoices({ env, sealed })
  if (!choices.length) return

  // Bouton « Feedback » bien visible, en bas à droite du canevas.
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'feedback-button'
  button.innerHTML = `${BUBBLE}<span>${T('Feedback', 'Votre avis')}</span>`
  container.append(button)

  const dialog = document.createElement('dialog')
  dialog.id = 'feedback-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Feedback', 'Votre avis')}</h2>
      <p class="hint">${T('A bug, an idea, a question? Your feedback helps improve the editor.', 'Un bug, une idée, une question ? Vos retours aident à améliorer l\'éditeur.')}</p>
      ${choices
        .map((c, i) => {
          // Un choix chiffré a trois textes, montrés selon son état (voir openSealed).
          const detail = c.sealed
            ? `<span class="when-idle">${esc(c.detail)}</span><span class="when-busy">${esc(c.busy)}</span><span class="when-error">${esc(c.error)}</span>`
            : `<span>${esc(c.detail)}</span>`
          const inner = `<span class="choice-icon icon-${c.icon}">${ICONS[c.icon]}</span><span class="choice-text"><strong>${esc(c.title)}</strong>${detail}</span><span class="choice-go">${CHEVRON}</span>`
          return c.sealed
            ? `<button type="button" class="choice" data-sealed="${i}" aria-live="polite">${inner}</button>`
            : `<a class="choice" href="${esc(c.url)}" target="_blank" rel="noopener">${inner}</a>`
        })
        .join('')}
      <a class="choice" href="${SUPPORT_URL}" target="_blank" rel="noopener" data-support="avis"><span class="choice-icon icon-support">${CUP_ICON}</span><span class="choice-text"><strong>${T('Buy the author a coffee', "Offrir un café à l'auteur")}</strong><span>${T('If the editor is useful to you, a small thank-you on Ko-fi.', 'Si l\'éditeur vous rend service, un petit merci sur Ko-fi.')}</span></span><span class="choice-go">${CHEVRON}</span></a>
      <div class="actions">
        <span class="grow"></span>
        <button type="submit" class="btn" value="close">${T('Close', 'Fermer')}</button>
      </div>
    </form>`
  document.body.append(dialog)
  // Dernier choix : soutenir le projet sur Ko-fi (clic compté, voir src/support.js).
  trackSupportClicks(dialog)
  const open = () => { if (!dialog.open) dialog.showModal() }
  button.addEventListener('click', open)
  dialog.addEventListener('click', async (e) => {
    const choice = e.target.closest('.choice')
    if (!choice) return
    // Choix chiffré : la fenêtre reste ouverte pendant la vérification, et en cas d'échec.
    if (choice.hasAttribute('data-sealed')) {
      e.preventDefault()
      if (!(await openSealed(choice, choices[Number(choice.dataset.sealed)]))) return
    }
    dialog.close()
  })
  // Fenêtre refermée : un choix en échec retrouve son texte de départ.
  dialog.addEventListener('close', () => {
    for (const el of dialog.querySelectorAll('[data-sealed][data-state="error"]')) delete el.dataset.state
  })
  return { open }
}
