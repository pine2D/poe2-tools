import type { PreviewSlot } from '@poe2-tools/build-core'
import { describe, expect, it } from 'vitest'
import type { FieldWithRows } from './fields'
import { splitMarkupLines } from './markup'
import { hasText, levelRange, modStatus, slotVariant } from './plate'
import type { PairRow } from './rows'

const spans = (raw: string) => splitMarkupLines(raw)[0] ?? []
const row = (over: Partial<PairRow>): PairRow => ({
  index: 1,
  marker: '1',
  kind: 'mod',
  status: 'translated',
  base: false,
  en: spans('en'),
  zh: spans('中'),
  kept: [],
  ...over,
})
const baseRow = (status: PairRow['status']) =>
  row({ index: 0, marker: null, kind: 'name', status, base: true })
const slot = (over: Partial<PreviewSlot>): PreviewSlot => ({
  rawIndex: 0,
  inventoryId: 'Weapon1',
  label: '主手',
  slotX: 0,
  uniqueName: null,
  uniqueText: null,
  additionalText: null,
  ...over,
})
const field = (rows: PairRow[], injected: FieldWithRows['injected'] = null): FieldWithRows => ({
  entry: {
    path: 'inventory_slots[0].additional_text',
    label: '主手',
    baseName: true,
    original: null,
    translated: null,
    uniqueText: null,
  },
  injected,
  rows,
})

describe('slotVariant（spec §6.4.3 按顺序判定）', () => {
  it('有传奇名即 unique，不看首行', () => {
    expect(
      slotVariant(slot({ uniqueName: 'Surefooted Sigil' }), field([baseRow('translated')])),
    ).toBe('unique')
    expect(slotVariant(slot({ uniqueName: 'Surefooted Sigil' }), field([]))).toBe('unique')
  })
  it('首个渲染行是基底名行即 base（含未收录的基底名）', () => {
    expect(slotVariant(slot({}), field([baseRow('translated'), row({})]))).toBe('base')
    expect(slotVariant(slot({}), field([baseRow('kept')]))).toBe('base')
  })
  it('首行是编号词缀或没有行时为 collapsed', () => {
    expect(slotVariant(slot({}), field([row({ index: 0 })]))).toBe('collapsed')
    expect(slotVariant(slot({}), field([]))).toBe('collapsed')
  })
})

describe('levelRange（spec §6.4.3 第二行第 4 项）', () => {
  it('数组显示 a–b，单个整数显示 a', () => {
    expect(levelRange([{ level_interval: [16, 100] }], 0)).toBe('16–100')
    expect(levelRange([{ level_interval: 52 }], 0)).toBe('52')
  })
  it('缺失或畸形时返回 null', () => {
    expect(levelRange([{ level_interval: 52.5 }], 0)).toBeNull()
    expect(levelRange([{ level_interval: ['1', 100] }], 0)).toBeNull()
    expect(levelRange([{}], 0)).toBeNull()
    expect(levelRange(['Metadata/Gem'], 0)).toBeNull()
    expect(levelRange(undefined, 0)).toBeNull()
    expect(levelRange([], 3)).toBeNull()
  })
})

describe('modStatus（spec §6.4.3 第二行第 5 项，B1）', () => {
  it('没有编号词缀时省略', () => {
    expect(modStatus([baseRow('translated')], true, false)).toEqual({ kind: 'none' })
  })
  it('全部命中：没有名称类待核对为 ok，有则为不带 ✓ 的 count', () => {
    const rows = [baseRow('translated'), row({}), row({ index: 2, marker: '2' })]
    expect(modStatus(rows, true, false)).toEqual({ kind: 'ok', hit: 2, total: 2 })
    expect(modStatus(rows, true, true)).toEqual({ kind: 'count', hit: 2, total: 2 })
  })
  it('有未命中时为 warn；x/y 只数编号词缀，n 是该字段 isMissedRow 的行数', () => {
    const rows = [
      baseRow('translated'),
      row({}),
      row({ index: 2, marker: '2', status: 'untranslated' }),
      row({ index: 3, marker: null, kind: 'name', status: 'kept' }),
    ]
    expect(modStatus(rows, true, false)).toEqual({ kind: 'warn', hit: 1, total: 2, missed: 1 })
    expect(modStatus(rows, true, true)).toEqual({ kind: 'warn', hit: 1, total: 2, missed: 1 })
  })
})

describe('hasText', () => {
  it('条目存在且有行或注入行', () => {
    expect(hasText(undefined)).toBe(false)
    expect(hasText(field([]))).toBe(false)
    expect(hasText(field([row({})]))).toBe(true)
    expect(hasText(field([], spans('稳步印记')))).toBe(true)
  })
})
