// Masquer et afficher le panneau de propriétés (« Processus ») d'un clic.
// Le panneau se replie vers la droite et le canevas reprend la place libérée.
// L'état est retenu dans ce navigateur.

import { T } from './i18n/lang.js'

const KEY = 'bpmn-editor-properties-hidden'

function readHidden() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setupPanelToggle({ button, panel, canvas }) {
  if (!button || !panel) return

  function apply(hidden) {
    document.body.classList.toggle('properties-hidden', hidden)
    // Replié, le panneau sort du parcours au clavier et des lecteurs d'écran.
    panel.inert = hidden
    button.classList.toggle('active', !hidden)
    button.setAttribute('aria-expanded', String(!hidden))
    const label = hidden ? T('Show the Process panel', 'Afficher le panneau Processus') : T('Hide the Process panel', 'Masquer le panneau Processus')
    button.title = label
    button.setAttribute('aria-label', label)
  }

  // État initial sans animation.
  document.body.classList.add('properties-instant')
  apply(readHidden())
  canvas?.resized()
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('properties-instant')))

  // Le canevas recalcule sa zone visible une fois le repli terminé.
  panel.addEventListener('transitionend', (e) => {
    if (e.target === panel && e.propertyName === 'width') canvas?.resized()
  })

  button.addEventListener('click', () => {
    const hidden = !document.body.classList.contains('properties-hidden')
    try { localStorage.setItem(KEY, hidden ? '1' : '0') } catch { /* stockage indisponible : l'état vaut pour cette page */ }
    apply(hidden)
  })
}
