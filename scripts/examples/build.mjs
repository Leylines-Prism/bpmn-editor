// Génère les exemples du fil rouge de l'aide, en français et en anglais, dans public/examples/.
// Lancer : node scripts/examples/build.mjs
// Les textes et le nom de l'entreprise sont dans story.mjs. Le rapport de processus (PDF)
// et les captures se font ensuite dans le navigateur : node scripts/examples/browser.mjs.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { layoutProcess } from 'bpmn-auto-layout'
import { BpmnModdle } from 'bpmn-moddle'
import zeebe from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' }
import bpmnpilot from '../../src/bpmn-pilot-moddle.json' with { type: 'json' }
import { setDecisionTable, parseDmn } from '../../src/dmn/dmn-model.js'
import { tableToRows } from '../../src/dmn/decision-sheet.js'
import { rowsToCsv, rowsToXlsx } from '../../src/sheet-io.js'
import { readTable } from '../../src/table-import.js'
import { toCamunda } from '../../src/export-camunda.js'
import * as S from './story.mjs'

const OUT = 'public/examples'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = (s) => esc(s).replace(/\n/g, '&#10;')

// Fichiers, par langue : nom de fichier → contenu.
export const FILES = {
  sketch: { fr: '01-croquis.bpmn', en: '01-sketch.bpmn' },
  lanes: { fr: '02-couloirs.bpmn', en: '02-lanes.bpmn' },
  styled: { fr: '03-mise-en-forme.bpmn', en: '03-styled.bpmn' },
  broken: { fr: '04-a-corriger.bpmn', en: '04-to-fix.bpmn' },
  table: { fr: '05-etapes.csv', en: '05-steps.csv' },
  tableXlsx: { fr: '05-etapes.xlsx', en: '05-steps.xlsx' },
  documented: { fr: '06-documente.bpmn', en: '06-documented.bpmn' },
  brief: { fr: '07-cahier-des-charges.md', en: '07-requirements.md' },
  v2: { fr: '08-v2-change.bpmn', en: '08-v2-change.bpmn' },
  simulation: { fr: '09-simulation.bpmn', en: '09-simulation.bpmn' },
  report: { fr: '10-rapport.pdf', en: '10-report.pdf' },
  aiPotential: { fr: '11-potentiel-ia.bpmn', en: '11-ai-potential.bpmn' },
  compliance: { fr: '12-conformite.bpmn', en: '12-compliance.bpmn' },
  decision: { fr: '13-decision.bpmn', en: '13-decision.bpmn' },
  dmn: { fr: '13-niveau-approbation.dmn', en: '13-approval-level.dmn' },
  dmnXlsx: { fr: '13-niveau-approbation.xlsx', en: '13-approval-level.xlsx' },
  camunda: { fr: '14-camunda-8.bpmn', en: '14-camunda-8.bpmn' },
  mcp: { fr: '15-prompt-agent-mcp.md', en: '15-mcp-agent-prompt.md' },
}

// ── Construction d'un modèle ──

const TAG = (type) => `bpmn:${type}`

// Ajoute une passerelle de convergence devant chaque nœud (hors passerelle et fin) qui reçoit
// plusieurs flux, comme l'import de tableau, pour éviter les jonctions implicites.
function withMerges(steps, skip = []) {
  const out = steps.map((s) => ({ ...s, next: s.next.map((n) => (Array.isArray(n) ? [...n] : [n])) }))
  for (const s of [...out]) {
    if (s.type.endsWith('Gateway') || s.type === 'endEvent' || skip.includes(s.key)) continue
    const ins = out.filter((o) => o.next.some(([t]) => t === s.key))
    if (ins.length < 2) continue
    const merge = { key: `${s.key}_merge`, type: 'exclusiveGateway', lane: s.lane, name: S.L('', ''), next: [[s.key]] }
    for (const o of ins) for (const n of o.next) if (n[0] === s.key) n[0] = merge.key
    out.splice(out.indexOf(s), 0, merge)
  }
  return out
}

