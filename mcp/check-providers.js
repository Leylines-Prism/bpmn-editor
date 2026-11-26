// Vérifie, avec de vrais appels, ce que chaque modèle configuré sur le serveur sait faire :
// répondre, appeler un outil de l'éditeur, lire une image, lire un PDF. Sert à séparer une
// erreur de réglage (clé, adresse, modèle) d'une limite du fournisseur ou du modèle.
//
//   docker compose exec mcp node mcp/check-providers.js       (version docker)
//   cd mcp && npm run check-providers                          (depuis le code source)
//
// Lit les mêmes variables que le serveur (mcp/.env ou environnement du conteneur). Chaque
// essai coûte quelques centaines de jetons. Aucun onglet de l'éditeur n'est nécessaire :
// les outils répondent ici avec un diagramme d'exemple.

import { ChatService } from './chat.js'
import { supports } from '../src/ai/attachments.js'
import { attachmentRefused } from '../src/ai/errors.js'

try {
  process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}

// PNG 1×1 et PDF d'une page contenant le texte « BPMN Pilot ».
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

function tinyPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // contenu, ci-dessous
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = 'BT /F1 24 Tf 20 40 Td (BPMN Pilot) Tj ET'
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const at of offsets) pdf += `${String(at).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1').toString('base64')
}

const SHAPES = [{ id: 'StartEvent_1', type: 'bpmn:StartEvent', name: 'Start' }]

// Pont factice : un onglet toujours présent, et des outils qui répondent sans éditeur.
const bridge = {
  hasTab: () => true,
  call: async (name) => (name === 'get_shapes' ? { shapes: SHAPES, connections: [] } : { ok: true }),
}

const CHECKS = [
  { id: 'text', label: 'text reply', text: 'Reply with the single word OK.' },
  { id: 'tool', label: 'tool call', text: 'Call the get_shapes tool once, then say how many shapes the diagram has.', tool: 'get_shapes' },
  { id: 'image', label: 'image', text: 'An image is attached. Say in a few words what you see.', attachment: { kind: 'image', mediaType: 'image/png', name: 'pixel.png', data: PNG } },
  { id: 'pdf', label: 'PDF', text: 'A PDF is attached. Quote the text it contains.', attachment: { kind: 'pdf', mediaType: 'application/pdf', name: 'test.pdf', data: tinyPdf() } },
]

const chat = new ChatService({ bridge, log: () => {} })
if (!chat.enabled) {
  console.log('No model configured on the server: set ANTHROPIC_API_KEY, MISTRAL_API_KEY or OPENAI_MODELS (see mcp/.env.example).')
  process.exit(1)
}
for (const warning of chat.warnings) console.log(`Warning: ${warning}`)

let failures = 0
for (const model of chat.models) {
  console.log(`\n${model.providerLabel || model.provider} / ${model.label} (${model.id})`)
  const caps = { format: model.provider === 'anthropic' ? 'anthropic' : 'openai', providerId: chat.providerId(model.provider) }
  for (const check of CHECKS) {
    const attachments = check.attachment ? [check.attachment] : []
    if (check.attachment && !supports(caps, check.attachment.kind)) {
      console.log(`  -  ${check.label}: not offered for this provider (the editor refuses it before sending)`)
      continue
    }
    let reply = ''
    const tools = []
    const started = Date.now()
    try {
      await chat.send({
        tabId: 'check',
        model: model.key,
        text: check.text,
        attachments,
        signal: AbortSignal.timeout(120_000),
        emit: (e) => {
          if (e.type === 'text') reply += e.text
          if (e.type === 'tool') tools.push(e.name)
        },
      })
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      const short = reply.replace(/\s+/g, ' ').trim().slice(0, 80)
      if (check.tool && !tools.includes(check.tool)) {
        failures++
        console.log(`  ✗  ${check.label}: the model answered without calling ${check.tool} (${seconds} s): "${short}". It may not support tool calls.`)
      } else {
        console.log(`  ✓  ${check.label} (${seconds} s): "${short}"`)
      }
    } catch (err) {
      failures++
      const status = err?.status ? `HTTP ${err.status}: ` : ''
      console.log(`  ✗  ${check.label}: ${status}${(err?.message || String(err)).slice(0, 300)}`)
      if (attachmentRefused(err)) console.log('     → a limit of this model, not a setting error.')
    }
  }
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
