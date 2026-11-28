// Totaux d'une analyse de journal enregistrés dans le fichier .bpmn (bpmnpilot:LogSummary,
// dans les extensions du processus), à la demande de l'utilisateur : passages, durées,
// conformité et variantes. Jamais d'identifiant de cas ni de ressource (aggregateOnly).

const isA = (bo, type) => bo?.$instanceOf?.(type)

const processes = (definitions) => (definitions?.rootElements || []).filter((r) => isA(r, 'bpmn:Process'))

// Empreinte de la structure, sans les probabilités : appliquer les pourcentages du journal
// ne rend pas l'analyse caduque.
export function miningFingerprint(definitions) {
  const parts = []
  const walk = (container) => {
    for (const el of container.flowElements || []) {
      const row = [el.$type, el.id]
      if (isA(el, 'bpmn:SequenceFlow')) row.push(el.sourceRef?.id, el.targetRef?.id)
      parts.push(row.join('|'))
      if (isA(el, 'bpmn:SubProcess')) walk(el)
    }
  }
  for (const p of processes(definitions)) walk(p)
  let h = 0x811c9dc5
  const text = parts.sort().join('\n')
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export function readSaved(definitions) {
  for (const p of processes(definitions)) {
    const s = (p.extensionElements?.values || []).find((v) => isA(v, 'bpmnpilot:LogSummary'))
    if (!s?.data) continue
    try {
      const data = JSON.parse(s.data)
      return { source: s.source || data.source || '', date: s.date || '', fingerprint: s.fingerprint || '', data }
    } catch { return null }
  }
  return null
}

// Changements à appliquer : [{ bo, extensionElements }]. data null : retirer seulement.
export function savedUpdates(moddle, definitions, data, { source = '', fingerprint = '' } = {}) {
  const list = processes(definitions)
  const updates = []
  list.forEach((p, i) => {
    const values = p.extensionElements?.values || []
    const kept = values.filter((v) => !isA(v, 'bpmnpilot:LogSummary'))
    const add = data && i === 0
    if (kept.length === values.length && !add) return
    let next = kept
    if (add) {
      const s = moddle.create('bpmnpilot:LogSummary', { source, date: new Date().toISOString(), fingerprint, data: JSON.stringify(data) })
      next = [...kept, s]
    }
    updates.push({ bo: p, extensionElements: next.length ? moddle.create('bpmn:ExtensionElements', { values: next }) : undefined })
  })
  return updates
}
