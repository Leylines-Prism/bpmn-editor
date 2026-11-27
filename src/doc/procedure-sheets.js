// Fiches de procédure : la documentation du processus mise en document, une fiche par
// activité dans l'ordre du flux (celui de la séquence du rapport de processus), avec ce
// qui la précède et ce qui la suit. Les passerelles et les événements documentés ont
// aussi leur fiche ; une activité sans documentation garde la sienne, marquée « à
// compléter ». En Markdown ou en PDF (menu Exporter).

import { lang, T } from '../i18n/lang.js'
import { parseBlocks, parseInline, shiftHeadings } from './markdown.js'
import { pdfText, identityMarkdown } from '../process-report.js'

// Fiches dans l'ordre : chaque passerelle documentée après l'élément qui la précède.
export function sheetsOf(report) {
  const sheets = []
  const gateways = report.gatewayDocs || []
  for (const g of gateways.filter((g) => !g.after)) sheets.push({ ...g, number: null, kind: 'gateway' })
  for (const s of report.sequence) {
    if (s.docMarkdown || s.needsDoc) sheets.push({ ...s, kind: 'element' })
    for (const g of gateways.filter((g) => g.after === s.number)) sheets.push({ ...g, number: null, kind: 'gateway' })
  }
  return sheets
}

// Risques, contrôles et exigences de l'activité (mode Expert), quand ils sont renseignés.
function complianceFacts(s) {
  return [
    [T('Risks', 'Risques'), (s.risks || []).join(' ; ')],
    [T('Controls', 'Contrôles'), (s.controls || []).join(' ; ')],
    [T('Requirements', 'Exigences'), (s.requirements || []).join(' ; ')],
  ].filter(([, v]) => v)
}

const heading = (s) => (s.number ? `${s.number}. ${s.name}` : s.name)
const dateText = (date) => date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const colon = () => T(': ', ' : ')

export function sheetsToMarkdown(report) {
  const sheets = sheetsOf(report)
  const lines = [
    `# ${T('Procedure sheets', 'Fiches de procédure')}${colon()}${report.title}`,
    '',
    `*${T(`Generated on ${dateText(report.date)} by BPMN Pilot`, `Générées le ${dateText(report.date)} par BPMN Pilot`)}*`,
  ]
  const identity = identityMarkdown(report.identity)
  if (identity.length) lines.push('', ...identity.slice(0, -1))
  for (const d of report.processDocs || []) lines.push('', `## ${d.name}`, '', shiftHeadings(d.markdown, 1))
  if (!sheets.length) lines.push('', T('No activity in this diagram.', 'Aucune activité dans ce diagramme.'))
  for (const s of sheets) {
    lines.push('', '---', '', `## ${heading(s)}`, '')
    const facts = [`**Type**${colon()}${s.type}`]
    if (s.lane) facts.push(`**${T('Lane', 'Couloir')}**${colon()}${s.lane}`)
    if (s.assignee) facts.push(`**${T('Assigned to', 'Assigné à')}**${colon()}${s.assignee}`)
    if (s.systems) facts.push(`**${T('Systems', 'Systèmes')}**${colon()}${s.systems}`)
    const raci = [['A', s.accountable], ['C', s.consulted], ['I', s.informed]].filter(([, v]) => v).map(([k, v]) => `${k}${colon()}${v}`)
    if (raci.length) facts.push(`**RACI**${colon()}${raci.join(', ')}`)
    lines.push(facts.join(' · '))
    if (s.previous?.length) lines.push('', `**${T('Before', 'Avant')}**${colon()}${s.previous.join(' ; ')}`)
    if (s.next) lines.push('', `**${T('Next', 'Ensuite')}**${colon()}${s.next}`)
    for (const [k, v] of complianceFacts(s)) lines.push('', `**${k}**${colon()}${v}`)
    lines.push('', s.docMarkdown ? shiftHeadings(s.docMarkdown, 1) : `*${T('Documentation to complete.', 'Documentation à compléter.')}*`)
  }
  return lines.join('\n') + '\n'
}

