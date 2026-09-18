import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { requiresStaffRuneProjectVersion } from './staffRuneProjectVersion'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const id = 'pob2:augment:["Ancient Rune of Discovery","staff"]'
function fixture() {
  return {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-18-v126',
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    scalabilitySourceHash: catalog._meta.sources.find(
      (s) => s.path === 'src/Data/ModScalability.lua',
    )?.sha256,
    initialState: {
      baseId: 'Ashen Staff',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
      sockets: [null, null],
      implicitLines: ['Grants Skill: Level 12 Firebolt'],
      nextAffixId: 1,
    },
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: id },
      {
        kind: 'socket',
        socketIndex: 0,
        augmentId: 'pob2:augment:["Legacy of Dusk Vigil","staff"]',
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
    expect(loaded.value.states[2]?.sockets?.[0]).toContain('Dusk Vigil')
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
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-18-v125' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v126') })
  for (const field of ['augmentSourceHash', 'scalabilitySourceHash']) {
    for (const value of [undefined, '0'.repeat(64)])
      expect(
        loadTargetWorkbenchProject(JSON.stringify({ ...project, [field]: value }), catalog).ok,
      ).toBe(false)
  }
})
it('能力检测不执行访问器，不将既有同名报价升级，保留嵌套与导入声明', () => {
  expect(
    requiresStaffRuneProjectVersion({ pricing: { 'augment:Ancient Rune of Discovery': 1 } }),
  ).toBe(false)
  expect(requiresStaffRuneProjectVersion({ nested: { importedSockets: [id] } })).toBe(true)
  expect(requiresStaffRuneProjectVersion({ nested: { kind: 'socket', augmentId: id } })).toBe(true)
  const getter = Object.defineProperty({}, 'sockets', {
    get() {
      throw Error('不可执行')
    },
  })
  expect(requiresStaffRuneProjectVersion(getter)).toBe(false)
})
