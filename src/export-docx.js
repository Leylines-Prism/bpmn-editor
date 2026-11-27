// Export Word (.docx) du rapport de processus et des fiches de procédure.
//
// Le document part du même texte Markdown que l'export Markdown : titres, paragraphes,
// listes, citations et tableaux deviennent des styles Word natifs (Titre 1, Liste à
// puces, tableau), modifiables ensuite dans Word, LibreOffice ou Google Docs. L'image
// du diagramme suit l'introduction. Écrit dans la page, sans dépendance : un .docx est
// une archive zip de fichiers XML (src/zip-write.js).

import { parseBlocks, parseInline, safeUrl } from './doc/markdown.js'
import { zip, escapeXml as x } from './zip-write.js'

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

// Page A4, marges de 2 cm : 16,99 cm de texte en largeur.
const EMU_PER_CM = 360000
const TEXT_WIDTH_CM = 16.9
const MAX_IMAGE_HEIGHT_CM = 20

// Découpe le Markdown en blocs, tableaux à barres verticales et lignes « --- » compris
// (parseBlocks ne lit que les blocs de la documentation des éléments).
export function markdownBlocks(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let chunk = []
  const flush = () => { if (chunk.length) out.push(...parseBlocks(chunk.join('\n'))); chunk = [] }
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l)
  const isRule = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      flush()
      const rows = [splitRow(line)]
      i += 2
      while (i < lines.length && isRow(lines[i])) rows.push(splitRow(lines[i++]))
      i--
      out.push({ type: 'table', rows })
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      out.push({ type: 'rule' })
    } else chunk.push(line)
  }
  flush()
  return out
}

function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let cell = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && (body[i + 1] === '|' || body[i + 1] === '\\')) { cell += body[++i]; continue }
    if (body[i] === '|') { cells.push(cell.trim()); cell = '' } else cell += body[i]
  }
  cells.push(cell.trim())
  return cells
}

// Dimensions d'une image PNG (en-tête IHDR).
export function pngSize(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 24 || v.getUint32(12) !== 0x49484452) throw new Error('not a PNG image')
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

