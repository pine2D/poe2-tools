import {
  type CatalogAugment,
  craftScalabilityPatterns,
  parseCraftCatalog,
} from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import catalog from '../../../data/craft/catalog.json'
import { normalizeCraftScalability } from './adapters/craftScalability'
import { parsePobModFile } from './adapters/restrictedLua'

it('主效果与 Bonded 仅依照连续来源组采集完整换行，保留原逐行匹配', () => {
  const augment: CatalogAugment = {
    id: 'test',
    name: 'Test',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['10 Life', '20 Mana', 'Prevent +5% of Damage if', 'Condition', '30 Strength'],
    statOrder: [1, 2, 3, 3.1, 4],
    tradeHashes: {},
    levelReq: 1,
    bonded: { lines: ['8% increased Rating', 'Bonded condition'], statOrder: [5, 5.1] },
  }
  const patterns = craftScalabilityPatterns({ modifiers: [], bases: [], augments: [augment] })
  expect(patterns).toEqual([
    ...augment.lines,
    'Prevent +5% of Damage if\nCondition',
    '8% increased Rating',
    'Bonded condition',
    '8% increased Rating\nBonded condition',
  ])
  const raw = parsePobModFile(
    'return { ["# Life"]={{isScalable=true}}, ["# Mana"]={{isScalable=true}}, ["# Life\\n# Mana"]={{isScalable=true},{isScalable=true}}, ["Prevent #% of Damage if\\nCondition"]={{isScalable=true}}, ["#% increased Rating\\nBonded condition"]={{isScalable=true}} }',
  )
  const result = normalizeCraftScalability(raw, patterns)
  expect(result.lines['10 Life']).toEqual([{ scalable: true, formats: [] }])
  expect(result.lines['20 Mana']).toEqual([{ scalable: true, formats: [] }])
  expect(result.lines['10 Life\n20 Mana']).toBeUndefined()
  expect(result.lines['Prevent +5% of Damage if\nCondition']).toEqual([
    { scalable: true, formats: [] },
  ])
  expect(result.lines['8% increased Rating\nBonded condition']).toEqual([
    { scalable: true, formats: [] },
  ])
  expect(result.lines['Prevent +5% of Damage if']).toBeUndefined()
})

it('读取器接受完整来源组，拒绝任意拼接与不完整占位声明，仍兼容旧目录', () => {
  const source = structuredClone(catalog)
  const augment = source.augments.find(
    (entry) => entry.name === 'Carved Cunning' && entry.category === 'body armour',
  )
  if (!augment?.bonded) throw new Error('缺少 Cunning 样本')
  const group = augment.lines.join('\n')
  const declarations = source.scalability as Record<string, unknown>
  declarations[group] = [{ scalable: true, formats: [] }]
  expect(() => parseCraftCatalog(source)).not.toThrow()
  declarations[group] = []
  expect(() => parseCraftCatalog(source)).toThrow()
  delete declarations[group]
  expect(() => parseCraftCatalog(source)).not.toThrow()
  declarations[`${augment.lines[0]}\n${augment.bonded.lines[0]}`] = [
    { scalable: true, formats: [] },
    { scalable: true, formats: [] },
  ]
  expect(() => parseCraftCatalog(source)).toThrow()
})
