// Fenêtre « Ouvrir > Grille rôles × tâches » : pour un atelier, on écrit les rôles en
// colonnes, les tâches en lignes, et un clic place chaque tâche dans la colonne de son
// rôle. Les tâches s'enchaînent dans l'ordre des lignes ; une tâche qui finit par « ? »
// devient une décision. Le diagramme se construit comme depuis un tableau
// (src/table-import.js), sans IA. Pour des branches, « Continuer dans le tableau »
// reprend la grille dans la fenêtre Depuis un tableau.

import { T } from './i18n/lang.js'
import { addDialogClose } from './dialog-close.js'
import { readTable, tableToXml } from './table-import.js'

// Lignes de tableau tirées de la grille : en-tête puis une ligne par tâche, enchaînées
// dans l'ordre. Une décision (« … ? ») mène par « Oui » à la tâche suivante et par « Non »
// à une fin dans le même couloir, que l'on pourra ensuite rebrancher.
export function gridToRows(roles, tasks) {
  const header = ['ID', T('Description', 'Description'), T('Next step ID', 'Étape suivante'),
    T('Connector label', 'Libellé du lien'), T('Shape type', 'Type'), T('Function', 'Fonction')]
  const list = tasks.filter((t) => t.label.trim())
  const rows = [header]
  const extra = []
  list.forEach((t, i) => {
    const label = t.label.trim()
    const role = roles[t.role]?.trim() || ''
    const next = i + 1 < list.length ? String(i + 2) : ''
    if (/\?\s*$/.test(label)) {
      const no = `N${i + 1}`
      rows.push([String(i + 1), label, [next, no].filter(Boolean).join(','), next ? T('Yes,No', 'Oui,Non') : T('No', 'Non'), T('Decision', 'Décision'), role])
      extra.push([no, `${label.replace(/\s*\?\s*$/, '')}${T(': no', ' : non')}`, '', '', T('End', 'Fin'), role])
    } else {
      rows.push([String(i + 1), label, next, '', '', role])
    }
  })
  return [...rows, ...extra]
}

export function setupGridDialog({ openButton, onCreate, openTable }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'grid-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Roles × tasks grid', 'Grille rôles × tâches')}</h2>
      <p class="hint">${T(
        'For a workshop: name the roles in the columns, write the tasks in order, and click the cell of the role that performs each one. A task ending with "?" becomes a decision: Yes leads to the next task, No to an end you can reconnect. The diagram is built with one lane per role.',
        'Pour un atelier : nommez les rôles en colonnes, écrivez les tâches dans l\'ordre, et cliquez la case du rôle qui réalise chacune. Une tâche qui finit par « ? » devient une décision : Oui mène à la tâche suivante, Non à une fin que l\'on pourra rebrancher. Le diagramme se construit avec un couloir par rôle.')}</p>
      <div class="grid-wrap"><table class="grid-table"><thead></thead><tbody></tbody></table></div>
      <div class="grid-tools">
        <button type="button" class="btn" data-icon="new" id="grid-add-task">${T('Add a task', 'Ajouter une tâche')}</button>
        <button type="button" class="btn" data-icon="new" id="grid-add-role">${T('Add a role', 'Ajouter un rôle')}</button>
      </div>
      <p class="error" id="grid-error" role="alert"></p>
      <div class="actions">
        <button type="button" class="btn" data-icon="table" id="grid-to-table" title="${T('Add branches, next steps and labels in the table window', 'Ajouter branches, étapes suivantes et libellés dans la fenêtre du tableau')}">${T('Continue in the table…', 'Continuer dans le tableau…')}</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="grid-cancel">${T('Cancel', 'Annuler')}</button>
        <button type="button" class="btn primary" id="grid-create">${T('Create the diagram', 'Créer le diagramme')}</button>
      </div>
    </form>`
  addDialogClose(dialog)
  document.body.appendChild(dialog)

  const head = dialog.querySelector('thead')
  const body = dialog.querySelector('tbody')
  const error = dialog.querySelector('#grid-error')
  let roles = []
  let tasks = []

  const reset = () => {
    roles = [T('Requester', 'Demandeur'), T('Manager', 'Responsable'), '']
    tasks = [{ label: '', role: 0 }, { label: '', role: 1 }, { label: '', role: 1 }]
  }

  function input(value, placeholder, onInput, label) {
    const el = document.createElement('input')
    el.type = 'text'
    el.value = value
    el.placeholder = placeholder
    el.setAttribute('aria-label', label)
    el.addEventListener('input', () => onInput(el.value))
    return el
  }

  function render(focus) {
    head.replaceChildren()
    body.replaceChildren()
    const hr = document.createElement('tr')
    const corner = document.createElement('th')
    corner.textContent = T('Task \\ Role', 'Tâche \\ Rôle')
    hr.append(corner)
    roles.forEach((r, ri) => {
      const th = document.createElement('th')
      th.append(input(r, T(`Role ${ri + 1}`, `Rôle ${ri + 1}`), (v) => { roles[ri] = v }, T(`Role ${ri + 1}`, `Rôle ${ri + 1}`)))
      hr.append(th)
    })
    head.append(hr)
    tasks.forEach((t, ti) => {
      const tr = document.createElement('tr')
      const td = document.createElement('td')
      const field = input(t.label, T(`Task ${ti + 1}`, `Tâche ${ti + 1}`), (v) => { t.label = v }, T(`Task ${ti + 1}`, `Tâche ${ti + 1}`))
      // Entrée sur la dernière ligne : nouvelle tâche, dans le même rôle.
      field.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        if (ti === tasks.length - 1) { tasks.push({ label: '', role: t.role }); render(tasks.length - 1) }
        else body.querySelectorAll('td:first-child input')[ti + 1]?.focus()
      })
      td.append(field)
      tr.append(td)
      roles.forEach((_, ri) => {
        const cell = document.createElement('td')
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.className = 'grid-dot' + (t.role === ri ? ' on' : '')
        dot.setAttribute('aria-pressed', String(t.role === ri))
        dot.setAttribute('aria-label', T(`Task ${ti + 1} performed by role ${ri + 1}`, `Tâche ${ti + 1} réalisée par le rôle ${ri + 1}`))
        dot.addEventListener('click', () => { t.role = ri; render() })
        cell.append(dot)
        tr.append(cell)
      })
      body.append(tr)
    })
    if (focus !== undefined) body.querySelectorAll('td:first-child input')[focus]?.focus()
  }

  const rows = () => gridToRows(roles, tasks)

  openButton.addEventListener('click', () => {
    error.textContent = ''
    if (!tasks.length) reset()
    render()
    dialog.showModal()
    body.querySelector('input')?.focus()
  })
  dialog.querySelector('#grid-add-task').addEventListener('click', () => { tasks.push({ label: '', role: tasks.at(-1)?.role ?? 0 }); render(tasks.length - 1) })
  dialog.querySelector('#grid-add-role').addEventListener('click', () => { roles.push(''); render() })
  dialog.querySelector('#grid-cancel').addEventListener('click', () => dialog.close())
  dialog.querySelector('#grid-to-table').addEventListener('click', () => {
    dialog.close()
    openTable(rows())
  })
  dialog.querySelector('#grid-create').addEventListener('click', async () => {
    error.textContent = ''
    const table = readTable(rows(), T)
    if (table.errors.length) { error.textContent = table.errors[0]; return }
    const name = T('Process', 'Processus')
    const failure = await onCreate(tableToXml(table, { name, T }), name)
    if (failure) error.textContent = T('Creation failed: ', 'Création impossible : ') + failure
    else { reset(); dialog.close() }
  })
}
