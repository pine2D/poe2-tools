import { describe, expect, it } from 'vitest'
import { catalog, dictionary, imported, parse, raw } from './catalystTestFixture'
import { collectCraftCosts, quoteCraftCosts } from './craftCosts'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { inspectItem } from './export'
import type { CraftCurrency, CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'

const currencies = ['exalted', 'greater_exalted', 'perfect_exalted'] as const
const strategy: CraftStrategy = {
  maxSteps: 10,
  rules: [
    {
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'exalted', omen: 'catalysing_exaltation' },
    },
  ],
}

function project(currency: CraftCurrency = 'exalted'): CraftProject {
  const initial = imported()
  if (!initial.ok) throw new Error(initial.error)
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: initial.value,
    scalabilitySourceHash: statScalabilitySourceHash(catalog) as string,
    operations: [
      {
        currency,
        omen: 'catalysing_exaltation',
        modIds: ['FireResist6'],
        rolls: [{ modId: 'FireResist6', values: [31] }],
      },
      {
        currency: 'exalted',
        modIds: ['IncreasedMana1'],
        rolls: [{ modId: 'IncreasedMana1', values: [10] }],
      },
    ],
    cursor: 2,
    strategy,
  }
}

function restore(value: unknown) {
  return parseCraftProject(JSON.stringify(value), catalog, dictionary)
}

