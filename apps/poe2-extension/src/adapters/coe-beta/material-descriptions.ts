// 新版 Data 页公开用途文案的人工译文（2026-09-25）。仅完整匹配，不推导制作规则。
const lead = 'While this item is active in your inventory your next '
const translatedLead = '当此物品在你的物品栏中激活时，你下一次'
const descriptions = new Map([
  [
    'Weapon or Jewellery Desecration attempt will guarantee a random Ulaman modifier',
    '尝试对武器或首饰进行渎灵时，必定获得一条随机乌拉曼词缀。',
  ],
  [
    'Weapon or Jewellery Desecration attempt will guarantee a random Amanamu modifier',
    '尝试对武器或首饰进行渎灵时，必定获得一条随机阿曼娜姆词缀。',
  ],
  [
    'Weapon or Jewellery Desecration attempt will guarantee a random Kurgal modifier',
    '尝试对武器或首饰进行渎灵时，必定获得一条随机古加尔词缀。',
  ],

  ['Chaos Orb will remove the lowest level modifier', '使用混沌石将移除等级最低的词缀。'],
  ['Chaos Orb will remove only prefix modifiers', '使用混沌石将仅移除前缀词缀。'],
  ['Chaos Orb will remove only suffix modifiers', '使用混沌石将仅移除后缀词缀。'],
  [
    'Orb of Alchemy will result in the maximum number of prefix modifiers',
    '使用点金石将生成最大数量的前缀词缀。',
  ],
  [
    'Orb of Alchemy will result in the maximum number of suffix modifiers',
    '使用点金石将生成最大数量的后缀词缀。',
  ],
  ['Regal Orb will add only prefix modifiers', '使用富豪石将仅添加前缀词缀。'],
  ['Regal Orb will add only suffix modifiers', '使用富豪石将仅添加后缀词缀。'],
  ['Vaal Orb will always result in change', '使用瓦尔宝珠必定产生变化。'],
  ['Exalted Orb will add two random modifiers', '使用崇高石将添加两条随机词缀。'],
  [
    'Regal Orb will add a Modifier of the same type as an existing Modifier on the Item',
    '使用富豪石将添加一条与该物品已有词缀类型相同的词缀。',
  ],
  [
    'Gamble purchase will have a 50% chance of costing no Gold and not consuming this Omen',
    '赌博购买有50%的几率不花费金币且不消耗此预兆。',
  ],
  [
    "sold item's Gold value will be incorrectly assessed by the Vendor",
    '出售物品时，商人会错误估算该物品的金币价值。',
  ],
  ['Divine Orb will only reroll Implicit Modifiers', '使用神圣石将仅重选基底词缀的数值。'],
  [
    'Chaos Orb will replace all Modifiers on a Waystone with Modifiers that do not grant Item Rarity',
    '使用混沌石将把引路石上的全部词缀替换为不提供物品稀有度的词缀。',
  ],
  [
    'Chaos Orb will replace all Modifiers on a Waystone with Modifiers that do not grant Pack Size',
    '使用混沌石将把引路石上的全部词缀替换为不提供怪物群规模的词缀。',
  ],
  [
    'Chaos Orb will replace all Modifiers on a Waystone with Modifiers that do not grant Monster Rarity',
    '使用混沌石将把引路石上的全部词缀替换为不提供怪物稀有度的词缀。',
  ],
  ['Orb of Chance will not destroy the Item', '使用机会石不会摧毁该物品。'],
  [
    'Orb of Chance will upgrade the Item to a random Unique of the same Item Class',
    '使用机会石将把该物品升级为同一物品类别的随机传奇物品。',
  ],
  [
    'Perfect or Corrupted Essence will remove only Suffix modifiers',
    '使用完美或腐化精华将仅移除后缀词缀。',
  ],
  [
    'Perfect or Corrupted Essence will remove only Prefix modifiers',
    '使用完美或腐化精华将仅移除前缀词缀。',
  ],

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
    '尝试渎灵将替换该物品上的全部词缀，生成最多带有六条未揭示词缀的物品，并使其腐化。',
  ],
  ['Orb of Annulment will remove only Desecrated modifiers', '使用剥离石将仅移除渎灵词缀。'],
  ['Desecration attempt will add only prefix modifiers', '尝试渎灵将仅添加前缀词缀。'],
  ['Desecration attempt will add only suffix modifiers', '尝试渎灵将仅添加后缀词缀。'],
])
const activeLead = 'While this item is active in your inventory '
const activeDescriptions = new Map([
  [
    'the next Possessed monster you kill will Release and manifest all Azmeri Spirits',
    '你下一次击杀的被附身怪物将释放所有阿兹莫里之灵，并使它们显现。',
  ],
  [
    'the next Rogue Exile you encounter will summon an ally',
    '你下一次遭遇的盗贼流放者将召唤一名盟友。',
  ],

  [
    'will fully recover your flask and charm charges when you reach Low Life',
    '你进入低血状态时会完全恢复药剂和咒符充能。',
  ],
  [
    'fully recover your Life, Mana and Energy Shield when you reach Low Life',
    '你进入低血状态时会完全恢复生命、魔力和能量护盾。',
  ],
  ['will prevent 75% of Experience loss when you die', '你死亡时会免除75%的经验损失。'],
  [
    'the next Shrine you click on will grant an additional Effect',
    '你下一次点击的神龛将额外提供一种效果。',
  ],
  ['the next Strongbox you click on will be reopenable', '你下一次点击的保险箱将可以再次开启。'],
  [
    'the next time you reveal Desecrated modifiers you can reroll the options once',
    '你下一次揭示渎灵词缀时，可以重选一次候选词缀。',
  ],
])
export function materialDescription(original: string): string | null {
  const normalized = original.trim().replace(/\s+/g, ' ')
  if (!normalized.startsWith(lead)) {
    if (!normalized.startsWith(activeLead)) return null
    const translated = activeDescriptions.get(normalized.slice(activeLead.length))
    return translated ? `当此物品在你的物品栏中激活时，${translated}` : null
  }
  const translated = descriptions.get(normalized.slice(lead.length))
  return translated ? translatedLead + translated : null
}
