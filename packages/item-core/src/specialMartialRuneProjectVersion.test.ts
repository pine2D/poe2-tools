import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import * as api from './index'
import type { CraftResult } from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const version = 'basic-2026-09-17-v108'
const names = [
  'Ancient Rune of Animosity',
  'Rune of Vital Flame',
  'Legacy of Amor Mandragora',
  'Legacy of Spiteful Floret',
] as const
const records =
  catalog.augments?.filter((augment) => (names as readonly string[]).includes(augment.name)) ?? []
const augmentSourceHash = catalog._meta.sources.find(
  (source) => source.path === 'src/Data/ModRunes.lua',
)?.sha256
const scalabilitySourceHash = statScalabilitySourceHash(catalog)
const id = (name: string, category = 'talisman') =>
  `pob2:augment:${JSON.stringify([name, category])}`
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project(baseId = 'Changeling Talisman') {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
function future() {
  return {
    ...project(),
    augmentSourceHash,
    scalabilitySourceHash,
    initialState: { ...project().initialState, sockets: [null] },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id(names[2]) },
      { kind: 'socket', socketIndex: 0, augmentId: id(names[3]) },
    ],
    pricing: {
      unit: 'divine',
      prices: { 'augment:Legacy of Amor Mandragora': 2, 'augment:Legacy of Spiteful Floret': 3 },
    },
  }
}
it('v108 空项目保留版本', () => {
  const input = project('Gold Ring')
  const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(loaded.project).toEqual(input)
  expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, catalog)))).toEqual(input)
})
it.each(records)('$id 的新版本镶嵌可恢复，来源指纹不可遗漏或替换', (augment) => {
  const type =
    augment.category === 'one hand mace'
      ? 'One Hand Mace'
      : augment.category === 'two hand mace'
        ? 'Two Hand Mace'
        : 'Talisman'
  const base = catalog.bases.find((base) => base.type === type && !base.hidden && !base.runeforged)
  if (!base) throw Error(type)
  const input = {
    ...project(base.id),
    augmentSourceHash,
    scalabilitySourceHash,
    initialState: { ...project(base.id).initialState, sockets: [null] },
    operations: [{ kind: 'socket', socketIndex: 0, augmentId: augment.id }],
  }
  const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(loaded.project).toEqual(input)
  expect(loaded.states[1]?.sockets).toEqual([augment.id])
  for (const hash of [undefined, '0'.repeat(64)])
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, scalabilitySourceHash: hash }), catalog)
        .ok,
    ).toBe(false)
  for (const hash of [undefined, '0'.repeat(64)])
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, augmentSourceHash: hash }), catalog).ok,
    ).toBe(false)
})
it('v2–v107 均拒绝新符文起点、导入声明、未来、嵌套指引与仅报价', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  const special = id('Rune of Vital Flame', 'one hand mace')
  for (let n = 2; n <= 107; n++) {
    const { targetDefinitions, orphanedTargets, ...blank } = project('Gold Ring')
    const { nextAffixId: _, ...legacy } = blank.initialState
    const input = {
      ...blank,
      rulesVersion: `basic-2026-09-${n >= 92 ? '17' : n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? blank.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), real).ok, `v${n} 基线`).toBe(true)
    for (const extra of [
      { initialState: { ...input.initialState, sockets: [special] } },
      { importedSockets: [special] },
      { operations: [{ kind: 'socket', socketIndex: 0, augmentId: special }] },
      {
        strategy: {
          nested: { action: { kind: 'socket', socketIndex: 'first-empty', augmentId: special } },
        },
      },
      { pricing: { unit: 'divine', prices: { 'augment:Rune of Vital Flame': 1 } } },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v108'),
      })
  }
})
it('无目录旧 serializer 仍拦六种精确引用和四种报价', () => {
  for (const augment of records)
    expect(() =>
      serializeCraftProject({
        ...project('Gold Ring'),
        importedSockets: [augment.id],
      } as unknown as CraftProject),
    ).toThrow(/v108/)
  for (const name of names)
    expect(() =>
      serializeCraftProject({
        ...project('Gold Ring'),
        pricing: { unit: 'divine', prices: { [`augment:${name}`]: 1 } },
      } as unknown as CraftProject),
    ).toThrow(/v108/)
})
it('完整覆盖未来在各撤销位置保留，Legacy 同孔替换不丢历史和报价', () => {
  for (const cursor of [0, 1, 2]) {
    const input = { ...future(), cursor }
    const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(loaded.project).toEqual(input)
    expect(loaded.states.map((state) => state.sockets)).toEqual([
      [null],
      [id(names[2])],
      [id(names[3])],
    ])
    expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, catalog)))).toEqual(input)
  }
})
it('沿用新符文指引升级旧项目，保留接收方未来与品质报价', () => {
  const strategy = {
    maxSteps: 2,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'socket', socketIndex: 'first-empty', augmentId: id(names[0]) },
      },
    ],
  }
  const source = { ...project(), augmentSourceHash, scalabilitySourceHash, strategy }
  const current = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v107',
    augmentSourceHash,
    initialState: { ...project().initialState, quality: 10, sockets: [null] },
    operations: [{ currency: 'transmutation', modIds: ['LocalIncreasedPhysicalDamagePercent1'] }],
  }
  const reused = must(
    reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(source), catalog),
  )
  expect(reused.project.rulesVersion).toBe(version)
  expect(reused.project.initialState).toEqual(current.initialState)
  expect(reused.project.operations).toEqual(current.operations)
  expect(reused.project.augmentSourceHash).toBe(augmentSourceHash)
  const oldTemplate = {
    ...project(),
    rulesVersion: 'basic-2026-09-17-v107',
    strategy: {
      maxSteps: 1,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const retained = must(
    reuseTargetCraftPlan(JSON.stringify(future()), JSON.stringify(oldTemplate), catalog),
  )
  expect(retained.project.rulesVersion).toBe(version)
  expect(retained.project.operations).toEqual(future().operations)
  expect(retained.project.pricing).toEqual(future().pricing)
})
it('扫描不执行 getter、忽略观察文本和名称，仅匹配精确六ID', () => {
  const requires = (
    api as unknown as { requiresSpecialMartialRuneProjectVersion: (input: unknown) => boolean }
  ).requiresSpecialMartialRuneProjectVersion
  const accessor = Object.defineProperty({}, 'sockets', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires(accessor)).toBe(false)
  expect(
    requires({ sourceText: JSON.stringify(future()), name: names[0], augmentId: id(names[0]) }),
  ).toBe(false)
  expect(requires({ sockets: [id(names[0], 'weapon')] })).toBe(false)
  const sockets = Object.defineProperty([], '0', {
    get() {
      throw Error('不可访问')
    },
  })
  expect(requires({ sockets })).toBe(false)
  for (const augment of records)
    expect(requires({ later: { declared: { importedSockets: [augment.id] } } })).toBe(true)
})

import { alloyCatalogSignature } from './alloys'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { importIdentifiedCraftState } from './rehearsalImport'

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 君王增效导入保留原文、声明和覆盖未来，所有来源缺失均拒绝',
  (locale) => {
    const full = { ...catalog, alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')) }
    const dictionary = createCraftItemDictionary(
      full,
      locale === 'en'
        ? {}
        : {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          },
    )
    const state = {
      baseId: 'Changeling Talisman',
      itemLevel: 86,
      rarity: 'rare' as const,
      sourceText: null,
      sockets: [id('Rune of Vital Flame')],
      affixes: [
        {
          modId: 'AlloyEffectOfSocketedAugments1',
          crafted: true as const,
          lines: ['25(20-30)% increased effect of Socketed Augment Items'],
        },
      ],
    }
    const text = must(exportCraftItemText(full, state, { locale, dictionary })).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const initialState = must(
      importIdentifiedCraftState(
        full,
        state.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        state.sockets,
        undefined,
        dictionary.stats?.entries,
      ),
    )
    const input = {
      ...project(),
      initialState,
      importedSockets: state.sockets,
      augmentSourceHash,
      scalabilitySourceHash,
      alloyCatalogSignature: alloyCatalogSignature(full),
      operations: [{ kind: 'socket', socketIndex: 0, augmentId: id('Legacy of Amor Mandragora') }],
    }
    const loaded = must(loadTargetWorkbenchProject(JSON.stringify(input), full, dictionary))
    expect(loaded.project).toEqual(input)
    expect(loaded.states.every((state) => state.sourceText === text)).toBe(true)
    expect(JSON.parse(must(serializeTargetCraftProject(loaded.project, full, dictionary)))).toEqual(
      input,
    )
    for (const field of ['augmentSourceHash', 'scalabilitySourceHash', 'alloyCatalogSignature']) {
      expect(
        parseTargetCraftProject(JSON.stringify({ ...input, [field]: undefined }), full, dictionary)
          .ok,
        field,
      ).toBe(false)
    }
  },
)

it('仅材料报价也绑定双来源，观察文本和阶段名称不触发能力', () => {
  for (const name of names) {
    const input = {
      ...project('Gold Ring'),
      augmentSourceHash,
      scalabilitySourceHash,
      pricing: { unit: 'divine', prices: { [`augment:${name}`]: 1 } },
    }
    const read = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
    expect(read.project).toEqual(input)
    for (const field of ['augmentSourceHash', 'scalabilitySourceHash'])
      expect(
        parseTargetCraftProject(JSON.stringify({ ...input, [field]: undefined }), catalog).ok,
      ).toBe(false)
  }
  const plain = {
    ...project('Gold Ring'),
    rulesVersion: 'basic-2026-09-17-v107',
    strategyStartStep: 0,
    strategy: {
      maxSteps: 1,
      flow: { stages: [{ id: 's1', name: id(names[0]) }], entryStageId: 's1' },
      rules: [{ stageId: 's1', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  expect(
    must(loadTargetWorkbenchProject(JSON.stringify(plain), catalog)).project.rulesVersion,
  ).toBe(plain.rulesVersion)
})
