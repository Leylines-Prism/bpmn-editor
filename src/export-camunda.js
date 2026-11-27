// Exporter > BPMN pour Camunda 8 ou Camunda 7 (mode Expert).
//
// Le fichier reste le même diagramme BPMN 2.0, préparé pour le moteur visé :
// - la plateforme et sa version sont écrites sur bpmn:definitions, comme le fait
//   Camunda Modeler (modeler:executionPlatform), pour qu'il l'ouvre dans le bon mode
//   et applique ses propres contrôles ;
// - les processus sont exécutables ;
// - les flux sortants d'une passerelle exclusive ou inclusive reçoivent une condition
//   tirée des libellés, en FEEL (Camunda 8) ou en JUEL (Camunda 7) : la variable porte
//   le nom de la passerelle, la valeur celui du flux. Une condition écrite en clair
//   (« Avance < 3000 ») est traduite, une expression déjà au format du moteur est
//   gardée, le flux par défaut aussi ;
// - le champ Assigné à devient l'affectation des tâches utilisateur ;
// - Camunda 8 : les tâches utilisateur sont marquées zeebe:userTask (tâche gérée par
//   Camunda). Camunda 7 : durée de conservation de l'historique (camunda:historyTimeToLive),
//   exigée par les versions récentes, à 180 jours comme dans Camunda Modeler.
// Rien n'est inventé au-delà : les types de travail des tâches de service, les messages
// et les minuteries restent à régler dans Camunda Modeler, qui les signale.

export const CAMUNDA_TARGETS = {
  8: { platform: 'Camunda Cloud', version: '8.10.0' },
  7: { platform: 'Camunda Platform', version: '7.24.0' },
}

const MODELER_NS = 'http://camunda.org/schema/modeler/1.0'
const ZEEBE_NS = 'http://camunda.org/schema/zeebe/1.0'
const CAMUNDA_NS = 'http://camunda.org/schema/1.0/bpmn'

