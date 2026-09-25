// 新版 Data 页公开用途文案的人工译文（2026-09-25）。仅完整匹配，不推导制作规则。
const lead = 'While this item is active in your inventory your next '
const translatedLead = '当此物品在你的物品栏中激活时，你下一次'
const descriptions = new Map([
  ['Exalted Orb will add only prefix modifiers', '使用崇高石将仅添加前缀词缀。'],
  ['Exalted Orb will add only suffix modifiers', '使用崇高石将仅添加后缀词缀。'],
  ['Orb of Annulment will remove two modifiers', '使用剥离石将移除两条词缀。'],
  ['Orb of Annulment will remove only prefix modifiers', '使用剥离石将仅移除前缀词缀。'],
  ['Orb of Annulment will remove only suffix modifiers', '使用剥离石将仅移除后缀词缀。'],
  [
    'Exalted Orb will add a Modifier of the same type as an existing Modifier on the Item',
    '使用崇高石将添加一条与该物品已有词缀类型相同的词缀。',
  ],
  [
    'Exalted Orb will consume all Catalyst Quality to increase the chance of the corresponding type of Modifier',
    '使用崇高石将消耗全部催化剂品质，提高对应类型词缀的出现几率。',
  ],
  [
    'Desecration attempt will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item',
    '尝试亵渎将替换该物品上的全部词缀，生成最多带有六条未揭示词缀的物品，并使其腐化。',
  ],
  ['Orb of Annulment will remove only Desecrated modifiers', '使用剥离石将仅移除亵渎词缀。'],
  ['Desecration attempt will add only prefix modifiers', '尝试亵渎将仅添加前缀词缀。'],
  ['Desecration attempt will add only suffix modifiers', '尝试亵渎将仅添加后缀词缀。'],
])
export function materialDescription(original: string): string | null {
  const normalized = original.trim().replace(/\s+/g, ' ')
  if (!normalized.startsWith(lead)) return null
  const translated = descriptions.get(normalized.slice(lead.length))
  return translated ? translatedLead + translated : null
}
