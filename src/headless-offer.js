// Bannière « L'agent a dessiné … sans éditeur ouvert » en haut du canevas (version Docker, mode
// sans navigateur). Le serveur a enregistré le diagramme dans Mes diagrammes : Ouvrir le charge
// ici, et les appels suivants de l'agent arrivent alors dans cet onglet. Rien n'est fusionné :
// si le diagramme ouvert a des changements non enregistrés, Mes diagrammes le demande d'abord.

import { T } from './i18n/lang.js'

// container : le canevas. open(id) : ouvre le diagramme du serveur dans l'éditeur.
export function createHeadlessOffer({ container, open }) {
  const root = document.createElement('div')
  root.className = 'export-offer headless-offer'
  root.setAttribute('role', 'status')
  root.hidden = true
  const label = document.createElement('span')
  label.className = 'export-offer-label'
  const dot = document.createElement('span')
  dot.className = 'export-offer-dot'
  const text = document.createElement('span')
  label.append(dot, text)
  const openButton = document.createElement('button')
  openButton.type = 'button'
  openButton.className = 'export-offer-download'
  openButton.textContent = T('Open', 'Ouvrir')
  openButton.title = T('Open this diagram here, from My diagrams', 'Ouvrir ce diagramme ici, depuis Mes diagrammes')
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'export-offer-close'
  close.textContent = '×'
  close.title = T('Close', 'Fermer')
  close.setAttribute('aria-label', close.title)
  root.append(label, openButton, close)
  container.append(root)

  let current = null
  openButton.addEventListener('click', async () => {
    if (!current) return
    const opened = await open(current.id)
    if (opened !== false) root.hidden = true
  })
  close.addEventListener('click', () => {
    root.hidden = true
  })

  // { id, name } : le diagramme que le serveur vient d'enregistrer. Une nouvelle notification
  // remplace la précédente, et la bannière revient si elle avait été fermée.
  function show({ id, name }) {
    current = { id, name }
    text.textContent = T(`The agent is drawing “${name}” without an open editor`, `L'agent dessine « ${name} » sans éditeur ouvert`)
    root.title = T('Saved on the server, in My diagrams', 'Enregistré sur le serveur, dans Mes diagrammes')
    root.hidden = false
  }

  return { show }
}
