// Bascule du thème : automatique (réglage du système), clair ou sombre.
// Le choix est retenu dans ce navigateur seulement.

const KEY = 'bpmn-editor-theme'
const MODES = ['auto', 'light', 'dark']
const LABELS = { auto: 'Thème : auto', light: 'Thème : clair', dark: 'Thème : sombre' }

function read() {
  try { return MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'auto' } catch { return 'auto' }
}

function apply(mode, button) {
  if (mode === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = mode
  if (button) {
    button.title = LABELS[mode] + ' (cliquer pour changer)'
    button.setAttribute('aria-label', LABELS[mode])
  }
}

export function setupThemeToggle(button) {
  let mode = read()
  apply(mode, button)
  button?.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    try { localStorage.setItem(KEY, mode) } catch { /* stockage indisponible : le choix vaut pour cette page */ }
    apply(mode, button)
  })
}
