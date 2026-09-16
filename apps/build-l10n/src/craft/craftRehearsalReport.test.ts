import type { CraftResult, CraftStep } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { buildCraftRehearsalReport } from './craftRehearsalReport'

const catalog = boneCatalog()
const initialState = { ...boneState(), rarity: 'normal' as const, sourceText: 'PRIVATE PRICE NOTE' }
const operations: CraftStep[] = [
  { currency: 'transmutation', modIds: ['prefix1'], rolls: [{ modId: 'prefix1', values: [1] }] },
  { currency: 'augmentation', modIds: ['suffix1'], rolls: [{ modId: 'suffix1', values: [10] }] },
]
const input = {
  catalog,
  initialState,
  operations,
  cursor: 1,
  translations: { 'Synthetic Base': '测试头盔' },
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

it('按当前游标回放选定结果，省略未来与原始私人备注，输入不变', () => {
  const before = structuredClone({ initialState, operations })
  const text = must(buildCraftRehearsalReport(input))
  expect(text).toContain('测试头盔')
  expect(text).toContain('步骤 1：蜕变石')
  expect(text).toContain('prefix1 1')
  expect(text).toContain('蜕变石 × 1')
  expect(text).toContain('可重做 1 步未计入')
  expect(text).not.toContain('suffix1')
  expect(text).not.toContain('PRIVATE PRICE NOTE')
  expect(text).toContain('不保证游戏中得到相同结果')
  expect({ initialState, operations }).toEqual(before)
})

it('重做后材料和结果同步增加，回到起点不把已有状态计作消费', () => {
  const full = must(buildCraftRehearsalReport({ ...input, cursor: 2 }))
  expect(full).toContain('步骤 2：增幅石')
  expect(full).toContain('suffix1 10')
  expect(full).toContain('增幅石 × 1')
  const zero = must(buildCraftRehearsalReport({ ...input, cursor: 0 }))
  expect(zero).toContain('尚未消耗材料')
  expect(zero).not.toContain('步骤 1：')
})

it('包含未来时独立列出计划材料，回放后续结果但不当作已消费', () => {
  const before = structuredClone(input)
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      includeFuture: true,
      pricing: {
        unit: 'divine',
        baseCost: 3,
        prices: {
          'currency:transmutation': 2,
          'currency:augmentation': 7,
        },
      },
    }),
  )
  const summary = text.split('步骤 0：')[0] ?? ''
  const consumed = summary.split('已应用材料合计：')[1]?.split('后续计划材料：')[0]
  expect(consumed).toContain('蜕变石 × 1')
  expect(consumed).toContain('总费用：5 神圣石')
  expect(consumed).not.toContain('增幅石 × 1')
  const planned = summary.split('后续计划材料：')[1]
  expect(planned).toContain('增幅石 × 1')
  expect(planned).toContain('总费用：7 神圣石')
  expect(text).toContain('计划步骤 2（未执行）：增幅石')
  expect(text).toContain('本步计划结果：')
  expect(text).toContain('suffix1 10')
  expect(text).toContain('执行至本步的预计累计费用（含起点）：\n已知小计：12 神圣石')
  expect(text).not.toContain('PRIVATE PRICE NOTE')
  expect(input).toEqual(before)
})

it('计划范围从实际游标分界，包含未来时拒绝无效未来而非导出半份计划', () => {
  const text = must(buildCraftRehearsalReport({ ...input, cursor: 0, includeFuture: true }))
  expect(text).toContain('尚未消耗材料')
  expect(text).toContain('计划步骤 1（未执行）：蜕变石')
  const first = operations[0]
  if (!first) throw Error('缺少测试步骤')
  const invalid = { ...input, includeFuture: true, operations: [first, first] }
  expect(buildCraftRehearsalReport(invalid)).toMatchObject({ ok: false })
  expect(buildCraftRehearsalReport({ ...invalid, includeFuture: false }).ok).toBe(true)
  const done = must(buildCraftRehearsalReport({ ...input, cursor: 2, includeFuture: true }))
  expect(done).not.toContain('计划步骤')
  expect(done).not.toContain('后续计划材料：')
})

it('未来缺价不污染已消费报价，未来新增费用也不要求再次填写起点价格', () => {
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      includeFuture: true,
      pricing: { unit: 'divine', baseCost: 3, prices: { 'currency:transmutation': 0 } },
    }),
  )
  const summary = text.split('步骤 0：')[0] ?? ''
  expect(summary.split('后续计划材料：')[0]).toContain('总费用：3 神圣石')
  expect(summary.split('后续计划材料：')[1]).toContain('总费用：未知')
  expect(summary.split('后续计划材料：')[1]).toContain('缺价：增幅石')
  const missingBase =
    must(
      buildCraftRehearsalReport({
        ...input,
        includeFuture: true,
        pricing: {
          unit: 'divine',
          prices: { 'currency:transmutation': 0, 'currency:augmentation': 7 },
        },
      }),
    ).split('步骤 0：')[0] ?? ''
  expect(missingBase.split('后续计划材料：')[0]).toContain('起点成本：未填写')
  expect(missingBase.split('后续计划材料：')[1]).toContain('总费用：7 神圣石')
  expect(missingBase.split('后续计划材料：')[1]).not.toContain('起点成本：未填写')
})

