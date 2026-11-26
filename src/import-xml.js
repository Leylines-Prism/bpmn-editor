// Import d'un diagramme BPMN en XML : fichier (.bpmn ou .xml), glisser-déposer
// sur l'éditeur, ou XML collé dans une fenêtre.

import { layoutProcess } from 'bpmn-auto-layout'
import { fitView } from './fit-view.js'
import { T } from './i18n/lang.js'

// bpmn-auto-layout suit les listes incoming/outgoing des éléments, que beaucoup
// d'outils n'écrivent pas. On les reconstruit à partir des flux de séquence.
async function layoutWithoutDi(modeler, xml) {
  const moddle = modeler.get('moddle')
  const { rootElement } = await moddle.fromXML(xml, 'bpmn:Definitions')
  const visit = (container) => {
    for (const el of container.flowElements || []) {
      if (el.$instanceOf('bpmn:SequenceFlow')) {
        const { sourceRef, targetRef } = el
        if (sourceRef && !sourceRef.get('outgoing').includes(el)) sourceRef.get('outgoing').push(el)
        if (targetRef && !targetRef.get('incoming').includes(el)) targetRef.get('incoming').push(el)
      } else if (el.flowElements) {
        visit(el)
      }
    }
  }
  for (const root of rootElement.rootElements || []) {
    if (root.$instanceOf('bpmn:Process')) visit(root)
  }
  const { xml: completed } = await moddle.toXML(rootElement, { format: true })
  // bpmn-auto-layout 1.3 renvoie { xml, warnings } (et non plus le XML seul)
  const { xml: laidOut } = await layoutProcess(completed)
  return laidOut
}

// Traduit les erreurs de bpmn-js en message lisible.
function explain(err) {
  const msg = String(err && err.message || err)
  if (/unparsable content|unexpected end|missing start tag|non-whitespace before first tag|unclosed tag/i.test(msg)) {
    return 'le texte n\'est pas du XML BPMN lisible (' + msg.split('\n')[0] + ')'
  }
  if (/failed to parse document as <bpmn:Definitions>/i.test(msg)) {
    return T('the document is not a BPMN 2.0 diagram (root element <definitions> expected)', 'le document n\'est pas un diagramme BPMN 2.0 (élément racine <definitions> attendu)')
  }
  return msg
}

// Importe le XML dans l'éditeur. Un fichier sans partie graphique (processus seul,
// sans BPMNDiagram, fréquent quand il vient d'un moteur ou d'un script) est rangé
// automatiquement. Si l'import échoue, le diagramme précédent est rétabli.
// Renvoie { warnings, laidOut } ou lève une erreur au message en français.
export async function importDiagram(modeler, xml) {
  if (!xml || !xml.trim()) throw new Error('le XML est vide')

  let previous = null
  try { previous = (await modeler.saveXML({ format: true })).xml } catch {}

  try {
    let laidOut = false
    let result
    try {
      result = await modeler.importXML(xml)
    } catch (err) {
      if (!/no diagram to display/i.test(err.message)) throw err
      result = await modeler.importXML(await layoutWithoutDi(modeler, xml))
      laidOut = true
    }
    fitView(modeler.get('canvas'))
    return { warnings: result.warnings || [], laidOut }
  } catch (err) {
    console.error('Import error:', err)
    if (previous) {
      try {
        await modeler.importXML(previous)
        fitView(modeler.get('canvas'))
      } catch {}
    }
    throw new Error(explain(err), { cause: err })
  }
}

