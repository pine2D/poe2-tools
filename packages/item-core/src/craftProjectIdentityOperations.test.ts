import { describe, expect, it } from 'vitest'
import { prepareAlloyCraft } from './alloyCraft'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import { boneCatalog } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { catalog as primary } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { desecrationSourceHash } from './desecration'
import { prepareEssenceCraft } from './essenceCraft'
import { essenceSourceHash } from './essences'
import { jewelSourceHash } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { liquidEmotionSourceHash } from './liquidEmotions'
import { inspectNumericLines } from './numeric'
import type { CraftResult, CraftState } from './rehearsal'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function fingerprint(value: string | null): string {
  if (value === null) throw new Error('夹具缺少来源签名')
  return value
}

function project(catalog: CraftCatalog, baseId: string, operations: CraftStep[]): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations,
    cursor: 0,
  }
}

function roundTripEveryCursor(
  catalog: CraftCatalog,
  input: CraftProject,
  sourceKeys: (keyof CraftProject)[],
) {
  const upgraded = must(upgradeCraftProjectIdentity(JSON.stringify(input), catalog))
  const before = structuredClone(upgraded)
  for (let cursor = 0; cursor <= input.operations.length; cursor++) {
    const expected = { ...upgraded, project: { ...upgraded.project, cursor } }
    const snapshot = structuredClone(expected)
    expect(parseIdentityCraftProject(JSON.stringify(expected.project), catalog)).toEqual({
      ok: true,
      value: expected,
    })
    const saved = must(serializeIdentityCraftProject(expected.project, catalog))
    expect(JSON.parse(saved)).toEqual(expected.project)
    expect(parseIdentityCraftProject(saved, catalog)).toEqual({ ok: true, value: expected })
    expect(expected).toEqual(snapshot)
  }
  for (const key of sourceKeys) {
    const tampered = { ...upgraded.project, [key]: 'wrong-source-fingerprint' }
    expect(parseIdentityCraftProject(JSON.stringify(tampered), catalog).ok).toBe(false)
    expect(serializeIdentityCraftProject(tampered, catalog).ok).toBe(false)
  }
  expect(upgraded).toEqual(before)
  return upgraded
}

describe('实例项目特殊操作的严格读写固定点', () => {
  it.each(['upgrade', 'replace', 'alloy', 'liquid'] as const)(
    '%s 保证制作在每个游标完整恢复，来源签名不可篡改',
    (mode) => {
      const catalog = { ...primary, alloys: alloyTestFixture() }
      const jewel = mode === 'liquid'
      const operations: CraftStep[] = jewel
        ? [
            { currency: 'transmutation', modIds: ['JewelFireDamage'] },
            { currency: 'regal', modIds: ['JewelAreaofEffect'] },
          ]
        : [
            { currency: 'transmutation', modIds: ['IncreasedLife1'] },
            { currency: 'augmentation', modIds: ['FireResist1'] },
          ]
      if (!jewel && mode !== 'upgrade')
        operations.push({ currency: 'regal', modIds: ['ColdResist1'] })
      const input = project(catalog, jewel ? 'Ruby' : 'Gold Ring', operations)
      let state: CraftState = input.initialState
      for (const operation of operations) state = must(applyCraftStep(catalog, state, operation))
      const values = (lines: string[]) => must(inspectNumericLines(lines)).map((range) => range.min)
      const sourceKeys: (keyof CraftProject)[] = []
      if (mode === 'alloy') {
        const alloyId = 'Metadata/Items/Currency/CurrencyVerisiumAlloy1'
        operations.push({
          kind: 'alloy',
          alloyId,
          removeModId: 'IncreasedLife1',
          values: values(must(prepareAlloyCraft(catalog, state, alloyId)).mod.lines),
        })
        input.alloyCatalogSignature = fingerprint(alloyCatalogSignature(catalog))
        sourceKeys.push('alloyCatalogSignature')
      } else if (jewel) {
        const emotionId = 'Metadata/Items/Currency/DistilledEmotion1'
        operations.push({
          kind: 'liquid-emotion',
          emotionId,
          removeModId: 'JewelFireDamage',
          values: values(must(prepareLiquidEmotionCraft(catalog, state, emotionId)).mod.lines),
        })
        input.jewelSourceHash = fingerprint(jewelSourceHash(catalog))
        input.liquidEmotionSourceHash = fingerprint(liquidEmotionSourceHash(catalog))
        sourceKeys.push('jewelSourceHash', 'liquidEmotionSourceHash')
      } else {
        const essenceId =
          mode === 'upgrade'
            ? 'Metadata/Items/Currency/CurrencyLesserEssenceMana'
            : 'Metadata/Items/Currency/CurrencyPerfectEssenceMana'
        operations.push({
          kind: 'essence',
          essenceId,
          ...(mode === 'upgrade' ? {} : { removeModId: 'IncreasedLife1' }),
          values: values(must(prepareEssenceCraft(catalog, state, essenceId)).mod.lines),
        })
        input.essenceSourceHash = fingerprint(essenceSourceHash(catalog))
        sourceKeys.push('essenceSourceHash')
      }
      const upgraded = roundTripEveryCursor(catalog, input, sourceKeys)
      const operation = upgraded.project.operations.at(-1)
      if (mode === 'upgrade') expect(operation).not.toHaveProperty('removeAffixId')
      else expect(operation).toHaveProperty('removeAffixId', 'a1')
      expect(upgraded.states.at(-1)?.affixes.at(-1)).toMatchObject({
        affixId: `a${state.affixes.length + 1}`,
        crafted: true,
      })
    },
  )

  it('满容量亵渎、offer、reroll、reveal 整链恢复，占位不分配 ID', () => {
    const catalog = boneCatalog()
    const operations: CraftStep[] = [
      { currency: 'transmutation', modIds: ['prefix1'] },
      { currency: 'regal', modIds: ['suffix1'] },
    ]
    for (const modId of ['prefix2', 'prefix3', 'suffix2', 'suffix3'])
      operations.push({ currency: 'exalted', modIds: [modId] })
    operations.push(
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix', removeModId: 'suffix2' },
      {
        kind: 'desecration-offer',
        modIds: ['suffix2', 'suffix4', 'exclusive1'],
        revealOmen: 'abyssal_echoes',
      },
      { kind: 'desecration-reroll', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [7] },
    )
    const input = project(catalog, 'Synthetic Base', operations)
    input.desecrationSourceHash = fingerprint(desecrationSourceHash(catalog))
    const upgraded = roundTripEveryCursor(catalog, input, ['desecrationSourceHash'])
    expect(upgraded.states.map((state) => state.nextAffixId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 8,
    ])
    expect(upgraded.project.operations[6]).toHaveProperty('removeAffixId', 'a5')
    expect(upgraded.states.at(-1)?.affixes.at(-1)).toMatchObject({
      affixId: 'a7',
      desecrated: true,
    })
  })
})
