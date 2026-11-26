// Refus d'être affiché dans le cadre d'un autre site (clickjacking).
// La version Docker l'interdit déjà par en-têtes (nginx-headers.conf). GitHub Pages ne permet
// pas d'en-têtes, et frame-ancestors n'est pas lu dans la balise meta : ce module le fait donc
// dans la page. Importé en premier par main.js : dans un cadre, il remplace la page par un lien
// qui l'ouvre dans son propre onglet, puis lève une erreur qui arrête l'évaluation de main.js.
// L'éditeur ne démarre pas, ne lit ni les diagrammes ni les clés, et rien ne peut être cliqué
// à l'insu de l'utilisateur.

function framed() {
  try {
    return window.self !== window.top
  } catch {
    // Accès à window.top refusé : la page est dans le cadre d'une autre origine.
    return true
  }
}

if (framed()) {
  const fr = document.documentElement.lang === 'fr'
  const link = document.createElement('a')
  link.href = location.href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = fr ? 'Ouvrir BPMN-Pilot dans son propre onglet' : 'Open BPMN-Pilot in its own tab'
  const box = document.createElement('p')
  box.style.cssText = 'font: 16px system-ui, sans-serif; margin: 2rem; text-align: center'
  box.append(link)
  const show = () => document.body.replaceChildren(box)
  if (document.body) show()
  else document.addEventListener('DOMContentLoaded', show, { once: true })
  throw new Error('BPMN-Pilot does not run inside a frame of another page.')
}
