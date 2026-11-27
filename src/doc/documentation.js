// Lecture et écriture du champ Documentation, comme le panneau de propriétés : la
// documentation au format texte (textFormat absent ou « text/plain »). Le Markdown y est
// écrit tel quel, sans changer de format, pour que le panneau, les autres outils BPMN et
// les versions précédentes de l'éditeur continuent de le lire.

const PLAIN = 'text/plain'

const findDoc = (bo) => (bo?.get?.('documentation') || bo?.documentation || []).find((d) => (d.textFormat || PLAIN) === PLAIN)

// Texte de la documentation d'un objet métier (élément, processus), ou une chaîne vide.
export function docText(bo) {
  return findDoc(bo)?.text || ''
}

export function hasDoc(bo) {
  return !!docText(bo).trim()
}

export function setDocText({ element, bo, text, bpmnFactory, commandStack }) {
  const value = String(text ?? '')
  const docs = bo.get('documentation')
  const doc = findDoc(bo)
  if (doc) {
    if ((doc.text || '') === value) return
    if (value.trim()) {
      commandStack.execute('element.updateModdleProperties', { element, moddleElement: doc, properties: { text: value } })
    } else {
      commandStack.execute('element.updateModdleProperties', { element, moddleElement: bo, properties: { documentation: docs.filter((d) => d !== doc) } })
    }
    return
  }
  if (!value.trim()) return
  const created = bpmnFactory.create('bpmn:Documentation', { text: value })
  commandStack.execute('element.updateModdleProperties', { element, moddleElement: bo, properties: { documentation: [...docs, created] } })
}