describe('催化崇高项目版本与消费历史', () => {
  it('当前格式为 v55，拒绝未来 v56', () => {
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v55')
    expect(restore({ ...project(), rulesVersion: 'basic-2026-09-12-v56' }).ok).toBe(false)
  })

  it.each(currencies)('%s 的各游标恢复品质、原文、持续指引和实际材料费用', (currency) => {
    const input = project(currency)
    for (const cursor of [0, 1, 2]) {
      const restored = parseCraftProject(
        serializeCraftProject({ ...input, cursor }),
        catalog,
        dictionary,
      )
      if (!restored.ok) throw new Error(restored.error)
      const state = restored.value.states[cursor]
      if (!state) throw new Error('缺少游标状态')
      expect(restored.value.project.initialState.catalyst).toEqual({ id: 'Flesh', quality: 20 })
      expect(state.catalyst).toEqual({ id: 'Flesh', quality: cursor === 0 ? 20 : 0 })
      expect(state.sourceText).toBe(raw)
      expect(state.affixes).toHaveLength(cursor + 1)
      expect(restored.value.project.operations).toEqual(input.operations)
      expect(evaluateCraftStrategy(catalog, state, strategy, cursor)).toMatchObject({
        ok: true,
        value: { kind: cursor === 0 ? 'action' : 'blocked' },
      })
      const costs = collectCraftCosts(catalog, restored.value.project.operations.slice(0, cursor))
      if (!costs.ok) throw new Error(costs.error)
      expect(
        costs.value.find((cost) => cost.id === 'omen:Omen of Catalysing Exaltation')?.count ?? 0,
      ).toBe(cursor === 0 ? 0 : 1)
      const quote = quoteCraftCosts(costs.value, {
        unit: 'exalted',
        prices: {
          'currency:exalted': 1,
          [`currency:${currency}`]: 1,
          'omen:Omen of Catalysing Exaltation': 3,
        },
      })
      expect(quote).toMatchObject({ ok: true, value: { total: [0, 4, 5][cursor], missing: [] } })
    }
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '消费后 %s 导出回读保留零品质与词缀基础值',
    (locale) => {
      const restored = restore(project())
      if (!restored.ok) throw new Error(restored.error)
      const state = restored.value.states[2]
      if (!state) throw new Error('缺少消费后状态')
      const output = exportCraftItemText(catalog, state, { locale, dictionary })
      if (!output.ok) throw new Error(output.error)
      expect(output.value.text).toContain('Quality (Life Modifiers): +0%')
      expect(output.value.text).toContain('19(10-19)')
      const item = parse(output.value.text)
      const reread = importCraftState(
        catalog,
        state.baseId,
        item,
        inspectItem(item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      )
      expect(reread).toMatchObject({
        ok: true,
        value: { catalyst: state.catalyst, affixes: state.affixes },
      })
    },
  )

  it('v2–v53 拒绝所有实际步骤、撤销后步骤及未命中指引中的新预兆', () => {
    const input = project()
    const dormant: CraftStrategy = {
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }, ...strategy.rules],
    }
    for (let version = 2; version <= 53; version++) {
      const old = { ...input, rulesVersion: `basic-2026-09-12-v${version}` }
      for (const cursor of [0, 1, 2])
        expect(restore({ ...old, strategy: undefined, cursor }).ok).toBe(false)
      expect(restore({ ...old, operations: [], cursor: 0, strategy: dormant }).ok).toBe(false)
    }
    expect(
      restore({ ...input, strategy: undefined, rulesVersion: 'basic-2026-09-12-v53', cursor: 0 }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('催化崇高') })
    expect(
      restore({
        ...input,
        operations: [],
        cursor: 0,
        strategy: dormant,
        rulesVersion: 'basic-2026-09-12-v53',
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('催化崇高') })
  })

  it('无新机制的 v2–v53 项目可升级，v53 的已有催化品质不受影响', () => {
    const plain = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      initialState: {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      },
      operations: [],
      cursor: 0,
    }
    for (let version = 2; version <= 53; version++) {
      expect(restore({ ...plain, rulesVersion: `basic-2026-09-12-v${version}` })).toMatchObject({
        ok: true,
        value: { project: { rulesVersion: CRAFT_RULES_VERSION } },
      })
    }
    expect(
      restore({
        ...project(),
        strategy: undefined,
        operations: [],
        cursor: 0,
        rulesVersion: 'basic-2026-09-12-v53',
      }),
    ).toMatchObject({
      ok: true,
      value: { project: { initialState: { catalyst: { id: 'Flesh', quality: 20 } } } },
    })
  })

  it('消费后的保存不能弱化起点来源与缩放指纹核对，也不能在撤销后藏第二次消费', () => {
    const input = project()
    for (const damaged of [
      { ...input, scalabilitySourceHash: undefined },
      { ...input, scalabilitySourceHash: '0'.repeat(64) },
      { ...input, initialState: { ...input.initialState, catalyst: { id: 'Flesh', quality: 10 } } },
      {
        ...input,
        initialState: { ...input.initialState, sourceText: raw.replace('+20%', '+10%') },
      },
      { ...input, operations: [input.operations[0], input.operations[0]], cursor: 0 },
    ])
      expect(restore(damaged).ok).toBe(false)
  })

  it('搜索起点与未知类型声明在消费后仍可恢复，并保留起点声明', () => {
    const input = project()
    const checked = imported(raw.replace('Quality (Life Modifiers)', '品质（待核对类型）'), 'Flesh')
    if (!checked.ok) throw new Error(checked.error)
    const initialStates: CraftState[] = [
      checked.value,
      {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        catalyst: { id: 'Flesh', quality: 20, declared: true as const },
      },
    ]
    for (const initialState of initialStates) {
      const operations =
        initialState.sourceText === null
          ? [
              {
                currency: 'transmutation',
                modIds: ['IncreasedLife1'],
                rolls: [{ modId: 'IncreasedLife1', values: [19] }],
              },
              {
                currency: 'regal',
                modIds: ['ColdResist1'],
                rolls: [{ modId: 'ColdResist1', values: [6] }],
              },
              ...input.operations,
            ]
          : input.operations
      const saved = { ...input, initialState, operations, cursor: operations.length }
      const result = restore(saved)
      if (!result.ok) throw new Error(result.error)
      expect(result.value.states.at(-1)?.catalyst).toEqual({
        id: 'Flesh',
        quality: 0,
        declared: true,
      })
      expect(result.value.project.initialState.catalyst).toEqual({
        id: 'Flesh',
        quality: 20,
        declared: true,
      })
      expect(
        restore({
          ...saved,
          initialState: { ...initialState, catalyst: { id: 'Flesh', quality: 20 } },
        }).ok,
      ).toBe(false)
    }
  })
})
