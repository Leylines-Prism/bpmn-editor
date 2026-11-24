// Mise en forme du texte des libellés : gras, italique, souligné, taille, police, couleur.
//
// Le format BPMN le prévoit : chaque libellé (bpmndi:BPMNLabel) peut pointer vers
// un style (bpmndi:BPMNLabelStyle) rangé dans le diagramme, qui porte une police
// (dc:Font : name, size, isBold, isItalic, isUnderline). C'est enregistré tel quel
// dans le .bpmn. bpmn-js lit ces styles mais ne les dessine pas : ce module
// les applique au moment où le texte est dessiné.

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil'
import { T } from './i18n/lang.js'
import { COLORS } from './color-palette.js'

// Polices proposées. Les trois premières ont leur équivalent dans les PDF
// (Helvetica, Times, Courier). Les autres sont présentes sur la plupart des
// ordinateurs : à défaut, le navigateur prend une police de la même famille,
// et l'export PDF les remplace par Helvetica ou Times.
export const FONTS = [
  { id: 'sans', label: 'Sans', name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Serif', name: 'Times New Roman', family: '"Times New Roman", Times, serif' },
  { id: 'mono', label: 'Mono', name: 'Courier New', family: '"Courier New", Courier, monospace' },
  { id: 'verdana', label: 'Verdana', name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', name: 'Tahoma', family: 'Tahoma, Verdana, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet', name: 'Trebuchet MS', family: '"Trebuchet MS", Helvetica, sans-serif' },
  { id: 'georgia', label: 'Georgia', name: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { id: 'palatino', label: 'Palatino', name: 'Palatino Linotype', family: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { id: 'comic', label: 'Comic', name: 'Comic Sans MS', family: '"Comic Sans MS", "Comic Sans", cursive' },
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

// Couleur du texte : l'attribut standard color:color du libellé (BPMN in Color),
// que bpmn-js dessine lui-même. null si elle n'est pas réglée.
export function textColorOf(element) {
  return targetOf(element)?.di?.label?.get('color:color') || null
}

// Fond de la forme, pour choisir un texte lisible (noir ou blanc).
export function fillOf(element) {
  const di = targetOf(element)?.di
  return di?.get('color:background-color') || di?.get('bioc:fill') || '#FFFFFF'
}

// Luminance relative (WCAG) d'une couleur #RRGGBB.
export function luminance(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16)
  if (Number.isNaN(n)) return 1
  const lin = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

// Noir ou blanc, celui qui contraste le plus avec ce fond.
export function readableOn(fill) {
  const l = luminance(fill)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#FFFFFF'
}

// Couleurs proposées pour le texte : noir, blanc, puis les traits de la palette du pinceau.
export const TEXT_COLORS = [
  { label: T('Black', 'Noir'), color: '#000000' },
  { label: T('White', 'Blanc'), color: '#FFFFFF' },
  ...COLORS.filter((c) => c.stroke).map((c) => ({ label: c.label, color: c.stroke })),
]

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
export function hasText(element) {
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
    // « delete » et non « = undefined » : bpmnlint parcourt toute propriété présente, même vide.
    if (!hadLabel) delete di.label
    else di.label.labelStyle = style
    changed.push(target)
    if (target.label) changed.push(target.label)
  })
  return changed
}

// context.colors : une couleur (ou null pour la retirer) par élément.
function SetLabelColorHandler(bpmnFactory) {
  this._bpmnFactory = bpmnFactory
}
SetLabelColorHandler.$inject = ['bpmnFactory']

SetLabelColorHandler.prototype.execute = function (context) {
  const changed = []
  context.previous = []
  context.elements.forEach((element, i) => {
    const target = targetOf(element)
    const di = target.di
    const color = context.colors[i] || undefined
    context.previous.push({ di, hadLabel: !!di.label, color: di.label?.get('color:color') })
    if (!di.label) {
      if (!color) return
      di.label = this._bpmnFactory.create('bpmndi:BPMNLabel')
      di.label.$parent = di
    }
    di.label.set('color:color', color)
    changed.push(target)
    if (target.label) changed.push(target.label)
  })
  return changed
}

SetLabelColorHandler.prototype.revert = function (context) {
  const changed = []
  context.elements.forEach((element, i) => {
    const target = targetOf(element)
    const { di, hadLabel, color } = context.previous[i]
    // « delete » et non « = undefined » : bpmnlint parcourt toute propriété présente, même vide.
    if (!hadLabel) delete di.label
    else di.label.set('color:color', color)
    changed.push(target)
    if (target.label) changed.push(target.label)
  })
  return changed
}

// ── Réglages partagés par le menu « Texte » et le panneau Apparence ─────────

// update : les champs de police à changer, fusionnés avec la police actuelle,
// ou null pour la retirer.
export function applyFont(commandStack, elements, update) {
  const base = fontOf(elements[0]) || {}
  const font = update === null ? null : { ...base, ...update }
  for (const key of Object.keys(font || {})) if (font[key] === undefined || font[key] === false) delete font[key]
  commandStack.execute('element.setLabelFont', { elements, font: font && Object.keys(font).length ? font : null })
}

// color : une couleur, 'auto' (noir ou blanc selon le fond de chaque élément) ou null.
export function applyTextColor(commandStack, elements, color) {
  const colors = elements.map((e) => (color === 'auto' ? readableOn(fillOf(e)) : color))
  commandStack.execute('element.setLabelColor', { elements, colors })
}

// « Texte par défaut » : police et couleur retirées en une seule étape d'annulation.
export function resetText(commandStack, elements) {
  commandStack.execute('label-style.reset', { elements })
}

// ── Menu « Mise en forme du texte » ─────────────────────────────────────────

const swatch = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="4" fill="${color}" stroke="rgba(12,17,32,0.35)" stroke-width="1.5"/><text x="12" y="16.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${readableOn(color)}">A</text></svg>`

export const AUTO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="4" fill="#FFFFFF" stroke="rgba(12,17,32,0.35)" stroke-width="1.5"/><path d="M2.75 21.25 21.25 2.75V18a3.25 3.25 0 0 1-3.25 3.25Z" fill="#0C1120"/><text x="8.5" y="12" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#000">A</text><text x="16" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#FFF">A</text></svg>`

const CUSTOM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><defs><linearGradient id="text-color-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0D4372"/><stop offset="0.5" stop-color="#880E4F"/><stop offset="1" stop-color="#714800"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="4" fill="url(#text-color-gradient)" stroke="rgba(12,17,32,0.35)" stroke-width="1.5" stroke-dasharray="3 2"/></svg>`

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
  applyFont(this._commandStack, elements, update)
}

LabelStylePopupProvider.prototype._applyColor = function (elements, color) {
  applyTextColor(this._commandStack, elements, color)
}

// Sélecteur de couleur du système, pour une couleur libre.
LabelStylePopupProvider.prototype._pickColor = function (elements) {
  const input = document.createElement('input')
  input.type = 'color'
  const current = textColorOf(elements[0])
  input.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#000000'
  input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:50%;top:50%'
  document.body.append(input)
  input.addEventListener('change', () => {
    this._applyColor(elements, input.value.toUpperCase())
    input.remove()
  })
  input.addEventListener('blur', () => setTimeout(() => input.remove(), 1000))
  input.click()
}

LabelStylePopupProvider.prototype.getPopupMenuEntries = function (elements) {
  const font = fontOf(elements[0]) || {}
  const color = (textColorOf(elements[0]) || '').toUpperCase()
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
  const colorGroup = { id: 'color', name: T('Color', 'Couleur') }
  TEXT_COLORS.forEach((c, i) => {
    entries[`label-color-${i}`] = {
      title: c.label,
      imageHtml: swatch(c.color),
      className: cls(color === c.color),
      group: colorGroup,
      action: () => this._applyColor(elements, c.color),
    }
  })
  const colorMore = { id: 'color-more' }
  entries['label-color-auto'] = {
    label: 'Auto',
    title: T('Black or white, whichever reads best on the fill', 'Noir ou blanc, le plus lisible sur le fond'),
    imageHtml: AUTO_ICON,
    group: colorMore,
    action: () => this._applyColor(elements, 'auto'),
  }
  entries['label-color-custom'] = {
    label: T('Custom…', 'Autre…'),
    title: T('Custom color…', 'Couleur personnalisée…'),
    imageHtml: CUSTOM_ICON,
    className: cls(color && !TEXT_COLORS.some((c) => c.color === color)),
    group: colorMore,
    action: () => this._pickColor(elements),
  }
  entries['label-reset'] = {
    label: T('Default text', 'Texte par défaut'),
    title: T('Remove formatting and color', 'Retirer la mise en forme et la couleur'),
    group: { id: 'reset' },
    action: () => resetText(this._commandStack, elements),
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
  commandStack.registerHandler('element.setLabelColor', SetLabelColorHandler)
  // « Texte par défaut » : police et couleur retirées en une seule étape d'annulation.
  commandStack.registerHandler('label-style.reset', function () {
    this.preExecute = ({ elements }) => {
      commandStack.execute('element.setLabelColor', { elements, colors: elements.map(() => null) })
      commandStack.execute('element.setLabelFont', { elements, font: null })
    }
    this.execute = () => []
    this.revert = () => []
  })

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
