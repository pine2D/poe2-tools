import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { requiresRuneseekerProjectVersion } from './runeseekerProjectVersion'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = 'pob2:augment:["Legacy of Runeseeker\'s Call","wand"]'
function fixture() {
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v125',
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: catalog._meta.sources.find(
      (s) => s.path === 'src/Data/ModScalability.lua',
    )?.sha256,
    initialState: {
      baseId: 'Volatile Wand',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
      sockets: [null, null],
      implicitLines: ['Grants Skill: Level 12 Volatile Dead'],
      nextAffixId: 1,
    },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id },
      {
        kind: 'socket',
        socketIndex: 0,
        augmentId: 'pob2:augment:["Legacy of Cursecarver","wand"]',
      },
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('完整未来在每个游标恢复，空新版与再次保存不降版', () => {
  const project = fixture()
  for (let cursor = 0; cursor <= 2; cursor++) {
    const loaded = loadTargetWorkbenchProject(JSON.stringify({ ...project, cursor }), catalog)
    if (!loaded.ok) throw Error(loaded.error)
    expect(loaded.value.states).toHaveLength(3)
    expect(loaded.value.states[2]?.sockets?.[0]).toContain('Cursecarver')
    expect(loaded.value.project.rulesVersion).toBe(project.rulesVersion)
    expect(serializeTargetCraftProject(loaded.value.project, catalog).ok).toBe(true)
  }
  const empty = loadTargetWorkbenchProject(JSON.stringify({ ...project, operations: [] }), catalog)
  if (!empty.ok) throw Error(empty.error)
  expect(empty.value.project.rulesVersion).toBe(project.rulesVersion)
})
it('旧版拒绝新未来，双来源指纹缺失或变化不能恢复', () => {
  const project = fixture()
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-18-v124' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v125') })
  for (const field of ['augmentSourceHash', 'scalabilitySourceHash']) {
    for (const value of [undefined, '0'.repeat(64)])
      expect(
        loadTargetWorkbenchProject(JSON.stringify({ ...project, [field]: value }), catalog).ok,
      ).toBe(false)
  }
})
it('能力检测不执行访问器，不将既有同名报价升级，保留嵌套与导入声明', () => {
  expect(
    requiresRuneseekerProjectVersion({ pricing: { "augment:Legacy of Runeseeker's Call": 1 } }),
  ).toBe(false)
  expect(requiresRuneseekerProjectVersion({ nested: { importedSockets: [id] } })).toBe(true)
  expect(requiresRuneseekerProjectVersion({ nested: { kind: 'socket', augmentId: id } })).toBe(true)
  const getter = Object.defineProperty({}, 'sockets', {
    get() {
      throw Error('不可执行')
    },
  })
  expect(requiresRuneseekerProjectVersion(getter)).toBe(false)
})

it.each([
  { kind: 'affix-count', min: 8 },
  { kind: 'open-suffix', min: 5 },
  {
    kind: 'selected-targets',
    targetIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'],
    min: 1,
    value: true,
  },
])('旧版未执行条件也不能夹带扩展容量：%j', (condition) => {
  const old = {
    ...fixture(),
    rulesVersion: 'basic-2026-09-18-v124',
    operations: [],
    strategy: { maxSteps: 20, rules: [{ conditions: [condition], action: { kind: 'stop' } }] },
  }
  expect(loadTargetWorkbenchProject(JSON.stringify(old), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v125'),
  })
})
