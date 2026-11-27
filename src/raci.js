// Matrice RACI tirée du processus : pour chaque activité, qui la réalise (R), qui en
// répond (A), qui est consulté (C), qui est informé (I).
// R vient du champ « Assigné à », sinon du couloir. A, C et I viennent des champs du
// panneau de propriétés (bpmnpilot:accountable, consulted, informed), une liste
// séparée par des virgules. Partagé par le rapport (Markdown, PDF, Word) et l'export Excel.

const list = (s) => String(s ?? '').split(/[,;]/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)

// sequence : r.sequence du rapport. Renvoie null s'il n'y a ni A, ni C, ni I nulle part
// (la matrice ne dirait rien de plus que les couloirs).
export function buildRaci(sequence) {
  const rows = sequence.filter((s) => s.activity)
  if (!rows.some((s) => s.accountable || s.consulted || s.informed)) return null
  // Un même rôle écrit avec une autre casse (« Ventes », « ventes ») : une seule colonne,
  // sous la première écriture rencontrée.
  const roles = []
  const byKey = new Map()
  const add = (role) => {
    const key = role.toLowerCase()
    if (!byKey.has(key)) { byKey.set(key, role); roles.push(role) }
    return byKey.get(key)
  }
  const out = rows.map((s) => {
    const cells = new Map()
    const put = (name, letter) => {
      if (!name) return
      const role = add(name)
      const now = cells.get(role) || ''
      if (!now.includes(letter)) cells.set(role, now ? `${now}/${letter}` : letter)
    }
    put(s.assignee || s.lane, 'R')
    for (const r of list(s.accountable)) put(r, 'A')
    for (const r of list(s.consulted)) put(r, 'C')
    for (const r of list(s.informed)) put(r, 'I')
    return { number: s.number, name: s.name, cells }
  })
  return { roles, rows: out.map((r) => ({ number: r.number, name: r.name, cells: roles.map((role) => r.cells.get(role) || '') })) }
}

// Lignes de tableau (en-tête compris) pour le Markdown et l'Excel.
export function raciRows(raci, T) {
  return [
    ['N°', T('Activity', 'Activité'), ...raci.roles],
    ...raci.rows.map((r) => [String(r.number), r.name, ...r.cells]),
  ]
}