// Un processus : nœuds et flux, en XML. opts : lang, prefix, extra(step) → attributs, docs,
// probabilities, children (contenu des sous-processus), decision (lien DMN).
function processXml(steps, lang, opts = {}) {
  const p = opts.prefix || ''
  const id = (k) => `${p}${k}`
  const flows = []
  for (const s of steps) {
    s.next.forEach(([target, label, probability], i) => {
      flows.push({ id: `${p}Flow_${s.key}_${i + 1}`, from: s.key, to: target, label: label?.[lang] || '', probability })
    })
  }
  const lines = []
  for (const s of steps) {
    const ins = flows.filter((f) => f.to === s.key).map((f) => `<bpmn:incoming>${f.id}</bpmn:incoming>`)
    const outs = flows.filter((f) => f.from === s.key).map((f) => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`)
    const extra = opts.extra ? opts.extra(s) : ''
    const doc = opts.docs?.[s.key]?.[lang] ? [`<bpmn:documentation>${esc(opts.docs[s.key][lang])}</bpmn:documentation>`] : []
    const ext = opts.extension ? opts.extension(s) : ''
    const message = s.message ? ['<bpmn:messageEventDefinition />'] : []
    const name = s.name?.[lang] ? ` name="${attr(s.name[lang])}"` : ''
    const children = s.type === 'subProcess' && opts.children?.[s.key] ? [opts.children[s.key]] : []
    lines.push(`<${TAG(s.type)} id="${id(s.key)}"${name}${extra}>`, ...doc, ...(ext ? [ext] : []), ...ins, ...outs, ...message, ...children, `</${TAG(s.type)}>`)
  }
  for (const f of flows) {
    const prob = opts.probabilities && f.probability !== undefined ? ` bpmnpilot:probability="${f.probability}"` : ''
    lines.push(`<bpmn:sequenceFlow id="${f.id}"${f.label ? ` name="${attr(f.label)}"` : ''} sourceRef="${id(f.from)}" targetRef="${id(f.to)}"${prob} />`)
  }
  return lines.join('\n')
}

function laneSetXml(steps, lanes, lang, prefix = '') {
  const keys = Object.keys(lanes)
  return ['<bpmn:laneSet id="' + prefix + 'LaneSet">',
    ...keys.map((k) => [`<bpmn:lane id="${prefix}Lane_${k}" name="${attr(lanes[k][lang])}">`,
      ...steps.filter((s) => s.lane === k).map((s) => `<bpmn:flowNodeRef>${prefix}${s.key}</bpmn:flowNodeRef>`), '</bpmn:lane>'].join('\n')),
    '</bpmn:laneSet>'].join('\n')
}

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnpilot="https://bpmn.leylines.fr/schema/bpmn-pilot/1.0" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"'
const wrap = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions ${NS} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n${body}\n</bpmn:definitions>\n`

async function layout(xml) {
  const { xml: out } = await layoutProcess(xml)
  return out
}

// Réécrit le XML par bpmn-moddle (avec les extensions de l'éditeur et de Camunda), pour un
// fichier propre et identique à ce que l'éditeur enregistre.
const moddle = new BpmnModdle({ bpmnpilot, zeebe })
async function tidy(xml) {
  const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions')
  if (warnings.length) throw new Error(warnings.map((w) => w.message).join('\n'))
  const { xml: out } = await moddle.toXML(rootElement, { format: true })
  return out
}

// Couleurs (exemple 3 et suivants) : sur les formes rangées, par couloir.
function colorize(xml, steps, prefix = '') {
  const byId = new Map(steps.map((s) => [`${prefix}${s.key}`, s]))
  xml = xml.replace('<bpmn:definitions ', '<bpmn:definitions xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" ')
  return xml.replace(/<bpmndi:BPMNShape ([^>]*?)bpmnElement="([^"]+)"/g, (m, before, el) => {
    const s = byId.get(el)
    if (!s || !s.lane || s.type.endsWith('Event') || s.type.endsWith('Gateway')) return m
    const c = s.type === 'manualTask' ? S.MANUAL_COLOR : S.LANE_COLORS[s.lane] || S.LANE_COLORS.pm
    return `<bpmndi:BPMNShape ${before}bpmnElement="${el}" bioc:stroke="${c.stroke}" bioc:fill="${c.fill}" color:background-color="${c.fill}" color:border-color="${c.stroke}"`
  })
}

