// Pages d'aide : bouton « Copier » sur chaque exemple de prompt (.prompt-text).
// Le texte copié est celui affiché, espaces regroupés, prêt à coller dans l'assistant.
const fr = document.documentElement.lang === 'fr'
const LABEL = fr ? 'Copier' : 'Copy'
const DONE = fr ? 'Copié' : 'Copied'
const FAILED = fr ? 'Sélectionnez le texte' : 'Select the text'

const ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'

async function copy(text, source) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Repli quand le presse-papiers asynchrone est refusé : sélection puis commande copier
    const range = document.createRange()
    range.selectNodeContents(source)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }
}

for (const text of document.querySelectorAll('.prompt-text')) {
  const title = text.parentElement.querySelector('.prompt-title')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'copy-prompt'
  button.innerHTML = `${ICON}<span>${LABEL}</span>`
  if (title) button.setAttribute('aria-label', `${LABEL}${fr ? ' : ' : ': '}${title.textContent}`)
  const label = button.querySelector('span')
  let timer
  button.addEventListener('click', async () => {
    const ok = await copy(text.textContent.replace(/\s+/g, ' ').trim(), text)
    label.textContent = ok ? DONE : FAILED
    button.classList.toggle('done', ok)
    clearTimeout(timer)
    timer = setTimeout(() => {
      label.textContent = LABEL
      button.classList.remove('done')
    }, 2000)
  })
  ;(title || text).insertAdjacentElement(title ? 'afterend' : 'beforebegin', button)
}
