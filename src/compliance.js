// Risques, contrôles et exigences par activité, fiche d'identité du processus (mode Expert).
//
// - Sur une activité : bpmnpilot:risks et bpmnpilot:controls (un par ligne),
//   bpmnpilot:requirements (références séparées par des points-virgules : « RGPD art. 30 ;
//   ISO 9001 §8.5 »). Le rapport en tire une matrice risques-contrôles et une matrice de
//   conformité (exigence → activités).
// - Sur le processus principal : propriétaire, version, statut, date de validation et
//   périmètre, en tête du rapport et des fiches de procédure. Le panneau la montre sur la
//   racine du diagramme ; quand il y a des pools, elle est rangée sur le processus du
//   premier pool, pour survivre à l'ajout ou au retrait des pools.

import { T } from './i18n/lang.js'

export const PROCESS_STATUS = {
  draft: () => T('Draft', 'Brouillon'),
  review: () => T('In review', 'En relecture'),
  approved: () => T('Approved', 'Validé'),
  retired: () => T('Retired', 'Obsolète'),
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// Un risque ou un contrôle par ligne.
export const splitLines = (text) => String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean)
// Références séparées par des points-virgules ou des retours à la ligne. Une virgule peut
// faire partie d'une référence (« art. 5, §1 ») : elle ne sépare pas.
export const splitRefs = (text) => String(text ?? '').split(/[;\n]/).map(clean).filter(Boolean)

export const IDENTITY_FIELDS = ['owner', 'version', 'status', 'validatedOn', 'scope']

// Élément qui porte la fiche, d'après l'objet métier de la racine du diagramme.
export function identityHolder(rootBo) {
  if (rootBo?.$type === 'bpmn:Collaboration') {
    const owner = (rootBo.participants || []).find((p) => p.processRef)
    if (owner) return owner.processRef
  }
  return rootBo
}

// Fiche d'identité, champ par champ : le premier élément qui renseigne un champ le donne.
export function identityOf(holders) {
  const id = Object.fromEntries(IDENTITY_FIELDS.map((k) => [k, '']))
  for (const bo of holders) {
    if (!bo?.get) continue
    for (const k of IDENTITY_FIELDS) if (!id[k]) id[k] = clean(bo.get(`bpmnpilot:${k}`))
  }
  if (!PROCESS_STATUS[id.status]) id.status = ''
  return IDENTITY_FIELDS.some((k) => id[k]) ? id : null
}

// Lignes « libellé : valeur » de la fiche, dans l'ordre, sans les champs vides.
export function identityRows(id) {
  if (!id) return []
  return [
    [T('Process owner', 'Propriétaire du processus'), id.owner],
    [T('Version', 'Version'), id.version],
    [T('Status', 'Statut'), id.status ? PROCESS_STATUS[id.status]() : ''],
    [T('Approved on', 'Validé le'), id.validatedOn],
    [T('Scope', 'Périmètre'), id.scope],
  ].filter(([, v]) => v)
}

// À partir de la séquence du rapport : les activités qui ont des risques ou des contrôles,
// et, pour chaque exigence citée, les activités qui la portent.
export function buildCompliance(sequence) {
  const risks = sequence
    .filter((s) => s.activity && (s.risks.length || s.controls.length))
    .map((s) => ({ number: s.number, id: s.id, name: s.name, risks: s.risks, controls: s.controls }))
  const byRef = new Map()
  for (const s of sequence) {
    if (!s.activity) continue
    for (const ref of s.requirements) {
      const key = ref.toLowerCase()
      if (!byRef.has(key)) byRef.set(key, { ref, activities: [] })
      byRef.get(key).activities.push(`${s.number}. ${s.name}`)
    }
  }
  const requirements = [...byRef.values()].sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))
  return risks.length || requirements.length ? { risks, requirements } : null
}
