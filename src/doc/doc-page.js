// Exporter > Page de documentation (HTML) : une seule page autonome, à ouvrir dans n'importe
// quel navigateur, à joindre à un courriel ou à déposer sur un intranet, sans BPMN Pilot.
//
//   - en haut, le titre, la date et la fiche d'identité du processus (si elle est remplie) ;
//   - le diagramme, en image vectorielle (le SVG de l'éditeur), à lire seulement ;
//   - un clic sur un élément documenté ouvre sa fiche à droite (Échap ou × la ferme) ;
//   - dessous, toutes les fiches dans l'ordre du flux, pour l'impression ou sans JavaScript.
//
// Les fiches reprennent celles de Exporter > Fiches de procédure (src/doc/procedure-sheets.js) :
// type, couloir, assigné, systèmes, RACI, avant et ensuite, et, s'ils sont renseignés, risques,
// contrôles, exigences, sous-niveau, récits utilisateur et critères d'acceptation.
//
// Rien n'est chargé d'ailleurs : styles et script sont dans la page, sans police externe. Les
// textes passent par escapeHtml, la documentation par le Markdown de l'application (liens
// http, https et mailto seulement).

import { lang, T } from '../i18n/lang.js'
import { escapeHtml, markdownToHtml } from './markdown.js'
import { identityRows } from '../compliance.js'
import { sheetsOf } from './procedure-sheets.js'

