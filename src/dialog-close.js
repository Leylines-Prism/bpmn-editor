// Croix de fermeture en haut à droite d'une fenêtre (dialog) : le titre (premier h2 du
// formulaire) et la croix passent dans un en-tête collé en haut pendant le défilement,
// pour fermer sans descendre jusqu'aux boutons. La croix ferme comme Échap : sans valeur
// de retour, donc sans enregistrer ni envoyer.
import { T } from './i18n/lang.js'

export function addDialogClose(dialog) {
  const title = dialog.querySelector('form > h2')
  if (!title) return
  const head = document.createElement('div')
  head.className = 'dlg-head'
  title.replaceWith(head)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn icon-only dlg-close'
  button.setAttribute('aria-label', T('Close', 'Fermer'))
  button.title = T('Close (Esc)', 'Fermer (Échap)')
  button.textContent = '×'
  button.addEventListener('click', () => dialog.close())
  head.append(title, button)

  // À l'ouverture, le navigateur donne le focus au premier élément focusable, qui serait
  // désormais la croix. On le rend au premier champ de la fenêtre, comme avant la croix.
  const showModal = dialog.showModal.bind(dialog)
  dialog.showModal = () => {
    showModal()
    if (document.activeElement !== button) return
    const first = [...dialog.querySelectorAll(FOCUSABLE)].find((el) => el !== button && !el.disabled && el.offsetParent !== null)
    if (first) first.focus()
    else button.blur()
  }
}

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])'
