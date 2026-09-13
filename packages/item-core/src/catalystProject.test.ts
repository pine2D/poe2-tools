import { describe, expect, it } from 'vitest'
import { estimateCatalystEffects } from './catalystEffects'
import { catalog, dictionary, imported, parse, raw } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { inspectItem } from './export'
import { importCraftState } from './rehearsalImport'
import { statScalabilitySourceHash } from './statScalability'

function project(): CraftProject {
  const initial = imported()
  if (!initial.ok) throw new Error(initial.error)
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: initial.value,
    operations: [
      {
        currency: 'divine',
        modIds: [],
        rolls: [{ modId: 'IncreasedLife1', values: [10] }],
        implicitValues: [10],
      },
    ],
    cursor: 1,
    scalabilitySourceHash: statScalabilitySourceHash(catalog) as string,
  }
}

describe('催化品质贯通文本导出和项目恢复', () => {
  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '导出 %s 保留可信品质标题与基础值，回读不重复施加品质',
    (locale) => {
      const initial = project().initialState
      const output = exportCraftItemText(catalog, initial, { locale, dictionary })
      if (!output.ok) throw new Error(output.error)
      expect(output.value.text).toContain('Quality (Life Modifiers): +20%')
      expect(output.value.text).toContain('19(10-19)')
      const item = parse(output.value.text)
      const restored = importCraftState(
        catalog,
        initial.baseId,
        item,
        inspectItem(item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      )
      expect(restored).toMatchObject({
        ok: true,
        value: { catalyst: initial.catalyst, affixes: initial.affixes },
      })
    },
  )

  it('每个游标恢复品质与基础值，神圣后有效值从22变成12', () => {
    for (const cursor of [0, 1]) {
      const restored = parseCraftProject(
        serializeCraftProject({ ...project(), cursor }),
        catalog,
        dictionary,
      )
      if (!restored.ok) throw new Error(restored.error)
      const state = restored.value.states[cursor]
      if (!state) throw new Error('缺少游标状态')
      expect(state.catalyst).toEqual({ id: 'Flesh', quality: 20 })
      expect(estimateCatalystEffects(catalog, state, 'Flesh', 20)).toMatchObject({
        ok: true,
        value: {
          groups: expect.arrayContaining([
            expect.objectContaining({
              id: 'IncreasedLife1',
              lines: [
                expect.objectContaining({
                  after: cursor === 0 ? '+22 to maximum Life' : '+12 to maximum Life',
                }),
              ],
            }),
          ]),
        },
      })
    }
  })

  it('来源品质、缩放指纹和旧规则门禁都不能被外来项目绕过', () => {
    const input = project()
    for (const candidate of [
      { ...input, scalabilitySourceHash: undefined },
      { ...input, scalabilitySourceHash: '0'.repeat(64) },
      { ...input, initialState: { ...input.initialState, catalyst: { id: 'Flesh', quality: 10 } } },
      { ...input, rulesVersion: 'basic-2026-09-12-v35' },
    ])
      expect(parseCraftProject(JSON.stringify(candidate), catalog, dictionary).ok).toBe(false)
  })

  it('未知描述符的类型核对随原文恢复，删除声明标记不得静默放行', () => {
    const input = project()
    const text = raw.replace('Quality (Life Modifiers)', '品质（待核对类型）')
    const initial = imported(text, 'Flesh')
    if (!initial.ok) throw new Error(initial.error)
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, initialState: initial.value }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...input,
          initialState: { ...initial.value, catalyst: { id: 'Flesh', quality: 20 } },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })
})
