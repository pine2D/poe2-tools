import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import {
  PENDING_EXALTATION_RULES_VERSION,
  requiresPendingExaltationProjectVersion,
} from './pendingExaltationProjectVersion'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('缺少测试目录记录')
  return value
}

const baseCatalog = boneCatalog()
const catalog = {
  ...baseCatalog,
  modifiers: [
    ...baseCatalog.modifiers,
    ...[1, 2].map((n) => ({
      ...present(baseCatalog.modifiers.find((mod) => mod.id === `exclusive${n}`)),
      id: `exclusivePrefix${n}`,
      name: `exclusivePrefix${n}`,
      group: `exclusivePrefix${n}`,
      kind: 'prefix' as const,
    })),
  ],
}
const desecrationSourceHash = catalog._meta.sources[0]?.sha256

function project(operations: unknown[] = [], cursor = operations.length) {
  return {
    schemaVersion: 1 as const,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: PENDING_EXALTATION_RULES_VERSION,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal' as const,
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations,
    cursor,
    desecrationSourceHash,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}

const pendingExaltation = [
  { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
  { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' },
  { currency: 'exalted', modIds: ['suffix3'] },
] as const

const revealedExaltation = [
  { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
  { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' },
  {
    kind: 'desecration-offer',
    modIds: ['prefix3', 'exclusivePrefix1', 'exclusivePrefix2'],
  },
  { kind: 'desecration-reveal', modId: 'prefix3', values: [5] },
  { currency: 'exalted', modIds: ['suffix3'] },
] as const

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

it('v90 空白项目保持版本并可完整保存恢复', () => {
  const input = project()
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(restored.project).toEqual(input)
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
})

it('未揭示期间的崇高要求 v90，且检查游标后的完整历史', () => {
  const input = project([...pendingExaltation], 0)
  expect(requiresPendingExaltationProjectVersion(input)).toBe(true)
  must(parseTargetCraftProject(JSON.stringify(input), catalog))
  expect(
    parseTargetCraftProject(
      JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v89' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v90') })
})

it('揭示后的普通崇高不要求 v90，v89 项目仍可恢复', () => {
  const input = project([...revealedExaltation])
  expect(requiresPendingExaltationProjectVersion(input)).toBe(false)
  must(
    parseTargetCraftProject(
      JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v89' }),
      catalog,
    ),
  )
})

it('判别按真实顺序跟踪初始占位、再次施加与揭示，不把并存结构直接当作能力', () => {
  expect(
    requiresPendingExaltationProjectVersion({
      initialState: { pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' } },
      operations: [{ currency: 'perfect_exalted', modIds: ['suffix2'] }],
    }),
  ).toBe(true)
  expect(
    requiresPendingExaltationProjectVersion({
      initialState: {},
      operations: [
        ...revealedExaltation,
        { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
        { currency: 'greater_exalted', modIds: ['prefix4'] },
      ],
    }),
  ).toBe(true)
  expect(
    requiresPendingExaltationProjectVersion({
      initialState: {},
      operations: [...revealedExaltation],
      unrelated: { pendingDesecration: {}, currency: 'exalted' },
    }),
  ).toBe(false)
})

it('不可信 currency 对象不会在能力判别或项目读取时触发类型转换异常', () => {
  const input = project([
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' },
    { currency: { toString: null }, modIds: ['suffix3'] },
  ])
  expect(() => requiresPendingExaltationProjectVersion(input)).not.toThrow()
  expect(requiresPendingExaltationProjectVersion(input)).toBe(false)
  expect(() => parseTargetCraftProject(JSON.stringify(input), catalog)).not.toThrow()
  expect(parseTargetCraftProject(JSON.stringify(input), catalog).ok).toBe(false)
  expect(() => loadTargetWorkbenchProject(JSON.stringify(input), catalog)).not.toThrow()
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(false)
})
