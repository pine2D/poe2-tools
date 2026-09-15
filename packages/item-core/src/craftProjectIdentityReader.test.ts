import { describe, expect, it } from 'vitest'
import { type CraftProject, MAX_CRAFT_PROJECT_BYTES } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { catalog as makeCatalog } from './partialTargetFixture'

const catalog = makeCatalog(undefined, { socketLimit: null })
catalog.modifiers = catalog.modifiers.map((mod) => ({
  ...mod,
  lines:
    mod.id === 'p1'
      ? ['+(1-10) to maximum Life']
      : mod.id === 's1'
        ? ['+(1-10)% to Fire Resistance']
        : mod.lines,
}))

function legacy(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-12-v72',
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: [
        'Item Class: Foci',
        'Rarity: Rare',
        'Synthetic Dawn',
        'Focus',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Prefix Modifier "Synthetic Life" }',
        '+5 to maximum Life',
        '{ Suffix Modifier "Synthetic Resistance" }',
        '+5% to Fire Resistance',
      ].join('\n'),
      affixes: [
        { modId: 'p1', lines: ['+5 to maximum Life'] },
        { modId: 's1', lines: ['+5% to Fire Resistance'] },
      ],
    },
    operations: [
      {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['p1'],
        rolls: [{ modId: 'p1', values: [7] }],
      },
      { currency: 'exalted', modIds: ['p2'], rolls: [{ modId: 'p2', values: [5] }] },
      { currency: 'exalted', modIds: ['s2'], rolls: [{ modId: 's2', values: [5] }] },
      { kind: 'fracture', modId: 'p1' },
    ],
    cursor: 0,
    targetModIds: ['p1'],
    targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 7 }] }],
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
  }
}

function candidate(input = legacy(), localCatalog = catalog) {
  const result = upgradeCraftProjectIdentity(JSON.stringify(input), localCatalog)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reorder(entry)]),
    )
  return value
}

