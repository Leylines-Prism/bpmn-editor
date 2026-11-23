import { T } from './i18n/lang.js'

// Palette élargie du sélecteur de couleurs (pinceau du menu contextuel).
//
// bpmn-js-color-picker ne propose que 6 couleurs. On lui passe ici 18 teintes
// (fond pâle, trait foncé et lisible), et on ajoute une entrée « Couleur
// personnalisée… » qui ouvre le sélecteur de couleur du système.

// fill : fond de la forme, stroke : contour et texte (contraste ≥ 4.5:1 sur le fond).
export const COLORS = [
  { label: T('Default', 'Par défaut'), fill: undefined, stroke: undefined },
  { label: T('Grey', 'Gris'), fill: '#E0E0E0', stroke: '#424242' },
  { label: T('Blue', 'Bleu'), fill: '#BBDEFB', stroke: '#0D4372' },
  { label: T('Sky', 'Ciel'), fill: '#B3E5FC', stroke: '#01579B' },
  { label: T('Cyan', 'Cyan'), fill: '#B2EBF2', stroke: '#005662' },
  { label: T('Teal', 'Turquoise'), fill: '#B2DFDB', stroke: '#004D40' },
  { label: T('Green', 'Vert'), fill: '#C8E6C9', stroke: '#205022' },
  { label: T('Light green', 'Vert clair'), fill: '#DCEDC8', stroke: '#33691E' },
  { label: T('Lime', 'Citron'), fill: '#F0F4C3', stroke: '#5F5A00' },
  { label: T('Yellow', 'Jaune'), fill: '#FFF9C4', stroke: '#6B5D00' },
  { label: T('Amber', 'Ambre'), fill: '#FFECB3', stroke: '#714800' },
  { label: T('Orange', 'Orange'), fill: '#FFE0B2', stroke: '#6B3C00' },
  { label: T('Coral', 'Corail'), fill: '#FFCCBC', stroke: '#8A2B0E' },
  { label: T('Red', 'Rouge'), fill: '#FFCDD2', stroke: '#831311' },
  { label: T('Pink', 'Rose'), fill: '#F8BBD0', stroke: '#880E4F' },
  { label: T('Purple', 'Violet'), fill: '#E1BEE7', stroke: '#5B176D' },
  { label: T('Indigo', 'Indigo'), fill: '#C5CAE9', stroke: '#1A237E' },
  { label: T('Brown', 'Brun'), fill: '#D7CCC8', stroke: '#3E2723' },
]

// Trait lisible pour un fond choisi librement : la même teinte, très assombrie
// sur un fond clair, très éclaircie sur un fond foncé (sinon le texte ne se lit pas).
export function strokeFor(hex) {
  const n = parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lin = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const lum = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  const shade = lum < 0.18 ? (c) => Math.round(c + (255 - c) * 0.88) : (c) => Math.round(c * 0.3)
  const [r, g, b] = rgb.map(shade)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()
}

const RAINBOW = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" height="100%" width="100%">
    <defs><linearGradient id="custom-color-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#BBDEFB"/><stop offset="0.5" stop-color="#F8BBD0"/><stop offset="1" stop-color="#FFE0B2"/>
    </linearGradient></defs>
    <rect rx="2" x="1" y="1" width="22" height="22" fill="url(#custom-color-gradient)" stroke="rgb(34, 36, 42)" style="stroke-width:2" stroke-dasharray="3 2"></rect>
  </svg>`

function CustomColorProvider(popupMenu, modeling) {
  popupMenu.registerProvider('color-picker', this)
  this.getPopupMenuEntries = (elements) => ({
    'custom-color': {
      title: T('Custom color…', 'Couleur personnalisée…'),
      label: T('Custom color…', 'Couleur personnalisée…'),
      imageHtml: RAINBOW,
      group: { id: 'custom' },
      action() {
        const input = document.createElement('input')
        input.type = 'color'
        const current = elements[0]?.di?.get?.('background-color') || elements[0]?.di?.get?.('color:background-color')
        input.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#BBDEFB'
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:50%;top:50%'
        document.body.append(input)
        input.addEventListener('change', () => {
          modeling.setColor(elements, { fill: input.value, stroke: strokeFor(input.value) })
          input.remove()
        })
        input.addEventListener('blur', () => setTimeout(() => input.remove(), 1000))
        input.click()
      },
    },
  })
}
CustomColorProvider.$inject = ['popupMenu', 'modeling']

export const CustomColorModule = {
  __init__: ['customColorProvider'],
  customColorProvider: ['type', CustomColorProvider],
}