const detailAttrs = (details, lang) => (s) => {
  const d = details[s.key]
  if (!d) return ''
  return ['assignee', 'systems', 'accountable', 'consulted', 'informed']
    .filter((k) => d[k]?.[lang]).map((k) => ` bpmnpilot:${k}="${attr(d[k][lang])}"`).join('')
}
const docsOf = (details) => Object.fromEntries(Object.entries(details).filter(([, d]) => d.doc).map(([k, d]) => [k, d.doc]))

// ── Exemples ──

async function sketch(lang) {
  const steps = withMerges(S.STEPS_SKETCH)
  return tidy(await layout(wrap(`<bpmn:process id="Process_sketch" name="${attr(S.L('Mise en service SD-WAN', 'SD-WAN onboarding')[lang])}" isExecutable="false">\n${processXml(steps, lang)}\n</bpmn:process>`)))
}

async function v1(lang, { colors = false, details = false, broken = false } = {}) {
  // Deux erreurs à corriger : deux flux qui entrent dans « Basculer les sites » sans
  // passerelle (jonction implicite), et une tâche reliée à rien.
  const steps = withMerges(S.STEPS_V1, broken ? ['cutover'] : [])
  if (broken) {
    steps.push({ key: 'licences', type: 'userTask', lane: 'pm', name: S.L('Commander les liens DIA', 'Order the DIA circuits'), next: [] })
  }
  const body = processXml(steps, lang, details ? { extra: detailAttrs(S.DETAILS_V1, lang), docs: docsOf(S.DETAILS_V1) } : {})
  const xml = wrap(`<bpmn:collaboration id="Collaboration_1">
<bpmn:participant id="Participant_1" name="${attr(`${S.COMPANY} · ${S.L('Mise en service SD-WAN', 'SD-WAN onboarding')[lang]}`)}" processRef="Process_onboarding" />
</bpmn:collaboration>
<bpmn:process id="Process_onboarding" isExecutable="false">
${laneSetXml(steps, S.LANES_V1, lang)}
${body}
</bpmn:process>`)
  let out = await layout(xml)
  if (colors) out = colorize(out, steps)
  return tidy(out)
}

// Version 2 et ses étapes en mode Expert, cumulées : level 0 (v2), 1 probabilités,
// 2 potentiel d'IA, 3 conformité, 4 table de décision.
async function v2(lang, level, dmnXml = '') {
  const steps = withMerges(S.STEPS_V2)
  const client = withMerges(S.CLIENT_STEPS)
  const change = withMerges(S.CHANGE_STEPS)
  const details = Object.fromEntries(Object.entries(S.DETAILS_V1).filter(([k]) => steps.some((s) => s.key === k)))
  const extra = (s) => {
    let a = detailAttrs(details, lang)(s)
    if (level >= 2 && S.AI_POTENTIAL[s.key]) a += ` bpmnpilot:aiPotential="${S.AI_POTENTIAL[s.key][0]}" bpmnpilot:aiPotentialReason="${attr(S.AI_POTENTIAL[s.key][1][lang])}"`
    if (level >= 3 && S.COMPLIANCE[s.key]) for (const k of ['risks', 'controls', 'requirements']) a += ` bpmnpilot:${k}="${attr(S.COMPLIANCE[s.key][k][lang])}"`
    return a
  }
  const decisionId = 'Decision_approvalLevel'
  const outName = lang === 'fr' ? S.DECISION.output.name : S.DECISION.output.nameEn
  const changeBody = processXml(change, lang, {
    probabilities: false,
    extra: (s) => (level >= 4 && s.key === 'ch_level' ? ` bpmnpilot:decisionRef="${decisionId}"` : ''),
    extension: (s) => (level >= 4 && s.key === 'ch_level' ? `<bpmn:extensionElements><zeebe:calledDecision decisionId="${decisionId}" resultVariable="${outName}" /></bpmn:extensionElements>` : ''),
  })
  // Les flux après la table portent le niveau qu'elle rend : la simulation les suit.
  const changeXml = changeBody
  const identity = level >= 3 ? Object.entries(S.IDENTITY).map(([k, v]) => ` bpmnpilot:${k}="${attr(v[lang])}"`).join('') : ''
  const decisionModel = level >= 4 ? `<bpmn:extensionElements><bpmnpilot:decisionModel xml="${attr(dmnXml)}" /></bpmn:extensionElements>` : ''
  const body = processXml(steps, lang, {
    extra, docs: docsOf(details), probabilities: level >= 1,
    children: { change: changeXml },
  })
  const xml = wrap(`<bpmn:collaboration id="Collaboration_1">
<bpmn:participant id="Participant_client" name="${attr(S.L('Client (40 agences)', 'Customer (40 branches)')[lang])}" processRef="Process_client" />
<bpmn:participant id="Participant_integrator" name="${attr(S.COMPANY)}" processRef="Process_onboarding" />
${S.MESSAGES.map(([from, to, name], i) => `<bpmn:messageFlow id="Message_${i + 1}" name="${attr(name[lang])}" sourceRef="${from}" targetRef="${to}" />`).join('\n')}
</bpmn:collaboration>
<bpmn:process id="Process_client" isExecutable="false">
${processXml(client, lang)}
</bpmn:process>
<bpmn:process id="Process_onboarding" name="${attr(S.L('Mise en service SD-WAN managé', 'Managed SD-WAN onboarding')[lang])}" isExecutable="true"${identity}>
${decisionModel}
${laneSetXml(steps, S.LANES_V2, lang)}
${body}
</bpmn:process>`)
  let out = await layout(xml)
  out = colorize(out, steps)
  return tidy(out)
}

