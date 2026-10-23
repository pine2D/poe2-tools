import { expect, it } from 'vitest'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import { resolveStat, type StatTemplate } from './resolve'

function inspect(line: string, dictionary: ItemDictionary, english = false) {
  const parsed = parseItem(
    english
      ? `Item Class: Rings\nRarity: Rare\nTest\nGold Ring\n--------\nItem Level: 86\n--------\n{ Prefix Modifier }\n${line}`
      : `物品类别: 戒指\n稀有度: 稀有\n测试\n金戒指\n--------\n物品等级: 86\n--------\n{ 前缀属性 }\n${line}`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const resolution = inspectItem(parsed.item, dictionary).mods[0]?.stats[0]?.resolution
  if (!resolution) throw new Error('缺少词缀解析结果')
  return resolution
}

it('重复检查仍能看到词典条目与占位顺序的原地修改', () => {
  const order = [0, 1]
  const entry = { id: 'a', en: '# to # Fire Damage', text: '甲 # 乙 #', order }
  const entries: StatTemplate[] = [entry]
  const dictionary = { stats: { entries } }
  expect(inspect('甲 12 乙 34', dictionary).english).toBe('12 to 34 Fire Damage')
  order.reverse()
  expect(inspect('甲 12 乙 34', dictionary).english).toBe('34 to 12 Fire Damage')
  entry.id = 'b'
  entry.en = '# to # Cold Damage'
  expect(inspect('甲 12 乙 34', dictionary).candidates).toEqual([
    { id: 'b', english: '34 to 12 Cold Damage' },
  ])
  entry.text = '丙 # 丁 #'
  expect(inspect('甲 12 乙 34', dictionary).english).toBeNull()
  expect(inspect('丙 12 丁 34', dictionary).english).toBe('34 to 12 Cold Damage')
  entries.unshift({ id: 'c', en: '# to # Fire Damage', text: entry.text })
  expect(inspect('丙 12 丁 34', dictionary).english).toBeNull()
  entries.reverse()
  expect(inspect('丙 12 丁 34', dictionary).candidates.map(({ id }) => id)).toEqual(['b', 'c'])
  entries.pop()
  expect(inspect('丙 12 丁 34', dictionary).english).toBe('34 to 12 Cold Damage')
})

it('同一词典交替处理中文、英文与混合输入时不串用占位顺序', () => {
  const dictionary: ItemDictionary = {
    stats: { entries: [{ id: 'a', en: '# to # Fire Damage', text: '甲 # 乙 #', order: [1, 0] }] },
  }
  for (let n = 0; n < 3; n++) {
    expect(inspect('甲 12 乙 34', dictionary).english).toBe('34 to 12 Fire Damage')
    expect(inspect('12 to 34 Fire Damage', dictionary, true).english).toBe('12 to 34 Fire Damage')
    dictionary.mixedInput = true
    expect(inspect('12 to 34 Fire Damage', dictionary).english).toBe('12 to 34 Fire Damage')
    expect(inspect('甲 12 乙 34', dictionary).english).toBe('34 to 12 Fire Damage')
    dictionary.mixedInput = false
    expect(inspect('12 to 34 Fire Damage', dictionary).english).toBeNull()
  }
})

it('不同词典、返回候选修改与调用方自有解析器互不污染', () => {
  const a: ItemDictionary = { stats: { entries: [{ id: 'a', en: '# Life', text: '甲 #' }] } }
  const b: ItemDictionary = { stats: { entries: [{ id: 'b', en: '# Mana', text: '甲 #' }] } }
  const first = inspect('甲 12', a)
  if (first.candidates[0]) first.candidates[0].english = '被修改'
  expect(inspect('甲 12', b).english).toBe('12 Mana')
  expect(inspect('甲 12', a).english).toBe('12 Life')
  a.resolveStat = () => ({ english: 'custom', candidates: [{ id: 'custom', english: 'custom' }] })
  expect(inspect('甲 12', a).english).toBe('custom')
  delete a.resolveStat
  expect(inspect('甲 12', a).english).toBe('12 Life')
})

it('单行复核与整件检查复用时仍同步词典变更和候选顺序', () => {
  const entries = [{ id: 'a', en: '# Life', text: '甲 #' }]
  const dictionary = { stats: { entries } }
  expect(inspect('甲 12', dictionary).english).toBe('12 Life')
  expect(resolveStat('甲 12', entries).english).toBe('12 Life')
  entries[0] = { id: 'b', en: '# Mana', text: '甲 #' }
  expect(resolveStat('甲 12', entries).candidates).toEqual([{ id: 'b', english: '12 Mana' }])
  expect(inspect('甲 12', dictionary).english).toBe('12 Mana')
  entries.push({ id: 'c', en: '# Life', text: '甲 #' })
  expect(resolveStat('甲 12', entries).english).toBeNull()
  expect(inspect('甲 12', dictionary).candidates.map(({ id }) => id)).toEqual(['b', 'c'])
})
