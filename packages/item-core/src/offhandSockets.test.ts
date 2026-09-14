import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CatalogBase, CraftCatalog } from './catalog'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'

const fire: CatalogAugment = {
  id: 'fire',
  name: 'Lesser Desert Rune',
  category: 'armour',
  type: 'Rune',
  localMod: false,
  lines: ['+10% to Fire Resistance'],
  statOrder: [1],
  tradeHashes: {},
  levelReq: 0,
}
const iron: CatalogAugment = {
  ...fire,
  id: 'iron',
  name: 'Iron Rune',
  localMod: true,
  lines: ['16% increased Armour, Evasion and Energy Shield'],
}
function base(type = 'Focus', tags = ['focus']): CatalogBase {
  return {
    id: 'offhand',
    name: 'Offhand',
    type,
    tags,
    requirements: {},
    properties: { EnergyShield: 100 },
    implicit: null,
    implicitTags: [],
    sourceQuality: null,
    socketLimit: null,
    hidden: false,
    runeforged: false,
  }
}
function catalog(entry = base()): CraftCatalog {
  return {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: 'test',
      gameVersion: null,
      generatedAt: '',
      weightStatus: 'unknown',
      excludedBases: [],
      sources: [
        { path: 'src/Data/ModRunes.lua', url: 'https://example.test', sha256: 'a'.repeat(64) },
      ],
    },
    bases: [entry],
    modifiers: [],
    augments: [fire, iron],
  }
}
const state = (sockets?: (string | null)[]) => ({
  baseId: 'offhand',
  itemLevel: 1,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  quality: 0,
  ...(sockets === undefined ? {} : { sockets }),
})
function project(version: number, initialSockets?: (string | null)[], operations: unknown[] = []) {
  const currentState = state(initialSockets)
  const { quality: _quality, ...stateWithoutQuality } = currentState
  const initialState = version < 9 ? stateWithoutQuality : currentState
  return {
    schemaVersion: 1,
    sourceCommit: 'test',
    rulesVersion: `basic-2026-09-12-v${version}`,
    initialState,
    operations,
    cursor: 0,
    ...(initialSockets === undefined && operations.length === 0
      ? {}
      : { augmentSourceHash: 'a'.repeat(64) }),
  }
}

describe('副手普通孔位', () => {
  it('从零孔只打到一孔，已有两孔可替换符文', () => {
    const source = catalog()
    const one = applyCraftStep(source, state([]), { kind: 'artificer' })
    expect(one).toMatchObject({ ok: true, value: { sockets: [null] } })
    if (!one.ok) return
    expect(applyCraftStep(source, one.value, { kind: 'artificer' }).ok).toBe(false)
    const replaced = applyCraftStep(source, state(['fire', null]), {
      kind: 'socket',
      socketIndex: 1,
      augmentId: 'iron',
    })
    expect(replaced).toMatchObject({ ok: true, value: { sockets: ['fire', 'iron'] } })
  })

  it('只估算基底实际存在的防御维度，未知孔位提示保持准确', () => {
    const source = catalog(base('Shield', ['shield', 'buckler']))
    expect(estimateDefences(source, state(['iron']))).toMatchObject({
      ok: true,
      value: [{ stat: 'EnergyShield', runeIncreased: 16, value: 116 }],
    })
    const unknown = estimateDefences(source, state())
    expect(unknown.ok ? '' : unknown.error).toContain('孔位状态未知')
  })

  it('v13 保存现有能力，严格拒绝畸形、旧版副手孔位能力和未来操作', () => {
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v52')
    expect(
      parseCraftProject(JSON.stringify(project(11, [], [{ kind: 'artificer' }])), catalog()).ok,
    ).toBe(true)
    for (const version of [2, 5, 9, 10]) {
      expect(parseCraftProject(JSON.stringify(project(version)), catalog()).ok).toBe(true)
      for (const input of [
        project(version, [null]),
        { ...project(version), importedSockets: [] },
        project(version, [], [{ kind: 'artificer' }]),
        project(version, [], [{ kind: 'socket', socketIndex: 0, augmentId: 'fire' }]),
        project(version, [], [{ kind: 'future-socket' }]),
      ])
        expect(parseCraftProject(JSON.stringify(input), catalog()).ok).toBe(false)
    }
    for (const version of ['v02', 'v53', 'v999']) {
      expect(
        parseCraftProject(
          JSON.stringify({ ...project(11), rulesVersion: `basic-2026-09-12-${version}` }),
          catalog(),
        ).ok,
      ).toBe(false)
    }
  })

  it('v10 钢铁符文合法且仍严格核对品质来源，v2-v9 禁止钢铁', () => {
    const current = project(10, [null], [{ kind: 'socket', socketIndex: 0, augmentId: 'iron' }])
    // v10 的副手孔位由专门门禁拒绝；用原已支持防具证明钢铁历史边界。
    const armour = catalog({ ...base('Helmet', ['armour']), properties: { Armour: 100 } })
    expect(parseCraftProject(JSON.stringify(current), armour).ok).toBe(true)
    for (let version = 5; version <= 9; version++)
      expect(
        parseCraftProject(
          JSON.stringify({ ...current, rulesVersion: `basic-2026-09-12-v${version}` }),
          armour,
        ).ok,
      ).toBe(false)
  })
})
