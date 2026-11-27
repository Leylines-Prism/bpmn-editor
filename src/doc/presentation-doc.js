// Fiches du mode Présentation : un clic sur un élément montre sa documentation dans une
// fiche, en haut à droite. Le bouton Fiches de la barre (ou la touche D) les active ou les
// coupe ; le choix est retenu. Échap ferme d'abord la fiche ouverte, puis la présentation.

import { T } from '../i18n/lang.js'
import { markdownToHtml, escapeHtml } from './markdown.js'
import { docText } from './documentation.js'
import { typeLabel } from '../process-report.js'

const KEY = 'bpmn-editor-pres-docs'

function readOn() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export function setupPresentationDoc({ modeler, bar, flash }) {
  const canvas = modeler.get('canvas')
  let on = readOn()
  let shown = null

  const card = document.createElement('aside')
  card.id = 'presentation-doc'
  card.hidden = true
  card.setAttribute('aria-live', 'polite')
  document.body.append(card)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn'
  button.dataset.act = 'docs'
  button.dataset.icon = 'doc'
  button.textContent = T('Sheets', 'Fiches')
  bar.querySelector('[data-act="out"]').before(button)

  function sync() {
    button.classList.toggle('active', on)
    button.setAttribute('aria-pressed', String(on))
    button.title = on
      ? T('Sheets on: click an element to show its documentation (D)', 'Fiches actives : un clic sur un élément montre sa documentation (D)')
      : T('Sheets off: clicking an element shows nothing (D)', 'Fiches coupées : un clic sur un élément ne montre rien (D)')
  }

  function hide() {
    card.hidden = true
    if (shown) canvas.removeMarker(shown, 'pres-doc-shown')
    shown = null
  }

  function show(element) {
    if (shown === element) { hide(); return }
    hide()
    const bo = element.businessObject
    const name = (bo.name || '').trim() || typeLabel(bo)
    const text = docText(bo)
    card.innerHTML = `
      <div class="pres-doc-head"><h3>${escapeHtml(name)}</h3><button type="button" class="pres-doc-close" aria-label="${T('Close the sheet', 'Fermer la fiche')}" title="${T('Close the sheet (Esc)', 'Fermer la fiche (Échap)')}">×</button></div>
      <div class="pres-doc-type">${escapeHtml(typeLabel(bo))}</div>
      <div class="doc-md">${text.trim() ? markdownToHtml(text) : `<p class="doc-empty">${T('No documentation for this element.', 'Pas de documentation pour cet élément.')}</p>`}</div>`
    card.querySelector('.pres-doc-close').addEventListener('click', hide)
    card.hidden = false
    card.scrollTop = 0
    shown = element
    canvas.addMarker(element, 'pres-doc-shown')
  }

  function toggle() {
    on = !on
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch {}
    sync()
    if (!on) hide()
    flash(on ? T('Sheets on: click an element', 'Fiches actives : cliquez sur un élément') : T('Sheets off', 'Fiches coupées'))
  }
  button.addEventListener('click', toggle)
  sync()

  return {
    // Clic sur un élément pendant la présentation. Vrai si une fiche s'est ouverte ou fermée.
    onElementClick(element) {
      if (!on) return false
      if (!element || element === canvas.getRootElement() || (element.type === 'label' && !element.labelTarget)) {
        if (shown) { hide(); return true }
        return false
      }
      const target = element.labelTarget || element
      // Fond d'une réserve ou d'un couloir sans documentation : le clic ferme la fiche.
      const container = /^bpmn:(Participant|Lane)$/.test(target.type)
      if (container && !docText(target.businessObject).trim()) {
        if (shown) { hide(); return true }
        return false
      }
      show(target)
      return true
    },
    onKey(e) {
      if (e.key === 'd' || e.key === 'D') { toggle(); return true }
      if (e.key === 'Escape' && shown) { hide(); return true }
      return false
    },
    exit: hide,
  }
}
