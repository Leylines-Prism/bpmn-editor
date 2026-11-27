// Tableaux dans le navigateur, sans dépendance : lecture d'un texte collé depuis Excel,
// d'un fichier .csv, .tsv ou .xlsx, et écriture d'un classeur .xlsx d'une feuille.
// Partagé par Ouvrir > Depuis un tableau et les tables de décision.

import { zip, escapeXml } from './zip-write.js'
import { openZip, xlsxSheets, MAX_OFFICE_BYTES } from './ai/text-files.js'

// Découpe un texte collé (Excel donne des tabulations) ou un fichier CSV.
export function parseDelimited(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const first = clean.split('\n').find((l) => l.trim()) || ''
  // Tabulation d'abord (copier depuis Excel), sinon le séparateur le plus présent.
  const counts = ['\t', ';', ','].map((d) => [d, first.split(d).length - 1])
  const best = counts[0][1] > 0 ? counts[0] : [...counts].sort((a, b) => b[1] - a[1])[0]
  const delimiter = best[1] > 0 ? best[0] : '\t'
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  row.push(cell)
  rows.push(row)
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c))
}

// Lignes d'un fichier (File) : .xlsx (première feuille qui a au moins deux lignes),
// sinon texte délimité. Renvoie [[cellule, …], …].
export async function readSheetFile(file) {
  if (/\.xlsx$/i.test(file.name)) {
    if (file.size > MAX_OFFICE_BYTES) throw new Error('file too large')
    const sheets = await xlsxSheets(await openZip(new Uint8Array(await file.arrayBuffer())))
    const sheet = sheets.find((s) => s.rows.length > 1) || sheets[0]
    if (!sheet) throw new Error('the workbook has no sheet')
    return sheet.rows
  }
  return parseDelimited(await file.text())
}

// Texte CSV (séparateur point-virgule si demandé, pour Excel en français).
export function rowsToCsv(rows, delimiter = ',') {
  const cell = (c) => { const v = String(c ?? ''); return /[",;\n\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
  return rows.map((r) => r.map(cell).join(delimiter)).join('\r\n') + '\r\n'
}

// Classeur .xlsx d'une seule feuille, en chaînes en ligne (pas de table partagée).
export async function rowsToXlsx(rows, sheetName = 'Process') {
  // A…Z, puis AA, AB… (au-delà de 26 colonnes).
  const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) =>
    `<c r="${col(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(c)}</t></is></c>`).join('')}</row>`).join('')
  const widths = rows[0].map((_, i) => Math.min(60, Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2))))
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>` },
  ])
}