async function decision(lang) {
  const d = S.DECISION
  const spec = {
    name: d.name[lang],
    hitPolicy: 'UNIQUE',
    inputs: d.inputs.map((i) => ({ label: i.label[lang], expression: i.expression, type: i.type, ...(i.values ? { values: i.values[lang] } : {}) })),
    outputs: [{ label: d.output.label[lang], name: lang === 'fr' ? d.output.name : d.output.nameEn, type: d.output.type, values: d.output.values[lang] }],
    rules: d.rules.map(([impact, sites, level, note]) => ({ inputs: [impact[lang], sites], outputs: [level], ...(note[lang] ? { annotation: note[lang] } : {}) })),
    decisionId: 'Decision_approvalLevel',
    modelName: d.name[lang],
  }
  const { xml } = await setDecisionTable('', spec)
  return xml
}

function tableRows(lang) {
  const steps = S.STEPS_V1
  const head = lang === 'fr'
    ? ['ID', 'Description', 'Étape suivante', 'Libellé du lien', 'Type', 'Fonction', 'Assigné à', 'Systèmes']
    : ['Process Step ID', 'Process Step Description', 'Next Step ID', 'Connector Label', 'Shape Type', 'Function', 'Assigned to', 'Systems']
  const TYPE = { startEvent: ['Début', 'Start'], endEvent: ['Fin', 'End'], exclusiveGateway: ['Décision', 'Decision'], userTask: ['Utilisateur', 'User'], manualTask: ['Manuelle', 'Manual'], serviceTask: ['Service', 'Service'], task: ['Tâche', 'Task'] }
  const num = new Map(steps.map((s, i) => [s.key, String(i + 1)]))
  return [head, ...steps.map((s) => {
    const nexts = s.next.map((n) => (Array.isArray(n) ? n : [n]))
    const d = S.DETAILS_V1[s.key] || {}
    return [num.get(s.key), s.name[lang], nexts.map(([t]) => num.get(t)).join(';'), nexts.map(([, l]) => l?.[lang] || '').some(Boolean) ? nexts.map(([, l]) => l?.[lang] || '').join(';') : '',
      TYPE[s.type][lang === 'fr' ? 0 : 1], S.LANES_V1[s.lane][lang], d.assignee?.[lang] || '', d.systems?.[lang] || '']
  })]
}

