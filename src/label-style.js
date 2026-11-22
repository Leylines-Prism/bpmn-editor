// Mise en forme du texte des libellés : gras, italique, souligné, taille, police.
//
// Le format BPMN le prévoit : chaque libellé (bpmndi:BPMNLabel) peut pointer vers
// un style (bpmndi:BPMNLabelStyle) rangé dans le diagramme, qui porte une police
// (dc:Font : name, size, isBold, isItalic, isUnderline). C'est enregistré tel quel
// dans le .bpmn. bpmn-js lit ces styles mais ne les dessine pas : ce module
// les applique au moment où le texte est dessiné.

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'

// Polices proposées : leurs équivalents existent dans les PDF (Helvetica, Times, Courier).
export const FONTS = [
  { id: 'sans', label: 'Sans serif', name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Serif', name: 'Times New Roman', family: '"Times New Roman", Times, serif' },
  { id: 'mono', label: 'Monospace', name: 'Courier New', family: '"Courier New", Courier, monospace' },
]
export const SIZES = [
  { size: 10, label: T('Small', 'Petit') },
  { size: 12, label: 'Normal' },
  { size: 14, label: T('Large', 'Grand') },
  { size: 18, label: T('Extra large', 'Très grand') },
  { size: 24, label: T('Huge', 'Énorme') },
]

const PROPS = ['name', 'size', 'isBold', 'isItalic', 'isUnderline']

// L'élément qui porte le libellé : pour un libellé externe, la forme à laquelle il appartient.
const targetOf = (element) => (element.type === 'label' ? element.labelTarget : element)

// Police enregistrée pour cet élément, sous forme d'objet simple, ou null.
export function fontOf(element) {
  const font = targetOf(element)?.di?.label?.labelStyle?.font
  if (!font) return null
  const result = {}
  for (const p of PROPS) if (font[p] !== undefined && font[p] !== false) result[p] = font[p]
  return Object.keys(result).length ? result : null
}

// Style SVG correspondant, pour le moteur de texte de diagram-js.
function styleOf(font) {
  if (!font) return null
  const style = {}
  if (font.name) style.fontFamily = FONTS.find((f) => f.name === font.name)?.family || font.name
  if (font.size) style.fontSize = font.size
  if (font.isBold) style.fontWeight = 'bold'
  if (font.isItalic) style.fontStyle = 'italic'
  if (font.isUnderline) style.textDecoration = 'underline'
  return style
}

// Les éléments qui ont un texte à mettre en forme.
function hasText(element) {
  const target = targetOf(element)
  if (!target || target.waypoints === undefined && !target.width) return false
  const bo = getBusinessObject(target)
  if (!bo || is(bo, 'bpmn:Process') || is(bo, 'bpmn:Collaboration')) return false
  return !!(bo.$descriptor.propertiesByName.name || is(bo, 'bpmn:TextAnnotation'))
}

// ── Dessin ──────────────────────────────────────────────────────────────────

function LabelStyleRenderer(eventBus, bpmnRenderer, textRenderer) {
  let current = null
  const createText = textRenderer.createText.bind(textRenderer)
  textRenderer.createText = (text, options = {}) =>
    current ? createText(text, { ...options, style: { ...(options.style || {}), ...current } }) : createText(text, options)

  // Avant le dessin normal : si l'élément a un style, on dessine nous-mêmes
  // avec ce style, puis on rend la main.
  eventBus.on('render.shape', 1500, (event, context) => {
    const style = styleOf(fontOf(context.element))
    if (!style || !bpmnRenderer.canRender(context.element)) return
    current = style
    try {
      return bpmnRenderer.drawShape(context.gfx, context.element, context.attrs)
    } finally {
      current = null
    }
  })
}
LabelStyleRenderer.$inject = ['eventBus', 'bpmnRenderer', 'textRenderer']

// ── Commande, annulable par Ctrl+Z ──────────────────────────────────────────

function diagramOf(di) {
  let node = di
  while (node && !is(node, 'bpmndi:BPMNDiagram')) node = node.$parent
  return node
}

function SetLabelFontHandler(bpmnFactory, moddle) {
  this._bpmnFactory = bpmnFactory
  this._moddle = moddle
}
SetLabelFontHandler.$inject = ['bpmnFactory', 'moddle']

// Style du diagramme qui a exactement cette police, créé s'il n'existe pas.
SetLabelFontHandler.prototype._styleFor = function (di, font) {
  const diagram = diagramOf(di)
  const styles = diagram.get('labelStyle')
  const same = (f) => PROPS.every((p) => (f?.[p] || undefined) === (font[p] || undefined))
  let style = styles.find((s) => same(s.font))
  if (!style) {
    style = this._moddle.create('bpmndi:BPMNLabelStyle', { font: this._moddle.create('dc:Font', font) })
    style.font.$parent = style
    style.id = this._moddle.ids.nextPrefixed('LabelStyle_', style)
    style.$parent = diagram
    styles.push(style)
  }
  return style
}

SetLabelFontHandler.prototype.execute = function (context) {
  const changed = []
  context.previous = []
  for (const element of context.elements) {
    const target = targetOf(element)
    const di = target.di
    const hadLabel = !!di.label
    context.previous.push({ di, hadLabel, style: di.label?.labelStyle })
    if (!context.font) {
      if (di.label) di.label.labelStyle = undefined
    } else {
      if (!di.label) {
        di.label = this._bpmnFactory.create('bpmndi:BPMNLabel')
        di.label.$parent = di
      }
      di.label.labelStyle = this._styleFor(di, context.font)
    }
    changed.push(target)
    if (target.label) changed.push(target.label)
  }
  return changed
}

SetLabelFontHandler.prototype.revert = function (context) {
  const changed = []
  context.elements.forEach((element, i) => {
    const target = targetOf(element)
    const { di, hadLabel, style } = context.previous[i]
    if (!hadLabel) di.label = undefined
    else di.label.labelStyle = style
    changed.push(target)
    if (target.label) changed.push(target.label)
  })
  return changed
}

// ── Menu « Mise en forme du texte » ─────────────────────────────────────────

const TEXT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 18 9.5 4h1L16 18M6.3 12.5h7.4"/><path d="M14.5 18h4"/>
</svg>`

function LabelStylePopupProvider(popupMenu, contextPad, commandStack) {
  this._popupMenu = popupMenu
  this._contextPad = contextPad
  this._commandStack = commandStack
  popupMenu.registerProvider('label-style', this)
  contextPad.registerProvider(this)
}
LabelStylePopupProvider.$inject = ['popupMenu', 'contextPad', 'commandStack']

LabelStylePopupProvider.prototype._apply = function (elements, update) {
  const base = fontOf(elements[0]) || {}
  const font = update === null ? null : { ...base, ...update }
  for (const key of Object.keys(font || {})) if (font[key] === undefined || font[key] === false) delete font[key]
  this._commandStack.execute('element.setLabelFont', { elements, font: font && Object.keys(font).length ? font : null })
}

LabelStylePopupProvider.prototype.getPopupMenuEntries = function (elements) {
  const font = fontOf(elements[0]) || {}
  // Le choix en cours est surligné (classe is-active), pas coché.
  const cls = (on, extra) => [on ? 'is-active' : '', extra].filter(Boolean).join(' ')
  const entries = {}
  const toggle = (key, letter, title, extra) => ({
    label: letter,
    title,
    className: cls(font[key], extra),
    group: { id: 'style', name: 'Style' },
    action: () => this._apply(elements, { [key]: !font[key] }),
  })
  entries['label-bold'] = toggle('isBold', T('B', 'G'), T('Bold', 'Gras'), 'label-bold')
  entries['label-italic'] = toggle('isItalic', 'I', T('Italic', 'Italique'), 'label-italic')
  entries['label-underline'] = toggle('isUnderline', T('U', 'S'), T('Underline', 'Souligné'), 'label-underline')
  for (const s of SIZES) {
    entries[`label-size-${s.size}`] = {
      label: String(s.size),
      title: `${s.label} (${s.size})`,
      className: cls(font.size === s.size),
      group: { id: 'size', name: T('Size', 'Taille') },
      action: () => this._apply(elements, { size: s.size }),
    }
  }
  for (const f of FONTS) {
    entries[`label-font-${f.id}`] = {
      label: f.label,
      title: f.name,
      className: cls(font.name === f.name, `label-font-${f.id}`),
      group: { id: 'font', name: T('Font', 'Police') },
      action: () => this._apply(elements, { name: f.name }),
    }
  }
  entries['label-reset'] = {
    label: T('Default text', 'Texte par défaut'),
    title: T('Remove formatting', 'Retirer la mise en forme'),
    group: { id: 'reset' },
    action: () => this._apply(elements, null),
  }
  return entries
}

LabelStylePopupProvider.prototype._padEntry = function (elements) {
  if (!elements.length || !elements.every(hasText)) return {}
  const contextPad = this._contextPad
  const popupMenu = this._popupMenu
  return {
    'label-style': {
      group: 'edit',
      title: T('Text formatting', 'Mise en forme du texte'),
      html: `<div class="entry">${TEXT_ICON}</div>`,
      action: {
        click: (event) => {
          const rect = contextPad.getPad(elements).html.getBoundingClientRect()
          popupMenu.open(elements, 'label-style', { x: rect.left, y: rect.bottom + 5, cursor: { x: event.x, y: event.y } }, { title: T('Text', 'Texte'), width: 220 })
        },
      },
    },
  }
}
LabelStylePopupProvider.prototype.getContextPadEntries = function (element) {
  return this._padEntry([element])
}
LabelStylePopupProvider.prototype.getMultiElementContextPadEntries = function (elements) {
  return this._padEntry(elements)
}

function registerCommand(commandStack, eventBus, elementRegistry) {
  commandStack.registerHandler('element.setLabelFont', SetLabelFontHandler)

  // À l'enregistrement, seuls les styles encore utilisés sont écrits. La liste
  // complète est remise ensuite, pour que Ctrl+Z puisse les retrouver.
  // Plusieurs enregistrements peuvent se chevaucher (sauvegarde automatique) :
  // la liste complète est prise au premier et remise au dernier.
  let pending = 0
  let kept = []
  eventBus.on('saveXML.start', ({ definitions }) => {
    if (pending++ === 0) kept = (definitions.diagrams || []).map((diagram) => [diagram, diagram.get('labelStyle').slice()])
    const used = new Set()
    for (const element of elementRegistry.getAll()) {
      const style = element.di?.label?.labelStyle
      if (style) used.add(style)
    }
    for (const [diagram, all] of kept) diagram.labelStyle = all.filter((s) => used.has(s))
  })
  eventBus.on('saveXML.done', () => {
    if (--pending > 0) return
    // Un style créé pendant l'enregistrement est gardé lui aussi.
    for (const [diagram, all] of kept) diagram.labelStyle = [...new Set([...all, ...diagram.get('labelStyle')])]
    kept = []
  })
}
registerCommand.$inject = ['commandStack', 'eventBus', 'elementRegistry']

export const LabelStyleModule = {
  __init__: ['labelStyleRenderer', 'labelStylePopupProvider', registerCommand],
  labelStyleRenderer: ['type', LabelStyleRenderer],
  labelStylePopupProvider: ['type', LabelStylePopupProvider],
}