describe('v73 项目严格读取', () => {
  it('深层未知 JSON 结构返回拒绝结果，不向调用方抛出克隆异常', () => {
    const text = `{"rulesVersion":"basic-2026-09-12-v73","extra":${'['.repeat(10_000)}0${']'.repeat(10_000)}}`
    expect(parseIdentityCraftProject(text, catalog).ok).toBe(false)
  })

  it('合法升级候选是固定点，任意对象键重排不改变完整回放', () => {
    const expected = candidate()
    const before = structuredClone(expected)
    for (const project of [expected.project, reorder(expected.project)]) {
      const result = parseIdentityCraftProject(JSON.stringify(project), catalog)
      expect(result).toEqual({ ok: true, value: expected })
    }
    expect(expected).toEqual(before)
  })

  it('初始身份必须完整且按原文顺序从 a1 分配，不能修复缺失、重复或游标', () => {
    const { project } = candidate()
    const initial = project.initialState
    const first = initial.affixes[0]
    const second = initial.affixes[1]
    if (!first || !second) throw new Error('缺少非空初始夹具')
    for (const initialState of [
      { ...initial, nextAffixId: undefined },
      { ...initial, nextAffixId: null },
      { ...initial, nextAffixId: 2 },
      { ...initial, nextAffixId: 4 },
      { ...initial, affixes: [{ ...first, affixId: undefined }, second] },
      { ...initial, affixes: [{ ...first, affixId: null }, second] },
      {
        ...initial,
        affixes: [
          { ...first, affixId: 'a2' },
          { ...second, affixId: 'a1' },
        ],
      },
      { ...initial, affixes: [first, { ...second, affixId: 'a1' }] },
      { ...initial, affixes: [second, first] },
    ])
      expect(
        parseIdentityCraftProject(JSON.stringify({ ...project, initialState }), catalog).ok,
      ).toBe(false)
  })

  it('游标之后的删除、新增 rolls 和破裂 ID 必须属于该步骤的实际实例', () => {
    const { project } = candidate()
    const first = project.operations[0]
    if (!first || !('currency' in first)) throw new Error('缺少混沌夹具')
    for (const operation of [
      { ...first, removeAffixId: undefined },
      { ...first, removeAffixId: 'a2' },
      { ...first, removeAffixId: 'a9' },
      { ...first, removeAffixId: null },
      { ...first, rolls: [{ modId: 'p1', values: [7] }] },
      { ...first, rolls: [{ modId: 'p1', values: [7], affixId: 'a1' }] },
      { ...first, rolls: [{ modId: 's1', values: [7], affixId: 'a3' }] },
      { ...first, rolls: [{ modId: 'p1', values: [7], affixId: 'a3', extra: true }] },
    ])
      expect(
        parseIdentityCraftProject(
          JSON.stringify({
            ...project,
            operations: [operation, ...project.operations.slice(1)],
          }),
          catalog,
        ).ok,
      ).toBe(false)
    for (const affixId of [undefined, null, 'a1', 'a2'])
      expect(
        parseIdentityCraftProject(
          JSON.stringify({
            ...project,
            operations: [
              ...project.operations.slice(0, 3),
              { kind: 'fracture', modId: 'p1', affixId },
            ],
          }),
          catalog,
        ).ok,
      ).toBe(false)
  })

  it('瓦尔顺序替换读取上次新 ID，错 ID、漏 ID 和陌生身份字段均拒绝', () => {
    const { project } = candidate({
      ...legacy(),
      operations: [
        {
          kind: 'vaal',
          outcome: 'reroll',
          replacements: [
            { removeModId: 'p1', modId: 'p2', values: [7] },
            { removeModId: 'p2', modId: 'p1', values: [8] },
          ],
        },
      ],
    })
    expect(parseIdentityCraftProject(JSON.stringify(project), catalog).ok).toBe(true)
    const operation = project.operations[0]
    if (
      !operation ||
      !('kind' in operation) ||
      operation.kind !== 'vaal' ||
      operation.outcome !== 'reroll'
    )
      throw new Error('缺少瓦尔夹具')
    const second = operation.replacements[1]
    if (!second) throw new Error('缺少第二次替换')
    expect(second.removeAffixId).toBe('a3')
    for (const patch of [{ removeAffixId: undefined }, { removeAffixId: 'a1' }, { affixId: 'a3' }])
      expect(
        parseIdentityCraftProject(
          JSON.stringify({
            ...project,
            operations: [
              { ...operation, replacements: [operation.replacements[0], { ...second, ...patch }] },
            ],
          }),
          catalog,
        ).ok,
      ).toBe(false)
  })

  it('未知位置身份、额外字段、错误来源和非精确版本不能被投影吞掉', () => {
    const { project } = candidate()
    for (const input of [
      { ...project, affixId: 'a1' },
      { ...project, states: [] },
      { ...project, extra: true },
      { ...project, sourceCommit: 'b'.repeat(40) },
      { ...project, rulesVersion: 'basic-2026-09-12-v72' },
      { ...project, rulesVersion: 'basic-2026-09-12-v74' },
      { ...project, pricing: { ...project.pricing, nextAffixId: 3 } },
      {
        ...project,
        targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 7, affixId: 'a1' }] }],
      },
      { ...project, initialState: { ...project.initialState, removeAffixId: 'a1' } },
      {
        ...project,
        operations: [...project.operations, { kind: 'artificer', removeAffixId: 'a1' }],
      },
      {
        ...project,
        operations: [
          ...project.operations,
          { kind: 'vaal', outcome: 'unchanged', replacements: [{ removeAffixId: 'a1' }] },
        ],
      },
    ])
      expect(parseIdentityCraftProject(JSON.stringify(input), catalog).ok).toBe(false)
    for (const text of ['{bad', 'null', '[]'])
      expect(parseIdentityCraftProject(text, catalog).ok).toBe(false)
  })

  it.each([0, 1, 2])('建筑师摧毁的终止项目 cursor %s 仍完整恢复', (cursor) => {
    const expected = candidate({
      ...legacy(),
      operations: [
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'architect', outcome: 'destroy' },
      ],
      cursor,
    })
    expect(parseIdentityCraftProject(JSON.stringify(expected.project), catalog)).toEqual({
      ok: true,
      value: expected,
    })
    expect(expected.states[2]?.destroyed).toBe(true)
  })

  it('大小限制先检查原始 UTF-8 字节，不能通过去身份和紧凑投影绕过', () => {
    const { project } = candidate()
    const text = JSON.stringify(project)
    const bytes = new TextEncoder().encode(text).byteLength
    const exact = `${text}${' '.repeat(MAX_CRAFT_PROJECT_BYTES - bytes)}`
    expect(parseIdentityCraftProject(exact, catalog).ok).toBe(true)
    const unicode = JSON.stringify({ ...project, extra: '中'.repeat(700_000) })
    expect(unicode.length).toBeLessThan(MAX_CRAFT_PROJECT_BYTES)
    for (const oversized of [`${exact} `, unicode])
      expect(parseIdentityCraftProject(oversized, catalog)).toEqual({
        ok: false,
        error: '演练项目超过 2 MB 限制。',
      })
  })

  it('旧原文可补固有行，但手写 v73 缺少规范固有字段时不能静默补全', () => {
    const local = makeCatalog(undefined, { implicit: '+(5-10) to Strength', socketLimit: null })
    const expected = candidate(
      {
        schemaVersion: 1,
        rulesVersion: 'basic-2026-09-12-v72',
        sourceCommit: local._meta.sourceCommit,
        initialState: {
          baseId: 'Focus',
          itemLevel: 86,
          rarity: 'normal',
          affixes: [],
          sourceText:
            'Item Class: Foci\nRarity: Normal\nFocus\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n+7(5-10) to Strength',
        },
        operations: [],
        cursor: 0,
      },
      local,
    )
    expect(expected.project.initialState.implicitLines).toEqual(['+7(5-10) to Strength'])
    expect(parseIdentityCraftProject(JSON.stringify(expected.project), local)).toEqual({
      ok: true,
      value: expected,
    })
    const { implicitLines: _, ...initialState } = expected.project.initialState
    expect(
      parseIdentityCraftProject(JSON.stringify({ ...expected.project, initialState }), local).ok,
    ).toBe(false)
  })
})