function createWriter() {
  const rels = []
  const nums = [] // listes numérotées : chacune repart de son propre numéro
  const addRel = (type, target, external) => {
    const id = `rId${rels.length + 10}`
    rels.push({ id, type, target, external })
    return id
  }

  const runs = (text, base = {}) => parseInline(text).map((p) => {
    const props = [
      p.bold || base.bold ? '<w:b/>' : '',
      p.italic || base.italic ? '<w:i/>' : '',
      p.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F1F3F7"/>' : '',
      p.href ? '<w:rStyle w:val="Hyperlink"/>' : '',
      base.color ? `<w:color w:val="${base.color}"/>` : '',
      base.size ? `<w:sz w:val="${base.size}"/><w:szCs w:val="${base.size}"/>` : '',
    ].join('')
    const run = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${x(p.text)}</w:t></w:r>`
    if (!p.href) return run
    const href = safeUrl(p.href)
    return href ? `<w:hyperlink r:id="${addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', href, true)}">${run}</w:hyperlink>` : run
  }).join('')

  const para = (content, { style, num, keepNext, spacingAfter } = {}) => {
    const props = [
      style ? `<w:pStyle w:val="${style}"/>` : '',
      keepNext ? '<w:keepNext/>' : '',
      num ? `<w:numPr><w:ilvl w:val="${num.level}"/><w:numId w:val="${num.id}"/></w:numPr>` : '',
      spacingAfter !== undefined ? `<w:spacing w:after="${spacingAfter}"/>` : '',
    ].join('')
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`
  }

  function table(rows) {
    const columns = Math.max(...rows.map((r) => r.length))
    const width = Math.round((TEXT_WIDTH_CM / 2.54) * 1440)
    const colWidth = Math.floor(width / columns)
    const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`
    const body = rows.map((r, ri) => {
      const cells = Array.from({ length: columns }, (_, ci) => {
        const shade = ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E8ECF4"/>' : ''
        const content = para(runs(r[ci] || '', ri === 0 ? { bold: true } : {}), { style: 'TableText' })
        return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shade}</w:tcPr>${content}</w:tc>`
      }).join('')
      return `<w:tr>${ri === 0 ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells}</w:tr>`
    }).join('')
    return `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>${grid}${body}</w:tbl>${para('', { spacingAfter: 0 })}`
  }

  function image(png, name) {
    const id = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/diagram.png')
    const { width, height } = pngSize(png)
    let cx = TEXT_WIDTH_CM * EMU_PER_CM
    let cy = Math.round((cx * height) / width)
    if (cy > MAX_IMAGE_HEIGHT_CM * EMU_PER_CM) { cy = MAX_IMAGE_HEIGHT_CM * EMU_PER_CM; cx = Math.round((cy * width) / height) }
    // Une petite image n'est pas agrandie au-delà de sa taille à 192 ppp.
    const natural = (width / 192) * 2.54 * EMU_PER_CM
    if (cx > natural) { cy = Math.round((cy * natural) / cx); cx = Math.round(natural) }
    cx = Math.round(cx)
    const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="${x(name)}" descr="${x(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="diagram.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    return para(drawing, { style: 'Figure' })
  }

  function blocks(list, { png, imageName } = {}) {
    const out = []
    let imagePlaced = !png
    const placeImage = () => { if (!imagePlaced) { out.push(image(png, imageName)); imagePlaced = true } }
    list.forEach((b, i) => {
      // L'image se place avant le premier titre de section (après l'introduction).
      if (b.type === 'heading' && b.level >= 2) placeImage()
      if (b.type === 'heading') {
        out.push(para(runs(b.text), { style: b.level === 1 ? 'Title' : `Heading${Math.min(4, b.level - 1)}`, keepNext: true }))
      } else if (b.type === 'paragraph') {
        out.push(para(runs(b.lines.join(' '))))
      } else if (b.type === 'quote') {
        out.push(para(runs(b.lines.join(' ')), { style: 'Quote' }))
      } else if (b.type === 'list') {
        let id = 1
        if (b.ordered) { nums.push(b.start); id = 10 + nums.length }
        for (const item of b.items) {
          const level = item.depth
          out.push(para(runs(item.text), { style: 'ListParagraph', num: { id: b.ordered && level === 0 ? id : 1, level: b.ordered && level === 0 ? 0 : level } }))
        }
      } else if (b.type === 'table') {
        out.push(table(b.rows))
      } else if (b.type === 'rule') {
        out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9CFDB"/></w:pBdr></w:pPr></w:p>')
      }
      if (i === list.length - 1) placeImage()
    })
    return out.join('')
  }

  return { blocks, rels, nums }
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="LANG"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F2A44"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4FA8"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1F2A44"/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="F08A24"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/><w:color w:val="4A5368"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Figure"><w:name w:val="Figure"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="240"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F4FA8"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9CFDB"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`

function numbering(starts) {
  const levels = (format, text) => [0, 1, 2].map((l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${format(l)}"/><w:lvlText w:val="${text(l)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + l * 360}" w:hanging="300"/></w:pPr>${format(l) === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' : ''}</w:lvl>`).join('')
  const bullet = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(() => 'bullet', () => '')}</w:abstractNum>`
  const decimal = `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels((l) => (l === 0 ? 'decimal' : 'bullet'), (l) => (l === 0 ? '%1.' : ''))}</w:abstractNum>`
  const nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
    ...starts.map((start, i) => `<w:num w:numId="${11 + i}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`)]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${bullet}${decimal}${nums.join('')}</w:numbering>`
}

// markdown : texte de l'export Markdown. png : image du diagramme (Uint8Array), facultative.
// Renvoie le .docx (Uint8Array).
export async function markdownToDocx(markdown, { title = '', png = null, imageName = 'Diagram', lang = 'en' } = {}) {
  const writer = createWriter()
  const body = writer.blocks(markdownBlocks(markdown), { png, imageName })
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>'
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ...writer.rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${x(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`),
  ]
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>BPMN Pilot</dc:creator><dc:language>${lang}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: STYLES.replace('LANG', lang === 'fr' ? 'fr-FR' : 'en-US') },
    { name: 'word/numbering.xml', data: numbering(writer.nums) },
  ]
  if (png) files.push({ name: 'word/media/diagram.png', data: png })
  return zip(files)
}

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