// Nom de variable tiré d'un libellé : « Commande complète ? » → commandeComplete.
export function variableName(label, fallback = 'decision') {
  const words = String(label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return fallback
  const name = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
  return /^[0-9]/.test(name) ? `${fallback}${name}` : name
}

const quoteFeel = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const quoteJuel = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

export function conditionFor(target, variable, value) {
  return target === 8 ? `=${variable} = ${quoteFeel(value)}` : `\${${variable} == ${quoteJuel(value)}}`
}

// Condition écrite en clair dans BPMN Pilot (« Avance < 3000 », « Montant >= 500 et
// Client = VIP ») traduite en FEEL ou en JUEL. Renvoie null si la règle n'est pas une
// suite de comparaisons simples : elle reste alors à écrire dans Camunda Modeler.
const OPS = [['<=', '<='], ['>=', '>='], ['≤', '<='], ['≥', '>='], ['!=', '!='], ['≠', '!='], ['<>', '!='], ['==', '='], ['=', '='], ['<', '<'], ['>', '>']]
export function translateCondition(target, text) {
  const parts = String(text ?? '').trim().split(/\s+(et|and|ou|or)\s+/i)
  const out = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) { out.push(/^(et|and)$/i.test(parts[i]) ? (target === 8 ? 'and' : '&&') : (target === 8 ? 'or' : '||')); continue }
    const part = parts[i]
    const op = OPS.find(([o]) => part.includes(o))
    if (!op) return null
    const [left, ...rest] = part.split(op[0])
    const right = rest.join(op[0]).trim().replace(/^["'«]\s*|\s*["'»]$/g, '')
    if (!left.trim() || !right) return null
    const variable = variableName(left, '')
    if (!variable) return null
    const number = right.replace(/\s/g, '').replace(',', '.')
    const value = /^-?\d+(\.\d+)?$/.test(number) ? number
      : /^(true|vrai|oui|yes)$/i.test(right) && op[1] === '=' ? 'true'
      : /^(false|faux|non|no)$/i.test(right) && op[1] === '=' ? 'false'
      : target === 8 ? quoteFeel(right) : quoteJuel(right)
    const symbol = target === 7 && op[1] === '=' ? '==' : op[1]
    out.push(`${variable} ${symbol} ${value}`)
  }
  return target === 8 ? `=${out.join(' ')}` : `\${${out.join(' ')}}`
}

const isEngineExpression = (target, body) => (target === 8 ? /^\s*=/.test(body) : /[$#]\{/.test(body))

function* walk(container) {
  for (const el of container.flowElements || []) {
    yield el
    if (el.flowElements) yield* walk(el)
  }
}

// moddle : instance de bpmn-moddle (celle du modeleur). xml : XML du diagramme.
// Renvoie { xml, summary: { processes, conditions, userTasks, left } }.
export async function toCamunda(moddle, xml, target) {
  const conf = CAMUNDA_TARGETS[target]
  if (!conf) throw new Error(`Unknown Camunda version: ${target}`)
  const { rootElement: defs } = await moddle.fromXML(xml, 'bpmn:Definitions')
  defs.$attrs['xmlns:modeler'] = MODELER_NS
  defs.$attrs['modeler:executionPlatform'] = conf.platform
  defs.$attrs['modeler:executionPlatformVersion'] = conf.version
  if (target === 8) defs.$attrs['xmlns:zeebe'] = ZEEBE_NS
  else defs.$attrs['xmlns:camunda'] = CAMUNDA_NS
  // Une version déjà marquée pour l'autre moteur est remplacée.
  delete defs.$attrs[target === 8 ? 'xmlns:camunda' : 'xmlns:zeebe']

  const summary = { processes: 0, conditions: 0, userTasks: 0, assignees: 0, left: 0 }
  const processes = defs.rootElements.filter((e) => e.$type === 'bpmn:Process')
  for (const process of processes) {
    process.isExecutable = true
    summary.processes++
    if (target === 7 && !process.$attrs['camunda:historyTimeToLive'] && !process.get?.('camunda:historyTimeToLive')) {
      process.$attrs['camunda:historyTimeToLive'] = '180'
    }
    for (const el of walk(process)) {
      // Assigné à : affectation de la tâche utilisateur dans le moteur.
      const assignee = (el.get?.('bpmnpilot:assignee') || '').trim()
      if (assignee && el.$type === 'bpmn:UserTask') {
        if (target === 7) { el.$attrs['camunda:assignee'] = assignee; summary.assignees++ }
        else {
          const ext = el.extensionElements || moddle.create('bpmn:ExtensionElements', { values: [] })
          if (!(ext.values || []).some((v) => /(^|:)assignmentDefinition$/i.test(v.$type))) {
            const attrs = { assignee }
            const def = moddle.getPackage?.('zeebe') ? moddle.create('zeebe:AssignmentDefinition', attrs) : moddle.createAny('zeebe:assignmentDefinition', ZEEBE_NS, attrs)
            ext.values = [...(ext.values || []), def]
            el.extensionElements = ext
            summary.assignees++
          }
        }
      }
      if (target === 8 && el.$type === 'bpmn:UserTask') {
        const ext = el.extensionElements || moddle.create('bpmn:ExtensionElements', { values: [] })
        const has = (ext.values || []).some((v) => /(^|:)userTask$/i.test(v.$type))
        if (!has) {
          const marker = moddle.getPackage?.('zeebe') ? moddle.create('zeebe:UserTask') : moddle.createAny('zeebe:userTask', ZEEBE_NS, {})
          ext.values = [...(ext.values || []), marker]
          el.extensionElements = ext
          summary.userTasks++
        }
      }
      if (el.$type !== 'bpmn:ExclusiveGateway' && el.$type !== 'bpmn:InclusiveGateway') continue
      const outgoing = el.outgoing || []
      if (outgoing.length < 2) continue
      const variable = variableName(el.name)
      for (const flow of outgoing) {
        if (flow === el.default) continue
        const written = (flow.conditionExpression?.body || '').trim()
        if (written) {
          if (isEngineExpression(target, written)) continue
          const translated = translateCondition(target, written)
          if (translated) { flow.conditionExpression.body = translated; summary.conditions++ } else summary.left++
          continue
        }
        const value = (flow.name || '').trim()
        if (!value) { summary.left++; continue }
        flow.conditionExpression = moddle.create('bpmn:FormalExpression', { body: conditionFor(target, variable, value) })
        summary.conditions++
      }
    }
  }
  const { xml: out } = await moddle.toXML(defs, { format: true })
  return { xml: out, summary }
}
