// Bouton « Installer » de la barre d'outils. Il n'apparaît que quand le navigateur propose
// d'installer l'application (événement beforeinstallprompt, Chrome et Edge), et disparaît une
// fois l'application installée. Safari et Firefox n'ont pas cet événement : l'aide dit comment
// faire chez eux.

import { track } from '../analytics.js'

export function setupInstallButton(button) {
  if (!button) return
  let offer = null
  let fromButton = false

  window.addEventListener('beforeinstallprompt', (event) => {
    // Le navigateur garde son icône dans la barre d'adresse. Sur Android, sa petite bannière
    // laisse la place au bouton.
    event.preventDefault()
    offer = event
    button.hidden = false
  })

  button.addEventListener('click', async () => {
    if (!offer) return
    const current = offer
    // Une proposition ne sert qu'une fois : le navigateur en refait une plus tard s'il le juge utile.
    offer = null
    button.hidden = true
    fromButton = true
    try {
      await current.prompt()
      const { outcome } = await current.userChoice
      track('installer-bouton', { choix: outcome === 'accepted' ? 'accepte' : 'refuse' })
      if (outcome !== 'accepted') fromButton = false
    } catch {
      fromButton = false
    }
  })

  window.addEventListener('appinstalled', () => {
    offer = null
    button.hidden = true
    track('app-installee', { source: fromButton ? 'bouton' : 'navigateur' })
    fromButton = false
  })
}

// Page ouverte dans la fenêtre de l'application installée (iPhone et iPad : navigator.standalone).
export function openedAsApp() {
  return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)
}