function brief(lang) {
  if (lang === 'fr') {
    return `# Cahier des charges : SD-WAN managé pour 40 agences

*Document fictif, fourni avec l'aide de BPMN-Pilot pour s'exercer avec le Co-pilote IA. Aucun constructeur ni client réel.*

## Contexte
Le client exploite 40 agences et 2 datacenters reliés par un VPN MPLS opérateur (20 Mb/s par agence, routeurs CE gérés par l'opérateur). Le SaaS (ERP, bureautique) sature ces liens via la sortie Internet centralisée. Il confie à ${S.COMPANY} la mise en place d'un SD-WAN managé, avec un portail client.

## Cible technique
- Underlay : MPLS conservé pendant la migration, fibre DIA 300 Mb/s par agence, 4G/5G en secours
- Overlay : tunnels IPsec de chaque agence vers 2 hubs en datacenter (actif/actif), BGP et BFD
- Politiques applicatives : voix sur MPLS, SaaS en local breakout, invités isolés en DIA
- QoS sur 4 classes, segmentation en 3 VRF
- Déploiement des CPE en zero-touch provisioning (ZTP)

## Attentes sur le processus
- Un chef de projet unique côté intégrateur, du kick-off à la recette.
- Un site survey de chaque agence avant la conception. Une réserve bloque le site, pas la vague.
- Un HLD signé par la DSI du client avant toute commande de CPE, puis un LLD par site.
- Des configurations générées par un agent IA à partir du LLD et de l'IPAM, toujours relues par un ingénieur (peer review) avant mise à disposition.
- Toute bascule passe par la gestion des changements : RFC, niveau d'approbation selon l'impact métier et le nombre de sites (préapprouvé, change manager ou CAB), MW du mardi au jeudi, 22 h à 2 h.
- Pre-checks avant la bascule, post-checks après : tunnels, sessions BGP, sondes SLA, test de bascule de lien.
- Rollback vers le routeur CE MPLS si un critère est atteint (application critique injoignable plus de 15 min, perte > 2 % sur la voix), puis nouvelle bascule dans la vague suivante.
- Recette par vague, ouverture du portail en SSO, formation des équipes, transfert au Run (NOC) avec 30 jours d'hypercare.

## Planning et indicateurs
- Pilote de 2 agences en semaine 9, puis 5 vagues de 7 à 8 agences
- Bascules réussies du premier coup : ≥ 92 %
- Disponibilité par agence : 99,95 %
- SLA de run : P1 pris en charge en 15 min, rétabli en 4 h

## Rôles
Client (DSI), chef de projet, ingénierie réseau, NOC, agent IA de configuration.

## Prompt pour le Co-pilote IA
Joignez ce fichier dans le chat du Co-pilote, puis copiez :

> ${PROMPTS.copilot.fr}
`
  }
  return `# Requirements: managed SD-WAN for 40 branches

*Fictional document, shipped with the BPMN-Pilot help to practise with the AI co-pilot. No real vendor or customer.*

## Context
The customer runs 40 branches and 2 data centers connected by a carrier MPLS VPN (20 Mb/s per branch, carrier-managed CE routers). SaaS traffic (ERP, office suite) saturates these links through the centralized Internet breakout. It asks ${S.COMPANY} to deploy a managed SD-WAN, with a customer portal.

## Target design
- Underlay: MPLS kept during the migration, 300 Mb/s DIA fibre per branch, 4G/5G backup
- Overlay: IPsec tunnels from each branch to 2 data center hubs (active/active), BGP and BFD
- Application-aware policies: voice on MPLS, SaaS through local breakout, guest isolated on DIA
- QoS with 4 classes, segmentation into 3 VRFs
- CPEs deployed with zero-touch provisioning (ZTP)

## Process expectations
- One project manager on the integrator side, from kick-off to acceptance.
- A site survey of every branch before the design. A finding blocks the site, not the wave.
- An HLD signed off by the customer's IT department before any CPE order, then one LLD per site.
- Configurations generated by an AI agent from the LLD and the IPAM, always peer-reviewed by an engineer before release.
- Every cutover goes through change management: RFC, approval level based on business impact and number of sites (pre-approved, change manager or CAB), MW Tuesday to Thursday, 10 pm to 2 am.
- Pre-checks before the cutover, post-checks after: tunnels, BGP sessions, SLA probes, link failover test.
- Rollback to the MPLS CE router if a criterion is met (critical application unreachable for more than 15 min, loss > 2 % on voice), then a new cutover in the next wave.
- Acceptance per wave, portal opened with SSO, team training, handover to Run (NOC) with 30 days of hypercare.

## Schedule and KPIs
- 2-branch pilot in week 9, then 5 waves of 7 to 8 branches
- First-time-right cutovers: ≥ 92 %
- Availability per branch: 99.95 %
- Run SLA: P1 acknowledged in 15 min, restored in 4 h

## Roles
Customer (IT department), project manager, network engineering, NOC, configuration AI agent.

## Prompt for the AI co-pilot
Attach this file in the co-pilot chat, then copy:

> ${PROMPTS.copilot.en}
`
}

