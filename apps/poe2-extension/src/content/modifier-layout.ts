/** 按词缀区的可用宽度排列前后缀表，避免右侧装备卡挤窄文字列。 */
export function attachModifierLayout(doc: Document): () => void {
  const style = doc.createElement('style')
  style.dataset.poe2L10nStyle = 'modifier-layout'
  style.textContent = `
    #output .modifierTypeGroup.type_explicits { container: poe2-modifiers / inline-size; }
    @container poe2-modifiers (max-width: 72rem) {
      #explicitsZone,
      #explicitsZone > div,
      #explicitsZone > div > .explicitCell {
        display: block;
        width: 100%;
        box-sizing: border-box;
      }
    }
  `
  doc.head.append(style)
  return () => style.remove()
}