// Fenêtre « Importer XML » : coller du XML ou choisir un fichier.
// onImport(xml, name) fait l'import et renvoie un message d'erreur, ou rien si c'est réussi.
export function setupXmlDialog({ openButton, fileInput, onImport }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'xml-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Import BPMN XML', 'Importer du XML BPMN')}</h2>
      <p class="hint">${T('Paste the XML of a BPMN 2.0 diagram, or choose a .bpmn or .xml file. You can also drop a file straight onto the editor.', 'Collez le XML d\'un diagramme BPMN 2.0, ou choisissez un fichier .bpmn ou .xml. Vous pouvez aussi déposer un fichier directement sur l\'éditeur.')}</p>
      <textarea id="xml-text" spellcheck="false" placeholder="&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#10;&lt;definitions xmlns=&quot;http://www.omg.org/spec/BPMN/20100524/MODEL&quot; …&gt;"></textarea>
      <p class="error" id="xml-error" role="alert"></p>
      <div class="actions">
        <button type="button" class="btn" data-icon="open" id="xml-file">${T('Choose a file…', 'Choisir un fichier…')}</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="xml-cancel">${T('Cancel', 'Annuler')}</button>
        <button type="button" class="btn primary" id="xml-import">${T('Import', 'Importer')}</button>
      </div>
    </form>`
  document.body.appendChild(dialog)

  const text = dialog.querySelector('#xml-text')
  const error = dialog.querySelector('#xml-error')
  const importBtn = dialog.querySelector('#xml-import')

  openButton.addEventListener('click', () => {
    error.textContent = ''
    dialog.showModal()
    text.focus()
  })
  dialog.querySelector('#xml-cancel').addEventListener('click', () => dialog.close())
  dialog.querySelector('#xml-file').addEventListener('click', () => {
    dialog.close()
    fileInput.click()
  })
  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true
    error.textContent = ''
    const failure = await onImport(text.value, null)
    importBtn.disabled = false
    if (failure) {
      error.textContent = T('Import failed: ', 'Import impossible : ') + failure
    } else {
      text.value = ''
      dialog.close()
    }
  })
}

// Fenêtre « Code XML » du menu Exporter : l'inverse de « Importer XML ».
// Montre le XML du diagramme, à copier ou à télécharger en .xml.
// getXml() renvoie le XML, download(xml) l'enregistre.
export function setupXmlExport({ openButton, getXml, download }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'xml-export-dialog'
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${T('Export BPMN XML', 'Exporter le XML BPMN')}</h2>
      <p class="hint">${T('The diagram as BPMN 2.0 XML, to copy into another tool or save as an .xml file.', 'Le XML BPMN 2.0 du diagramme, à copier dans un autre outil ou à enregistrer en fichier .xml.')}</p>
      <textarea id="xml-export-text" spellcheck="false" readonly></textarea>
      <p class="status" id="xml-export-status" role="status"></p>
      <div class="actions">
        <button type="button" class="btn" data-icon="save" id="xml-export-download">${T('Download .xml', 'Télécharger .xml')}</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="xml-export-close">${T('Close', 'Fermer')}</button>
        <button type="button" class="btn primary" id="xml-export-copy">${T('Copy', 'Copier')}</button>
      </div>
    </form>`
  document.body.appendChild(dialog)

  const text = dialog.querySelector('#xml-export-text')
  const status = dialog.querySelector('#xml-export-status')

  openButton.addEventListener('click', async () => {
    status.textContent = ''
    text.value = await getXml()
    dialog.showModal()
    text.scrollTop = 0
  })
  dialog.querySelector('#xml-export-close').addEventListener('click', () => dialog.close())
  dialog.querySelector('#xml-export-download').addEventListener('click', () => download(text.value))
  dialog.querySelector('#xml-export-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text.value)
      status.textContent = T('XML copied to the clipboard.', 'XML copié dans le presse-papiers.')
    } catch {
      // Presse-papiers refusé : on sélectionne le texte pour un Ctrl+C.
      text.focus()
      text.select()
      status.textContent = T('Automatic copy failed: the text is selected, press Ctrl+C.', 'Copie automatique impossible : le texte est sélectionné, faites Ctrl+C.')
    }
  })
}

// Glisser-déposer d'un fichier .bpmn ou .xml n'importe où sur la page.
export function setupFileDrop({ onFile }) {
  let depth = 0
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return
    depth++
    document.body.classList.add('drop-target')
  })
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (!depth) document.body.classList.remove('drop-target')
  })
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault()
  })
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    document.body.classList.remove('drop-target')
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  })
}