// ── PDF ─────────────────────────────────────────────────────────────────────


const INK = [12, 17, 32]
const MUTED = [90, 101, 120]
const ACCENT = [15, 111, 173]
const LINE = [226, 231, 238]
const TODO_FILL = [254, 249, 195]
const TODO_TEXT = [161, 98, 7]

export async function sheetsToPdf(report) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 18
  const maxW = W - 2 * M
  const title = `${T('Procedure sheets', 'Fiches de procédure')}${colon()}${report.title}`
  doc.setProperties({ title: pdfText(title), subject: T('Procedure sheets', 'Fiches de procédure'), creator: 'BPMN Pilot' })
  const sheets = sheetsOf(report)
  let y = M

  const ensure = (h) => {
    if (y + h <= H - 16) return
    doc.addPage()
    y = M
  }
  const setStyle = ({ bold, italic, code }, size) => {
    const font = code ? 'courier' : 'helvetica'
    const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal'
    doc.setFont(font, style).setFontSize(size)
  }

  // Texte en ligne mis en forme (gras, italique, code, liens), coupé au mot près.
  function rich(text, { x = M, width = maxW, size = 10.5, color = INK, lead = 5 } = {}) {
    const words = []
    for (const piece of parseInline(text)) {
      for (const part of pdfText(piece.text).split(/(\s+)/)) if (part) words.push({ ...piece, text: part })
    }
    let line = []
    let lineW = 0
    const flush = () => {
      ensure(lead)
      let cx = x
      for (const w of line) {
        setStyle(w, size)
        doc.setTextColor(...(w.href ? ACCENT : color))
        doc.text(w.text, cx, y)
        const ww = doc.getTextWidth(w.text)
        if (w.href && w.text.trim()) {
          doc.setDrawColor(...ACCENT).setLineWidth(0.2).line(cx, y + 0.8, cx + ww, y + 0.8)
          doc.link(cx, y - size * 0.3, ww, size * 0.4, { url: w.href })
        }
        cx += ww
      }
      y += lead
      line = []
      lineW = 0
    }
    for (const w of words) {
      setStyle(w, size)
      const ww = doc.getTextWidth(w.text)
      if (/^\s+$/.test(w.text)) {
        if (line.length) { line.push(w); lineW += ww }
        continue
      }
      if (lineW + ww > width && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
        flush()
      }
      // Mot plus long que la ligne : coupé à la largeur.
      if (ww > width) {
        for (const chunk of doc.splitTextToSize(w.text, width)) { line.push({ ...w, text: chunk }); flush() }
        continue
      }
      line.push(w)
      lineW += ww
    }
    if (line.length) flush()
  }

  function markdown(source) {
    for (const b of parseBlocks(source)) {
      if (b.type === 'heading') {
        y += 1.5
        ensure(12)
        rich(b.text, { size: b.level <= 2 ? 11.5 : 10.5, color: ACCENT })
        y += 0.5
      } else if (b.type === 'paragraph') {
        for (const l of b.lines) rich(l)
        y += 2
      } else if (b.type === 'quote') {
        const top = y - 4
        for (const l of b.lines) rich(l, { x: M + 5, width: maxW - 5, color: MUTED })
        doc.setDrawColor(...LINE).setLineWidth(0.8).line(M + 1, top, M + 1, y - 3.5)
        y += 2
      } else {
        let n = b.start
        for (const it of b.items) {
          const indent = it.depth ? 11 : 5
          const mark = it.depth ? '-' : b.ordered ? `${n++}.` : '•'
          ensure(5)
          doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...MUTED)
          doc.text(mark, M + indent - 4, y)
          rich(it.text, { x: M + indent + 1, width: maxW - indent - 1 })
        }
        y += 2
      }
    }
  }

  // ── Page de garde ──
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK)
  for (const l of doc.splitTextToSize(pdfText(report.title), maxW)) { doc.text(l, M, y + 6); y += 8.5 }
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED)
  doc.text(pdfText(T(`Procedure sheets · generated on ${dateText(report.date)} by BPMN Pilot`, `Fiches de procédure · générées le ${dateText(report.date)} par BPMN Pilot`)), M, y + 3)
  y += 9
  doc.setDrawColor(...ACCENT).setLineWidth(0.6).line(M, y, M + 40, y)
  y += 8
  const identity = identityMarkdown(report.identity)
  if (identity.length) { markdown(identity.join('\n')); y += 3 }
  for (const d of report.processDocs || []) {
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
    ensure(10)
    doc.text(pdfText(d.name), M, y)
    y += 6
    markdown(d.markdown)
    y += 3
  }
  ensure(16)
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
  doc.text(pdfText(T('Contents', 'Sommaire')), M, y)
  y += 7
  const tocLinks = []
  if (!sheets.length) rich(T('No activity in this diagram.', 'Aucune activité dans ce diagramme.'), { color: MUTED })
  for (const s of sheets) {
    ensure(6)
    doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...INK)
    const label = doc.splitTextToSize(pdfText(heading(s)), maxW - 52)[0]
    doc.text(label, M, y)
    doc.setTextColor(...(s.docMarkdown ? MUTED : TODO_TEXT))
    doc.text(pdfText(s.docMarkdown ? s.lane || '' : T('to complete', 'à compléter')), W - M, y, { align: 'right' })
    tocLinks.push({ page: doc.getNumberOfPages(), y, s })
    y += 6
  }

  // ── Une fiche par page ──
  const pageOf = new Map()
  for (const s of sheets) {
    doc.addPage()
    y = M
    pageOf.set(s, doc.getNumberOfPages())
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK)
    for (const l of doc.splitTextToSize(pdfText(heading(s)), maxW)) { doc.text(l, M, y + 5); y += 7 }
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED)
    doc.text(pdfText([s.type, s.lane, s.assignee ? `${T('Assigned to', 'Assigné à')}${colon()}${s.assignee}` : ''].filter(Boolean).join(' · ')), M, y + 3)
    y += 8
    // Avant / Ensuite, dans un encadré.
    const facts = []
    if (s.previous?.length) facts.push([T('Before', 'Avant'), s.previous.join(' ; ')])
    if (s.next) facts.push([T('Next', 'Ensuite'), s.next])
    if (s.systems) facts.push([T('Systems', 'Systèmes'), s.systems])
    const raci = [['A', s.accountable], ['C', s.consulted], ['I', s.informed]].filter(([, v]) => v).map(([k, v]) => `${k}${colon()}${v}`)
    if (raci.length) facts.push(['RACI', raci.join(', ')])
    facts.push(...complianceFacts(s))
    if (facts.length) {
      const top = y
      y += 5.5
      for (const [k, v] of facts) {
        doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...MUTED)
        doc.text(pdfText(k), M + 4, y)
        const lines = doc.setFont('helvetica', 'normal').splitTextToSize(pdfText(v), maxW - 30)
        doc.setTextColor(...INK).text(lines, M + 26, y)
        y += lines.length * 4.6 + 1.2
      }
      doc.setDrawColor(...LINE).setLineWidth(0.3).roundedRect(M, top, maxW, y - top - 1, 2, 2, 'S')
      y += 6
    }
    if (s.docMarkdown) markdown(s.docMarkdown)
    else {
      doc.setFillColor(...TODO_FILL).roundedRect(M, y - 4, maxW, 10, 2, 2, 'F')
      doc.setFont('helvetica', 'italic').setFontSize(10.5).setTextColor(...TODO_TEXT)
      doc.text(pdfText(T('Documentation to complete.', 'Documentation à compléter.')), M + 4, y + 2.2)
      y += 10
    }
  }

  // Sommaire cliquable, puis pied de page.
  for (const { page, y: ty, s } of tocLinks) {
    doc.setPage(page)
    doc.link(M, ty - 4, maxW, 5.5, { pageNumber: pageOf.get(s) })
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text(pdfText(`${title} · ${i}/${pages}`), W - M, H - 8, { align: 'right' })
  }
  return doc.output('blob')
}