const e = escapeHtml
const colon = () => T(': ', ' : ')
const dateText = (date) => date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Le SVG de bpmn-js n'a ni script ni gestionnaire d'événement ; on s'en assure quand même, sur
// l'arbre XML et non sur le texte : éléments actifs retirés, attributs on* retirés, liens réduits
// aux ancres internes (#…). Sans analyseur XML (hors navigateur), le diagramme est omis.
const ACTIVE = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animatemotion', 'animatetransform', 'set', 'handler', 'listener'])
export function cleanSvg(svg, dom = globalThis) {
  if (!svg || typeof dom.DOMParser !== 'function' || typeof dom.XMLSerializer !== 'function') return ''
  const doc = new dom.DOMParser().parseFromString(String(svg), 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return ''
  const walk = (el) => {
    for (const child of [...el.children]) {
      if (ACTIVE.has(child.localName.toLowerCase())) child.remove()
      else walk(child)
    }
    for (const attr of [...el.attributes]) {
      const name = attr.localName.toLowerCase()
      if (name.startsWith('on')) el.removeAttributeNode(attr)
      else if (name === 'href' && !attr.value.trim().startsWith('#')) el.removeAttributeNode(attr)
    }
  }
  walk(root)
  return new dom.XMLSerializer().serializeToString(root)
}

function facts(s) {
  const list = []
  const add = (k, v) => { if (v) list.push([k, v]) }
  add(T('Lane', 'Couloir'), s.lane)
  add(T('Assigned to', 'Assigné à'), s.assignee)
  add(T('Systems', 'Systèmes'), s.systems)
  const raci = [['A', s.accountable], ['C', s.consulted], ['I', s.informed]].filter(([, v]) => v).map(([k, v]) => `${k}${colon()}${v}`)
  add('RACI', raci.join(', '))
  add(T('Before', 'Avant'), (s.previous || []).join(' ; '))
  add(T('Next', 'Ensuite'), s.next)
  add(T('Detailed in', 'Détaillé dans'), s.linkedDiagram ? T(`diagram “${s.linkedDiagram}”`, `diagramme « ${s.linkedDiagram} »`) : '')
  return list
}

const lines = (title, items, cls) => (items?.length
  ? `<h4>${e(title)}</h4><ul class="${cls}">${items.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`
  : '')

function sheetHtml(s) {
  const heading = s.number ? `${s.number}. ${s.name}` : s.name
  const dl = facts(s).map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')
  const doc = s.docMarkdown
    ? `<div class="md">${markdownToHtml(s.docMarkdown, { headingOffset: 2 })}</div>`
    : s.kind === 'element' && s.needsDoc ? `<p class="todo">${e(T('Documentation to complete.', 'Documentation à compléter.'))}</p>` : ''
  return `<article class="sheet" id="sheet-${e(s.id)}" data-for="${e(s.id)}">
  <h3>${e(heading)}</h3>
  <p class="type">${e(s.type || '')}</p>
  ${dl ? `<dl>${dl}</dl>` : ''}
  ${doc}
  ${lines(T('Risks', 'Risques'), s.risks, 'plain')}
  ${lines(T('Controls', 'Contrôles'), s.controls, 'plain')}
  ${lines(T('Requirements', 'Exigences'), s.requirements, 'plain')}
  ${lines(T('User stories', 'Récits utilisateur'), s.userStories, 'plain')}
  ${lines(T('Acceptance criteria', 'Critères d\'acceptation'), s.acceptanceCriteria, 'checks')}
</article>`
}

const STYLE = `
:root{color-scheme:light;--ink:#0C1120;--muted:#3D4656;--line:#E2E7EE;--accent:#0F6FAD;--soft:#E3F4FD;--warm:#B04E08;--bg:#F5F7FA}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{padding:24px 24px 8px;max-width:1400px;margin:0 auto}
h1{font-size:26px;line-height:1.25;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 12px;font-size:13px}
.identity{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 8px;padding:0;list-style:none;font-size:14px}
.identity b{color:var(--muted);font-weight:600}
.hint{color:var(--muted);font-size:13px;margin:4px 0 0}
main{max-width:1400px;margin:0 auto;padding:8px 24px 40px}
.diagram{position:relative;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:auto;padding:16px}
.diagram svg{display:block;max-width:100%;height:auto;margin:0 auto}
.diagram [data-element-id].has-sheet{cursor:pointer}
.diagram [data-element-id].has-sheet:hover .djs-visual>:first-child{stroke:var(--accent)!important;stroke-width:3px!important}
.diagram [data-element-id].current .djs-visual>:first-child{stroke:var(--accent)!important;stroke-width:3px!important;fill:var(--soft)!important}
#card{position:fixed;top:16px;right:16px;bottom:16px;width:min(440px,calc(100vw - 32px));overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px rgba(12,17,32,.18);padding:18px 20px;z-index:10}
#card[hidden]{display:none}
#card .close{position:absolute;top:12px;right:12px;width:30px;height:30px;border:1px solid var(--warm);border-radius:8px;background:#fff;color:var(--warm);font-size:18px;line-height:1;cursor:pointer}
#card .close:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#card .sheet{border:0;padding:0;margin:0;background:none}
#card .sheet h3{padding-right:36px}
section.sheets{margin-top:32px}
section.sheets>h2{font-size:20px;margin:0 0 12px}
.sheet{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:0 0 14px;break-inside:avoid}
.sheet h3{font-size:18px;margin:0}
.sheet .type{color:var(--muted);font-size:13px;margin:2px 0 10px}
.sheet dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0 0 12px;font-size:14px}
.sheet dt{color:var(--muted);font-weight:600}
.sheet dd{margin:0}
.sheet h4{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:14px 0 4px}
.sheet .md h3,.sheet .md h4,.sheet .md h5{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:14px 0 4px}
.sheet .md p,.sheet ul{margin:4px 0 8px}
.sheet ul{padding-left:20px}
.sheet ul.checks{list-style:none;padding-left:0}
.sheet ul.checks li::before{content:"☐ ";color:var(--muted)}
.sheet .todo{background:#FEF9C3;color:#A16207;border-radius:8px;padding:6px 10px;font-style:italic;margin:6px 0}
a{color:var(--accent)}
footer{max-width:1400px;margin:0 auto;padding:0 24px 32px;color:var(--muted);font-size:12px}
@media print{body{background:#fff}#card{display:none!important}.diagram{border:0;padding:0;overflow:visible}.hint{display:none}.sheet{border-color:#ccc}}
`

// Script de la page : relie les éléments du diagramme à leur fiche et ouvre la fiche au clic.
const SCRIPT = `
(function () {
  var card = document.getElementById('card');
  var body = document.getElementById('card-body');
  var current = null;
  function sheetFor(id) { return document.getElementById('sheet-' + id); }
  function close() {
    card.hidden = true;
    if (current) current.classList.remove('current');
    current = null;
  }
  function open(el) {
    var sheet = sheetFor(el.getAttribute('data-element-id'));
    if (!sheet) return;
    if (current === el) { close(); return; }
    if (current) current.classList.remove('current');
    current = el;
    el.classList.add('current');
    body.innerHTML = sheet.outerHTML.replace(/ id="sheet-[^"]*"/, '');
    card.hidden = false;
    card.querySelector('.close').focus();
  }
  var nodes = document.querySelectorAll('.diagram [data-element-id]');
  for (var i = 0; i < nodes.length; i++) {
    if (sheetFor(nodes[i].getAttribute('data-element-id'))) nodes[i].classList.add('has-sheet');
  }
  document.querySelector('.diagram').addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-element-id].has-sheet');
    if (el) open(el); else close();
  });
  card.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
})();
`

// report : rapport de processus (src/process-report.js), svg : diagramme de saveSVG().
export function docPageHtml({ report, svg }) {
  const sheets = sheetsOf(report)
  const identity = identityRows(report.identity)
  const date = report.date instanceof Date ? report.date : new Date()
  const processDocs = (report.processDocs || []).map((d) => `<article class="sheet"><h3>${e(d.name)}</h3><div class="md">${markdownToHtml(d.markdown, { headingOffset: 2 })}</div></article>`).join('\n')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="BPMN Pilot">
<title>${e(report.title)}${e(colon())}${e(T('documentation', 'documentation'))}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${e(report.title)}</h1>
  <p class="sub">${e(T(`Process documentation, generated on ${dateText(date)} by BPMN Pilot`, `Documentation du processus, générée le ${dateText(date)} par BPMN Pilot`))}</p>
  ${identity.length ? `<ul class="identity">${identity.map(([k, v]) => `<li><b>${e(k)}</b>${e(colon())}${e(v)}</li>`).join('')}</ul>` : ''}
  <p class="hint">${e(T('Click an element of the diagram to read its sheet. All the sheets follow the diagram, in the order of the flow.', 'Cliquez sur un élément du diagramme pour lire sa fiche. Toutes les fiches suivent le diagramme, dans l\'ordre du flux.'))}</p>
</header>
<main>
  <div class="diagram" role="img" aria-label="${e(T('Process diagram', 'Diagramme du processus'))}">${cleanSvg(svg)}</div>
  <section class="sheets">
    <h2>${e(T('Sheets', 'Fiches'))}</h2>
    ${processDocs}
    ${sheets.length ? sheets.map(sheetHtml).join('\n') : `<p>${e(T('No activity in this diagram.', 'Aucune activité dans ce diagramme.'))}</p>`}
  </section>
</main>
<aside id="card" hidden aria-live="polite"><button type="button" class="close" aria-label="${e(T('Close the sheet', 'Fermer la fiche'))}" title="${e(T('Close the sheet (Esc)', 'Fermer la fiche (Échap)'))}">×</button><div id="card-body"></div></aside>
<footer>${e(T('Made with BPMN Pilot', 'Réalisé avec BPMN Pilot'))}${e(' · ')}<a href="https://bpmn.leylines.fr" rel="noopener">bpmn.leylines.fr</a></footer>
<script>${SCRIPT}</script>
</body>
</html>
`
}
