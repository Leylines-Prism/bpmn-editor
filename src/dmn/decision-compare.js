// Comparaison de la fenêtre DMN : ce qui a changé dans les décisions depuis l'ouverture de la
// fenêtre, ou par rapport à un fichier .dmn. Les règles ajoutées ou modifiées sont marquées
// dans la table affichée. Lecture seule.

import { lang, T } from '../i18n/lang.js'
import { summarize } from './dmn-model.js'
import { diffModels } from './dmn-diff.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const MARK = { added: '+', removed: '−', changed: '~', moved: '↕' }

// compare = createCompare(container, { currentXml: async () => xml, baseline: () => xml,
//   activeDecision: () => id | null, onRules({ added, changed }) })
export function createCompare(container, { currentXml, baseline, activeDecision, onRules }) {
  let reference = null // { xml, label }
  container.innerHTML = `
    <div class="dmn-bench-head"><h3>${T('Compare', 'Comparer')}</h3>
      <p>${T('What changed in the decisions. Added and changed rules are marked in the table.', 'Ce qui a changé dans les décisions. Les règles ajoutées ou modifiées sont marquées dans la table.')}</p></div>
    <div class="dmn-bench-actions">
      <button type="button" class="btn" data-act="baseline">${T('Since this window opened', 'Depuis l\'ouverture')}</button>
      <button type="button" class="btn" data-act="file">${T('With a .dmn file…', 'Avec un fichier .dmn…')}</button>
      <input type="file" accept=".dmn,.xml" hidden />
    </div>
    <p class="dmn-bench-result" role="status" hidden></p>
    <ul class="dmn-diff-list" hidden></ul>`
  const out = container.querySelector('.dmn-bench-result')
  const list = container.querySelector('.dmn-diff-list')
  const input = container.querySelector('input[type=file]')

  function say(text, kind = '') {
    out.textContent = text
    out.className = `dmn-bench-result ${kind}`
    out.hidden = !text
  }

  async function refresh() {
    list.hidden = true
    onRules({ added: [], changed: [] })
    if (!reference) reference = { xml: baseline(), label: T('the version at opening', 'la version à l\'ouverture') }
    try {
      const { changes, rules } = diffModels(await summarize(reference.xml), await summarize(await currentXml()))
      const shown = activeDecision()
      const r = rules[shown] || { added: [], changed: [] }
      onRules({ added: r.added, changed: r.changed })
      if (!changes.length) { say(T(`No change compared with ${reference.label}.`, `Aucun changement par rapport à ${reference.label}.`), 'ok'); return }
      say(T(`${changes.length} change(s) compared with ${reference.label}.`, `${changes.length} changement(s) par rapport à ${reference.label}.`))
      list.innerHTML = changes.map((c) => `<li class="dmn-diff-${c.change}"><span aria-hidden="true">${MARK[c.change]}</span>${esc(lang === 'fr' ? c.fr : c.text)}</li>`).join('')
      list.hidden = false
    } catch (err) {
      say(T(`Cannot compare: ${err.message}`, `Comparaison impossible : ${err.message}`), 'error')
    }
  }

  container.querySelector('[data-act="baseline"]').addEventListener('click', () => { reference = null; refresh() })
  container.querySelector('[data-act="file"]').addEventListener('click', () => input.click())
  input.addEventListener('change', async () => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    reference = { xml: await file.text(), label: `« ${file.name} »` }
    if (lang !== 'fr') reference.label = `"${file.name}"`
    refresh()
  })
  return { refresh, reset: () => { reference = null } }
}
