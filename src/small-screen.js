// Petits écrans (téléphone, petite fenêtre) : l'éditeur reste utilisable pour regarder un
// diagramme, mais dessiner y est pénible. Sous le seuil, un bandeau le dit entre la barre
// d'outils et le canevas, avec un lien vers l'aide. Une fois fermé, il ne revient plus
// dans ce navigateur.

import { T } from './i18n/lang.js'

// En dessous, le panneau Processus et le canevas ne tiennent plus côte à côte.
export const SMALL_SCREEN = '(max-width: 899px), (max-height: 499px)'
const KEY = 'bpmn-editor-small-screen-dismissed'

export function isSmallScreen() {
  return !!window.matchMedia?.(SMALL_SCREEN).matches
}

function dismissed() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setupSmallScreenNotice({ before, canvas }) {
  if (!before || dismissed()) return
  const query = window.matchMedia?.(SMALL_SCREEN)
  if (!query) return

  const bar = document.createElement('div')
  bar.id = 'small-screen-notice'
  bar.setAttribute('role', 'status')
  bar.hidden = true
  const help = T('help.html#small-screens', 'aide.html#petits-ecrans')
  bar.innerHTML = `
    <p>${T(
      'This editor is designed for a computer screen. On a small screen you can view diagrams, but drawing is difficult.',
      "L'éditeur est conçu pour un écran d'ordinateur. Sur un petit écran, la consultation marche, la modélisation est difficile."
    )} <a href="${help}" target="_blank" rel="noopener">${T('Learn more', 'En savoir plus')}</a></p>
    <button type="button" class="close" aria-label="${T('Close this message', 'Fermer ce message')}" title="${T('Close', 'Fermer')}">×</button>`
  before.before(bar)

  function show(visible) {
    if (bar.hidden === !visible) return
    bar.hidden = !visible
    canvas?.resized()
  }

  const onChange = () => show(query.matches)
  show(query.matches)
  query.addEventListener('change', onChange)

  bar.querySelector('.close').addEventListener('click', () => {
    try { localStorage.setItem(KEY, '1') } catch { /* stockage indisponible : le bandeau reviendra à la prochaine visite */ }
    query.removeEventListener('change', onChange)
    show(false)
    bar.remove()
  })
}
