// Bascule du thème : automatique (réglage du système), clair ou sombre.
// Le choix est retenu dans ce navigateur seulement.

import { T } from '../i18n/lang.js'

const KEY = 'bpmn-editor-theme'
const MODES = ['auto', 'light', 'dark']

function read() {
  try { return MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'auto' } catch { return 'auto' }
}

function apply(mode, button, t) {
  const labels = { auto: t('Theme: auto', 'Thème : auto'), light: t('Theme: light', 'Thème : clair'), dark: t('Theme: dark', 'Thème : sombre') }
  if (mode === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = mode
  if (button) {
    button.title = labels[mode] + t(' (click to change)', ' (cliquer pour changer)')
    button.setAttribute('aria-label', labels[mode])
  }
}

// t traduit les libellés : par défaut la langue de l'interface, l'aide passe celle de sa page.
export function setupThemeToggle(button, t = T) {
  let mode = read()
  apply(mode, button, t)
  button?.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    try { localStorage.setItem(KEY, mode) } catch { /* stockage indisponible : le choix vaut pour cette page */ }
    apply(mode, button, t)
  })
  // Un autre onglet (éditeur, aide, vitrine) a changé le thème : on le suit sans recharger.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return
    mode = read()
    apply(mode, button, t)
  })
}
