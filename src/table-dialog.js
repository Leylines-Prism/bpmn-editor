// Fenêtre « Ouvrir > Depuis un tableau » : coller des lignes copiées depuis Excel ou
// choisir un fichier .csv ou .xlsx, voir ce qui sera créé, puis créer le diagramme.
// La conversion se fait dans la page, sans IA (src/table-import.js).

import { T, num } from './i18n/lang.js'
import { addDialogClose } from './dialog-close.js'
import { readTable, tableToXml, templateRows } from './table-import.js'
import { parseDelimited, readSheetFile, rowsToXlsx } from './sheet-io.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// onCreate(xml, name) renvoie un message d'erreur, ou rien si le diagramme est ouvert.
// download(content, name, ext, type) enregistre le modèle .xlsx.
export function setupTableDialog({ openButton, onCreate, download }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'table-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Create a process from a table', 'Créer un processus depuis un tableau')}</h2>
      <p class="hint">${T(
        'One row per step, headers on the first row. Copy the rows in Excel (header included) and paste them below, or choose a .csv or .xlsx file. The conversion runs in the page, without AI.',
        'Une ligne par étape, les en-têtes sur la première ligne. Copiez les lignes dans Excel (en-tête compris) et collez-les ci-dessous, ou choisissez un fichier .csv ou .xlsx. La conversion se fait dans la page, sans IA.')}</p>
      <p class="table-columns">${T(
        'Columns: <code>ID</code>, <code>Description</code> (required), <code>Next step ID</code> (comma-separated), <code>Connector label</code>, <code>Shape type</code> (Start, Process, Decision, End…), <code>Function</code> (one lane per value). The Visio Data Visualizer headings are read as they are. Without IDs, rows follow one another.',
        'Colonnes : <code>ID</code>, <code>Description</code> (obligatoire), <code>Étape suivante</code> (séparées par des virgules), <code>Libellé du lien</code>, <code>Type</code> (Début, Tâche, Décision, Fin…), <code>Fonction</code> (un couloir par valeur). Les en-têtes de Visio Data Visualizer sont lus tels quels. Sans ID, les lignes s\'enchaînent.')}</p>
      <textarea id="table-text" spellcheck="false" placeholder="${esc(templateRows(T).slice(0, 3).map((r) => r.join('\t')).join('\n'))}"></textarea>
      <div class="table-preview" id="table-preview" aria-live="polite"></div>
      <p class="error" id="table-error" role="alert"></p>
      <div class="actions">
        <button type="button" class="btn" data-icon="open" id="table-file">${T('Choose a file…', 'Choisir un fichier…')}</button>
        <button type="button" class="btn" data-icon="save" id="table-template" title="${T('An Excel workbook with the columns and a short example', 'Un classeur Excel avec les colonnes et un court exemple')}">${T('Template (.xlsx)', 'Modèle (.xlsx)')}</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="table-cancel">${T('Cancel', 'Annuler')}</button>
        <button type="button" class="btn primary" id="table-create" disabled>${T('Create the diagram', 'Créer le diagramme')}</button>
      </div>
      <input type="file" id="table-input" accept=".csv,.tsv,.txt,.xlsx" hidden>
    </form>`
  addDialogClose(dialog)
  document.body.appendChild(dialog)

  const text = dialog.querySelector('#table-text')
  const preview = dialog.querySelector('#table-preview')
  const error = dialog.querySelector('#table-error')
  const create = dialog.querySelector('#table-create')
  const input = dialog.querySelector('#table-input')
  let rows = null
  let fileName = ''

  function show() {
    error.textContent = ''
    if (!rows || !rows.length) { preview.innerHTML = ''; create.disabled = true; return null }
    const table = readTable(rows, T)
    const gateways = table.steps.filter((s) => /Gateway$/.test(s.type)).length
    const summary = table.steps.length
      ? `<strong>${T(`${num(table.steps.length)} step(s)`, `${num(table.steps.length)} étape(s)`)}</strong>, ${T(`${num(table.flows.length)} link(s)`, `${num(table.flows.length)} lien(s)`)}, ${T(`${num(gateways)} decision(s)`, `${num(gateways)} décision(s)`)}${table.lanes.length ? `, ${T(`${num(table.lanes.length)} lane(s)`, `${num(table.lanes.length)} couloir(s)`)}${T(': ', ' : ')}${table.lanes.map(esc).join(', ')}` : ''}`
      : ''
    const items = [
      ...table.errors.map((e) => `<li class="err">${esc(e)}</li>`),
      ...table.warnings.map((w) => `<li class="warn">${esc(w)}</li>`),
    ]
    preview.innerHTML = summary + (items.length ? `<ul>${items.join('')}</ul>` : '')
    create.disabled = !!table.errors.length || !table.steps.length
    return table
  }

  text.addEventListener('input', () => {
    fileName = ''
    rows = text.value.trim() ? parseDelimited(text.value) : null
    show()
  })

  openButton.addEventListener('click', () => {
    error.textContent = ''
    dialog.showModal()
    text.focus()
  })
  // Ouverture avec des lignes déjà prêtes (depuis la grille rôles × tâches).
  function openWith(initial) {
    rows = initial
    fileName = ''
    text.value = initial.map((r) => r.join('\t')).join('\n')
    show()
    dialog.showModal()
    text.focus()
  }
  dialog.querySelector('#table-cancel').addEventListener('click', () => dialog.close())
  dialog.querySelector('#table-file').addEventListener('click', () => input.click())
  input.addEventListener('change', async () => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    try {
      rows = await readSheetFile(file)
      fileName = file.name.replace(/\.(csv|tsv|txt|xlsx)$/i, '')
      // Le contenu lu s'affiche dans le champ, pour le relire ou le corriger.
      text.value = rows.map((r) => r.join('\t')).join('\n')
      show()
    } catch (err) {
      rows = null
      show()
      error.textContent = T('Unreadable file: ', 'Fichier illisible : ') + err.message
    }
  })
  dialog.querySelector('#table-template').addEventListener('click', async () => {
    const bytes = await rowsToXlsx(templateRows(T), T('Process', 'Processus'))
    await download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      T('process table template', 'modèle de tableau de processus'), 'xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
  create.addEventListener('click', async () => {
    const table = show()
    if (!table || table.errors.length) return
    create.disabled = true
    const name = fileName || T('Process', 'Processus')
    const failure = await onCreate(tableToXml(table, { name, T }), name)
    create.disabled = false
    if (failure) {
      error.textContent = T('Creation failed: ', 'Création impossible : ') + failure
    } else {
      text.value = ''
      rows = null
      show()
      dialog.close()
    }
  })
  return { openWith }
}
