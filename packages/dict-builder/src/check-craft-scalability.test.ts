import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { checkCraftScalability } from './check-craft-scalability'

const input = (): CraftCatalog => JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))

it('审计真实目录普通镶嵌、Bonded 与完整多行效果的对应和缺失数量', () => {
  expect(checkCraftScalability(input())).toEqual({ matched: 3783, missing: 291 })
})

it.each(['0.35', '0.4', '0.45', '0.5'])('重生 %s 精度声明即使总数不变也必须完整', (value) => {
  for (const replacement of [
    [],
    [{ scalable: false, formats: ['per_minute_to_per_second_2dp_if_required'] }],
    [{ scalable: true, formats: [] }],
    [{ scalable: true, formats: ['divide_by_one_hundred'] }],
    [{ scalable: true, formats: ['per_minute_to_per_second_2dp_if_required', 'extra'] }],
  ]) {
    const catalog = input()
    const line = `Regenerate ${value}% of maximum Life per second`
    catalog.scalability = { ...catalog.scalability, [line]: replacement }
    expect(() => checkCraftScalability(catalog)).toThrow(/重生符文/)
  }
})

it('拒绝缺失声明、来源漂移及未对应统计漂移', () => {
  const missing = input()
  delete missing.scalability?.['Regenerate 0.35% of maximum Life per second']
  expect(() => checkCraftScalability(missing)).toThrow()
  const source = input()
  source._meta.sources = source._meta.sources.map((entry) =>
    entry.path.endsWith('ModScalability.lua') ? { ...entry, sha256: 'a'.repeat(64) } : entry,
  )
  expect(() => checkCraftScalability(source)).toThrow()
  const extra = input()
  extra.augments?.[0]?.lines.push('Unknown scalar line')
  expect(() => checkCraftScalability(extra)).toThrow()
})
