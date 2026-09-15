import { describe, expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject } from './craftProject'
import {
  parseTargetCraftProject,
  serializeTargetCraftProject,
  type TargetCraftProject,
  upgradeTargetCraftProject,
} from './craftProjectTargets'
import { DESECRATION_SOURCE, desecrationSourceHash } from './desecration'
import { essenceSourceHash } from './essences'
import { JEWEL_SOURCE, jewelSourceHash } from './jewels'
import { liquidEmotionSourceHash } from './liquidEmotions'
import type { CraftResult } from './rehearsal'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}

const cases = [
  {
    modId: 'CraftedJewelRadiusFireResistance',
    baseId: 'Time-Lost Sapphire',
    key: 'liquidEmotionSourceHash',
    path: 'src/Data/LiquidEmotions.lua',
    hash: liquidEmotionSourceHash(catalog),
  },
  {
    modId: 'AbyssModRadiusJewelPrefixDamageTakenRecoupLife',
    baseId: 'Time-Lost Sapphire',
    key: 'desecrationSourceHash',
    path: DESECRATION_SOURCE.path,
    hash: desecrationSourceHash(catalog),
  },
  {
    modId: 'EssenceIncreasedManaPercent1',
    baseId: 'Gold Ring',
    key: 'essenceSourceHash',
    path: 'src/Data/Essence.lua',
    hash: essenceSourceHash(catalog),
  },
  {
    modId: 'JewelArmour',
    baseId: 'Gold Ring',
    key: 'jewelSourceHash',
    path: JEWEL_SOURCE.path,
    hash: jewelSourceHash(catalog),
  },
  {
    modId: 'EssenceIncreasedManaPercent1',
    baseId: 'Antler Focus',
    key: 'essenceSourceHash',
    path: 'src/Data/Essence.lua',
    hash: essenceSourceHash(catalog),
  },
] as const

describe('v74 失联专属目标的完整来源资格', () => {
  for (const { modId, baseId, key, path, hash } of cases) {
    it.each([1, 2])(`${baseId} 引用 ${modId} 的 %s 代失联目标均要求原来源`, (generations) => {
      if (hash === null) throw Error('目录缺少已验证来源')
      const old: CraftProject = {
        schemaVersion: 1,
        rulesVersion: CRAFT_RULES_VERSION,
        sourceCommit: catalog._meta.sourceCommit,
        initialState: { baseId, itemLevel: 86, rarity: 'normal', affixes: [], sourceText: null },
        operations: [],
        cursor: 0,
        targetModIds: [],
        // 旧版禁止非珠宝基底声明珠宝来源；只可在完整验证后的 v74 升级中新增。
        ...(key === 'jewelSourceHash' ? {} : { [key]: hash }),
        ...(baseId === 'Time-Lost Sapphire' ? { jewelSourceHash: JEWEL_SOURCE.sha256 } : {}),
        strategyStartStep: 0,
        strategy: {
          maxSteps: 10,
          flow: {
            entryStageId: 'a',
            stages: [
              { id: 'a', name: '当前' },
              { id: 'b', name: '尚未进入' },
            ],
          },
          rules: [
            { stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
            {
              stageId: 'b',
              conditions: [
                {
                  kind: 'not',
                  condition: { kind: 'selected-targets', modIds: [modId], min: 1, value: false },
                },
              ],
              action: { kind: 'stop' },
            },
          ],
        },
      }
      const upgraded = value(upgradeTargetCraftProject(JSON.stringify(old), catalog))
      expect(upgraded.project[key]).toBe(hash)
      const missingCatalogSource = {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.filter((entry) => entry.path !== path),
        },
      }
      const withoutDeclaration = structuredClone(upgraded.project)
      delete withoutDeclaration[key]
      expect(
        parseTargetCraftProject(JSON.stringify(withoutDeclaration), missingCatalogSource).ok,
      ).toBe(false)
      // 旧原文先验证；新版本新增的必须来源只能从同一目录补入，不能修复旧错误声明。
      const oldWithoutDeclaration = structuredClone(old)
      delete oldWithoutDeclaration[key]
      const migrated = value(
        upgradeTargetCraftProject(JSON.stringify(oldWithoutDeclaration), catalog),
      )
      expect(migrated.project[key]).toBe(hash)
      expect(migrated.states).toEqual(upgraded.states)
      expect(
        upgradeTargetCraftProject(JSON.stringify(oldWithoutDeclaration), missingCatalogSource).ok,
      ).toBe(false)
      expect(
        upgradeTargetCraftProject(JSON.stringify({ ...old, [key]: '0'.repeat(64) }), catalog).ok,
      ).toBe(false)
      const targetIds = generations === 1 ? ['t1'] : ['t1', 't2']
      const project: TargetCraftProject = {
        ...upgraded.project,
        targetDefinitions: { ...upgraded.project.targetDefinitions, nextTargetId: generations + 1 },
        orphanedTargets: targetIds.map((targetId) => ({ targetId, modId })),
        strategy: {
          maxSteps: 10,
          flow: {
            entryStageId: 'a',
            stages: [
              { id: 'a', name: '当前' },
              { id: 'b', name: '尚未进入' },
            ],
          },
          rules: [
            { stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
            {
              stageId: 'b',
              conditions: [
                {
                  kind: 'not',
                  condition: {
                    kind: 'selected-targets',
                    targetIds,
                    min: generations,
                    value: false,
                  },
                },
              ],
              action: { kind: 'stop' },
            },
          ],
        },
      }
      const before = structuredClone(project)
      const restored = value(
        parseTargetCraftProject(value(serializeTargetCraftProject(project, catalog)), catalog),
      )
      expect(restored.project[key]).toBe(hash)
      expect(restored.project.orphanedTargets).toEqual(project.orphanedTargets)
      expect(restored.project.strategy).toEqual(project.strategy)
      expect(restored.project.targetDefinitions.targets).toEqual([])
      for (const replacement of [null, '0'.repeat(64)]) {
        const broken = structuredClone(project)
        if (replacement === null) delete broken[key]
        else broken[key] = replacement
        expect(
          parseTargetCraftProject(JSON.stringify(broken), catalog).ok,
          `缺失或错误 ${key}`,
        ).toBe(false)
        expect(serializeTargetCraftProject(broken, catalog).ok, `不能保存缺失或错误 ${key}`).toBe(
          false,
        )
      }
      expect(project).toEqual(before)
    })
  }
})