export const PROMPTS = {
  copilot: S.L(
    "Dessine le processus de mise en service décrit dans le cahier des charges joint : un pool pour le client, un pour l'intégrateur avec un couloir par équipe, et la gestion des changements en sous-processus. Mets les tâches manuelles en orange.",
    'Draw the onboarding process described in the attached requirements: one pool for the customer, one for the integrator with a lane per team, and change management as a sub-process. Make the manual tasks orange.'),
  mcp: S.L(
    `Dans le wiki de ${S.COMPANY}, lis la procédure « Mise en service SD-WAN » et la politique de gestion des changements, puis les 20 derniers tickets de bascule de l'ITSM. Dessine dans BPMN-Pilot le processus réellement suivi : un pool pour le client, un pour ${S.COMPANY}, un couloir par équipe, et le change en sous-processus. Signale dans ta réponse chaque écart entre la procédure écrite et les tickets.`,
    `In the ${S.COMPANY} wiki, read the "SD-WAN onboarding" procedure and the change management policy, then the last 20 cutover tickets in the ITSM. Draw in BPMN-Pilot the process actually followed: one pool for the customer, one for ${S.COMPANY}, one lane per team, and the change as a sub-process. In your answer, point out every gap between the written procedure and the tickets.`),
}

function mcpPrompt(lang) {
  const title = lang === 'fr' ? 'Prompt pour un agent MCP' : 'Prompt for an MCP agent'
  const note = lang === 'fr'
    ? `*À donner à un agent relié à BPMN-Pilot par MCP (version Docker) et aux outils de ${S.COMPANY} (wiki, ITSM). Exemple fictif.*`
    : `*To give to an agent connected to BPMN-Pilot through MCP (Docker version) and to the tools of ${S.COMPANY} (wiki, ITSM). Fictional example.*`
  return `# ${title}\n\n${note}\n\n> ${PROMPTS.mcp[lang]}\n`
}

async function bytes(promise) {
  const data = await promise
  return Buffer.from(data instanceof Uint8Array ? data : await data.arrayBuffer())
}

async function main() {
  for (const lang of ['fr', 'en']) {
    const dir = join(OUT, lang)
    mkdirSync(dir, { recursive: true })
    const write = (key, content) => writeFileSync(join(dir, FILES[key][lang]), content)
    write('sketch', await sketch(lang))
    write('lanes', await v1(lang))
    write('styled', await v1(lang, { colors: true }))
    write('broken', await v1(lang, { colors: true, broken: true }))
    const rows = tableRows(lang)
    const check = readTable(rows)
    if (check.errors.length) throw new Error(check.errors.join('\n'))
    write('table', rowsToCsv(rows, lang === 'fr' ? ';' : ','))
    write('tableXlsx', await bytes(rowsToXlsx(rows, lang === 'fr' ? 'Étapes' : 'Steps')))
    write('documented', await v1(lang, { colors: true, details: true }))
    write('brief', brief(lang))
    write('v2', await v2(lang, 0))
    write('simulation', await v2(lang, 1))
    write('aiPotential', await v2(lang, 2))
    write('compliance', await v2(lang, 3))
    const dmn = await decision(lang)
    write('dmn', dmn)
    const { definitions } = await parseDmn(dmn)
    const table = definitions.drgElement.find((e) => e.id === 'Decision_approvalLevel')
    const { summarizeDefinitions } = await import('../../src/dmn/dmn-model.js')
    const summary = summarizeDefinitions(definitions).decisions.find((d) => d.id === table.id)
    write('dmnXlsx', await bytes(rowsToXlsx(tableToRows(summary, lang === 'fr'), lang === 'fr' ? 'Décision' : 'Decision')))
    const full = await v2(lang, 4, dmn)
    write('decision', full)
    const { xml: camunda } = await toCamunda(moddle, full, 8)
    write('camunda', camunda)
    write('mcp', mcpPrompt(lang))
  }
  console.log('Examples written to', OUT)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
