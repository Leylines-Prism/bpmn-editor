// Lien profond : l'adresse de la page suit le sous-processus ouvert (#<id du plan>).
// Entrer dans un sous-processus ou en sortir ajoute une entrée d'historique, donc le
// bouton Précédent remonte d'un niveau. Un import (nouveau diagramme, fichier ouvert,
// mise en page, IA) remplace l'entrée : il garde le niveau de l'adresse s'il existe
// encore, sinon il revient à la racine et nettoie l'adresse.
// D'après l'exemple deep-linking de bpmn-io/bpmn-js-examples.

const readId = () => decodeURIComponent(location.hash.slice(1))

function urlFor(id) {
  return location.pathname + location.search + (id ? '#' + encodeURIComponent(id) : '')
}

export function setupDeepLink(modeler) {
  const canvas = modeler.get('canvas')
  const eventBus = modeler.get('eventBus')

  // Racine du diagramme importé : à ce niveau, l'adresse ne porte pas de hash.
  let topRoot = null
  // Vrai pendant un import ou une navigation venue du navigateur : root.set ne doit
  // alors pas écrire dans l'historique.
  let silent = false

  const idOf = (root) => (root && root !== topRoot ? root.id : '')

  function write(root, push) {
    const id = idOf(root)
    if (id === readId()) return
    if (push) history.pushState({ root: id }, '', urlFor(id))
    else history.replaceState({ root: id }, '', urlFor(id))
  }

  // Ouvre le niveau dont l'id est dans l'adresse, ou la racine s'il n'existe pas.
  function openFromUrl() {
    const id = readId()
    const target = (id && canvas.findRoot(id)) || topRoot
    if (!target) return
    silent = true
    try {
      if (canvas.getRootElement() !== target) canvas.setRootElement(target)
    } finally {
      silent = false
    }
    write(target, false)
  }

  eventBus.on('import.parse.start', () => { silent = true })

  eventBus.on('import.done', ({ error }) => {
    silent = false
    if (error) return
    topRoot = canvas.getRootElement()
    openFromUrl()
  })

  eventBus.on('root.set', ({ element }) => {
    if (silent || !topRoot) return
    write(element, true)
  })

  window.addEventListener('popstate', openFromUrl)
}
