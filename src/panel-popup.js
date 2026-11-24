// Grande fenêtre d'édition du panneau de propriétés (bouton « Ouvrir l'éditeur en
// grand » d'un champ Documentation). @bpmn-io/properties-panel l'intitule avec le
// type technique de l'élément (« bpmn:Process / Documentation de l'élément ») et
// écrit en dur l'infobulle du bouton de fermeture (« Save and close »).
// À l'ouverture, on reprend le nom affiché en tête du panneau (ou son type, déjà
// traduit) et on traduit l'infobulle quand l'interface est en français.

import fr from './i18n/fr.js'
import { lang } from './i18n/lang.js'

function panelSubject() {
  const header = document.querySelector('#properties-panel .bio-properties-panel-header')
  if (!header) return ''
  const name = header.querySelector('.bio-properties-panel-header-label')?.textContent.trim()
  const type = header.querySelector('.bio-properties-panel-header-type')?.textContent.trim()
  return name || type || ''
}

function readableTitle(popup) {
  const title = popup.querySelector('.bio-properties-panel-popup__title')
  if (!title) return
  const text = title.textContent
  const cut = text.indexOf(' / ')
  const field = cut >= 0 ? text.slice(cut + 3) : text
  const subject = panelSubject()
  const value = subject ? `${subject} / ${field}` : field
  title.textContent = value
  title.title = value
}

function translateClose(popup) {
  const close = popup.querySelector('.bio-properties-panel-popup__close')
  if (!close) return
  const label = (lang === 'fr' && fr[close.title]) || close.title
  close.title = label
  close.setAttribute('aria-label', label)
}

export function setupPanelPopup(eventBus) {
  eventBus.on('feelPopup.opened', ({ domNode }) => {
    const popup = domNode?.querySelector('.bio-properties-panel-popup')
    if (!popup) return
    readableTitle(popup)
    translateClose(popup)
  })
}
