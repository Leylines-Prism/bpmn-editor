// Infobulles du panneau Processus restées en anglais : certains composants de
// @bpmn-io/properties-panel ne reçoivent pas le service de traduction et
// écrivent leurs textes en dur (« Toggle section », « Section contains edits »…).
// Ce module les traduit au vol avec le même dictionnaire, quand l'interface est
// en français.

import fr from './fr.js'
import { lang } from './lang.js'

const LIST = /^List contains (\d+) items?$/

function translateTitle(el) {
  const title = el.getAttribute('title')
  if (!title) return
  const list = LIST.exec(title)
  const value = list ? `La liste contient ${list[1]} élément${list[1] === '1' ? '' : 's'}` : fr[title]
  if (value && value !== title) el.setAttribute('title', value)
}

// Texte « Opened in editor » du champ dont le contenu est ouvert dans la grande
// fenêtre : le composant de zone de texte ne reçoit pas le service de traduction.
const PLACEHOLDER = '[class$="__open-popup-placeholder"]'

function translateText(el) {
  const value = fr[el.textContent]
  if (value) el.textContent = value
}

function translateTree(root) {
  if (root.nodeType !== 1) return
  if (root.hasAttribute('title')) translateTitle(root)
  if (root.matches(PLACEHOLDER)) translateText(root)
  root.querySelectorAll(PLACEHOLDER).forEach(translateText)
  root.querySelectorAll('[title]').forEach(translateTitle)
  root.querySelectorAll('.bio-properties-panel-add-entry-label').forEach(translateText)
}

export function translatePanelTitles(container) {
  if (lang !== 'fr' || !container) return
  translateTree(container)
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') translateTitle(m.target)
      else m.addedNodes.forEach(translateTree)
    }
  }).observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] })
}