it('缺价保留未知，零单价和起点成本正确计入', () => {
  const partial = must(
    buildCraftRehearsalReport({
      ...input,
      cursor: 2,
      pricing: { unit: 'divine', baseCost: 3, prices: { 'currency:transmutation': 0 } },
    }),
  )
  expect(partial).toContain('已知小计：3 神圣石')
  expect(partial).toContain('总费用：未知')
  expect(partial).toContain('缺价：增幅石')
  const complete = must(
    buildCraftRehearsalReport({
      ...input,
      pricing: { unit: 'divine', baseCost: 3, prices: { 'currency:transmutation': 0 } },
    }),
  )
  expect(complete).toContain('总费用：3 神圣石')
})

it('拒绝非法游标和不能实际回放的步骤，不导出半份清单', () => {
  for (const cursor of [-1, 1.5, 3, Number.NaN])
    expect(buildCraftRehearsalReport({ ...input, cursor }).ok).toBe(false)
  const result = buildCraftRehearsalReport({
    ...input,
    operations: [{ currency: 'exalted', modIds: ['prefix1'] }],
  })
  expect(result.ok).toBe(false)
})

it('完美溶剂清单保留原观察及声明，明确装备最高等级结果', () => {
  const skillCatalog = boneCatalog('Sceptre')
  const skillBase = skillCatalog.bases[0]
  if (!skillBase) throw Error('缺少测试基底')
  skillBase.implicit = 'Grants Skill: Level (1-20) Test Minion'
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      catalog: skillCatalog,
      initialState: {
        ...boneState(),
        implicitLines: ['Grants Skill: Level 12 Test Minion (Max Level 13)'],
      },
      operations: [{ kind: 'perfect-flux', previousMaxLevel: 13 }],
    }),
  )
  expect(text).toContain('操作前声明的装备最高等级：13')
  expect(text).toContain('装备技能最高等级：20')
  expect(text).toContain('Grants Skill: Level 12 Test Minion (Max Level 13)')
  expect(text).toContain('原固有技能行为起点观察')
})

it('萃取的终态只显示摧毁和逐孔返还，不将历史属性当作仍可用装备', () => {
  const extractionCatalog = {
    ...catalog,
    augments: [
      {
        id: 'fire',
        name: 'Desert Rune',
        category: 'armour',
        type: 'Rune' as const,
        localMod: false,
        lines: ['+12% to Fire Resistance'],
        statOrder: [1],
        tradeHashes: {},
        levelReq: 1,
      },
    ],
  }
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      catalog: extractionCatalog,
      initialState: { ...boneState(['prefix1']), sockets: ['fire', 'fire'] },
      operations: [{ kind: 'extraction' }],
    }),
  )
  const after = text.split('步骤 1：萃取石')[1]
  expect(after).toContain('装备已摧毁')
  expect(after).toContain('返还：Desert Rune × 2')
  expect(after).not.toContain('prefix1 5')
  expect(after).toContain('返还物不抵扣材料费用')
})

it('移除结果指出原词缀位置与原值，不能只靠读者比较整件装备', () => {
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      initialState: boneState(['prefix1', 'suffix1']),
      operations: [{ currency: 'annulment', modIds: [], removeModId: 'suffix1' }],
    }),
  )
  const step = text.split('步骤 1：剥离石')[1]
  expect(step).toContain('选定移除结果：原词缀 2')
  expect(step).toContain('suffix1 5')
  expect(step?.split('本步选定结果：')[1]).not.toContain('suffix1 5')
})

it('破裂清单指出被选定词缀，镶嵌清单指出被使用的孔', () => {
  const text = must(
    buildCraftRehearsalReport({
      ...input,
      initialState: boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
      operations: [{ kind: 'fracture', modId: 'suffix1' }],
    }),
  )
  expect(text).toContain('选定破裂结果：原词缀 3')
  const socketCatalog = {
    ...catalog,
    augments: [
      {
        id: 'fire',
        name: 'Desert Rune',
        category: 'armour',
        type: 'Rune' as const,
        localMod: false,
        lines: ['+12% to Fire Resistance'],
        statOrder: [1],
        tradeHashes: {},
        levelReq: 1,
      },
    ],
  }
  const socketText = must(
    buildCraftRehearsalReport({
      ...input,
      catalog: socketCatalog,
      initialState: { ...boneState(), sockets: [null, null] },
      operations: [{ kind: 'socket', socketIndex: 1, augmentId: 'fire' }],
    }),
  )
  expect(socketText).toContain('操作孔位：孔 2')
})
