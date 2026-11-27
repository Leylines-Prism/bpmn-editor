// Simulation reliée aux tables de décision (« Lancer N jetons » de la carte de chaleur).
//
// Une passerelle exclusive qui suit directement une tâche de règle métier liée à une table
// répartit ses jetons selon la table : chaque règle compte pour une part égale, et chaque
// flux sortant reçoit les parts des règles dont la sortie lui correspond. Un flux correspond
// à une valeur par son nom (« élevé ») ou par sa condition (risque = "élevé"). Le flux par
// défaut de la passerelle reçoit les règles qu'aucun flux ne nomme.
//
// Rien ne change quand un flux de la passerelle porte déjà une probabilité, quand la
// passerelle ne suit pas une tâche liée, ou quand aucun flux ne correspond à une sortie :
// la simulation garde alors son comportement habituel. Ce module ne dépend pas de la page.

const isA = (bo, type) => !!bo?.$instanceOf?.(type)

// Valeur littérale d'une sortie FEEL : "texte", nombre, true/false. null sinon.
export function literal(text) {
  const v = String(text ?? '').trim()
  let m = /^"((?:[^"\\]|\\.)*)"$/.exec(v)
  if (m) return m[1].replace(/\\(.)/g, '$1')
  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  if (v === 'true' || v === 'false') return v
  return null
}

const norm = (s) => String(s ?? '').trim().replace(/^"(.*)"$/, '$1').trim().toLowerCase()

// Valeur qu'un flux attend, d'après sa condition (var = "x", var == "x", = "x", "x") ou son nom.
export function flowValue(flow, variable) {
  const body = (flow.conditionExpression?.body || '').trim().replace(/^\$\{(.*)\}$/, '$1').trim()
  if (body) {
    const m = /^(?:([\w.]+)\s*)?={1,2}\s*(.+)$/.exec(body)
    if (m && (!m[1] || !variable || m[1].toLowerCase() === variable.toLowerCase())) return norm(m[2])
    if (!/[=<>]/.test(body)) return norm(body)
  }
  return flow.name ? norm(flow.name) : null
}

// summary : résumé du modèle (summarize). ruleTasks : Map bo de tâche → id de décision.
// Renvoie hint(gateway, outgoing) → poids (somme 1) ou null.
export function routingHint(summary, linkOf, variableOf = () => '') {
  const byId = new Map((summary?.decisions || []).filter((d) => d.kind === 'table' && d.outputs.length && d.rules.length).map((d) => [d.id, d]))
  if (!byId.size) return null
  return (gateway, outgoing, incoming) => {
    if (!isA(gateway, 'bpmn:ExclusiveGateway')) return null
    if (outgoing.some((f) => f.get?.('bpmnpilot:probability') !== undefined && f.get('bpmnpilot:probability') !== null && f.get('bpmnpilot:probability') !== '')) return null
    const sources = (incoming || []).map((f) => f.sourceRef).filter((s) => isA(s, 'bpmn:BusinessRuleTask'))
    if (sources.length !== 1) return null
    const d = byId.get(linkOf(sources[0]))
    if (!d) return null
    const variable = variableOf(sources[0]) || d.outputs[0].name || ''
    const wanted = outgoing.map((f) => flowValue(f, variable))
    const fallback = outgoing.findIndex((f) => f === gateway.default)
    const weights = outgoing.map(() => 0)
    let counted = 0
    for (const rule of d.rules) {
      const value = literal(rule.outputs[0])
      const k = value === null ? -1 : wanted.findIndex((w) => w !== null && w === norm(value))
      if (k !== -1) { weights[k]++; counted++ } else if (fallback !== -1) { weights[fallback]++; counted++ }
    }
    if (!counted || !wanted.some((w, k) => w !== null && weights[k] > 0)) return null
    return weights.map((w) => w / counted)
  }
}
