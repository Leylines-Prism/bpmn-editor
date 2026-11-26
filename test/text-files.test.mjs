import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { fileToText, textFileKind, withTextFiles } from '../src/ai/text-files.js'

// Petite archive zip en mémoire : fichiers compressés (deflate) ou non.
function zip(files, { store = false } = {}) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.from(content)
    const data = store ? raw : deflateRawSync(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(store ? 0 : 8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(store ? 0 : 8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const file = (name, content, type = '') => new File([content], name, { type })

test('recognizes text and office files', () => {
  assert.equal(textFileKind(file('a.JSON', '')), 'text')
  assert.equal(textFileKind(file('process.bpmn', '')), 'text')
  assert.equal(textFileKind(file('notes', '', 'text/plain')), 'text')
  assert.equal(textFileKind(file('a.docx', '')), 'office')
  assert.equal(textFileKind(file('a.ods', '')), 'office')
  assert.equal(textFileKind(file('a.exe', '')), null)
  assert.equal(textFileKind(file('a.png', '', 'image/png')), null)
})

test('reads a text file', async () => {
  assert.equal(await fileToText(file('a.csv', '﻿a;b\r\n1;2\r\n')), 'a;b\n1;2')
})

test('extracts the text of a Word document, tables included', async () => {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
    <w:p><w:pPr><w:tabs><w:tab w:val="left"/></w:tabs></w:pPr><w:r><w:t>Order &amp; ship</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> now</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Step</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Actor</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Check</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Sales</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>End</w:t></w:r></w:p></w:body></w:document>`
  const text = await fileToText(file('a.docx', zip({ 'word/document.xml': xml })))
  assert.equal(text, 'Order & ship\t now\nStep | Actor\nCheck | Sales\nEnd')
})

test('extracts the slides of a presentation in order', async () => {
  const slide = (t) => `<p:sld xmlns:a="x" xmlns:p="y"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`
  const text = await fileToText(file('a.pptx', zip({ 'ppt/slides/slide10.xml': slide('Ten'), 'ppt/slides/slide2.xml': slide('Two') }, { store: true })))
  assert.equal(text, '## Slide 1\nTwo\n\n## Slide 2\nTen')
})

test('extracts the sheets of a workbook', async () => {
  const text = await fileToText(file('a.xlsx', zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Tasks" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Step</t></si><si><r><t>Ch</t></r><r><t>eck</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Done</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3</v></c><c r="C2" t="b"><v>1</v></c></row>
      <row r="3"/></sheetData></worksheet>`,
  })))
  assert.equal(text, '## Sheet: Tasks\nStep |  | Done\nCheck | 3 | TRUE')
})

test('extracts an OpenDocument spreadsheet with repeated cells', async () => {
  const xml = `<office:document-content><office:body><office:spreadsheet><table:table table:name="T">
    <table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell><text:p>b<text:s text:c="2"/>c</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row>
    </table:table></office:spreadsheet></office:body></office:document-content>`
  const text = await fileToText(file('a.ods', zip({ 'content.xml': xml })))
  assert.equal(text, '## Sheet: T\na |  |  | b  c')
})

test('rejects a file that is not a zip', async () => {
  await assert.rejects(fileToText(file('a.docx', 'hello')), /not a valid document/)
})

test('adds the text of the files to the message', () => {
  assert.equal(withTextFiles('Draw it', []), 'Draw it')
  assert.equal(withTextFiles('Draw it', [{ name: 'a\nb.md', text: 'x' }]), 'Draw it\n\n--- Attached file: a b.md ---\nx\n--- End of attached file ---')
})

test('an .eml e-mail gives its headers and readable body, not raw MIME', async () => {
  const { emailToText } = await import('../src/ai/email-text.js')
  const raw = [
    'From: =?utf-8?B?SsOpcsO0bWU=?= <a@example.com>',
    'Subject: =?iso-8859-1?Q?Proc=E9dure?=',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="XX"',
    '',
    '--XX',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('<p>Vérifier le stock</p><p>Expédier</p>').toString('base64'),
    '--XX',
    'Content-Type: application/pdf; name="devis.pdf"',
    'Content-Disposition: attachment; filename="devis.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    'JVBERi0xLjQK',
    '--XX--',
  ].join('\r\n')
  const text = emailToText(new Uint8Array(Buffer.from(raw, 'latin1')))
  assert.match(text, /From: Jérôme <a@example.com>/)
  assert.match(text, /Subject: Procédure/)
  assert.match(text, /Vérifier le stock\nExpédier/)
  assert.match(text, /Attachments not included: devis\.pdf/)
  assert.doesNotMatch(text, /JVBERi0|base64|<p>/)
})
