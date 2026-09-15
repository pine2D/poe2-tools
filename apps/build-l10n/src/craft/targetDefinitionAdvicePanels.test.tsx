import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  analyzeBoneTargetDefinitions,
  analyzeEssencePreparationDefinitions,
  analyzeEssenceTargetDefinitions,
  type CraftResult,
  type CraftTargetDefinitions,
  enableCraftAffixIdentity,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { BoneAdvicePanel } from './BoneAdvicePanel'
import { EssenceAdvicePanel } from './EssenceAdvicePanel'
import { EssencePreparationPanel } from './EssencePreparationPanel'

const value = <T,>(result: CraftResult<T>): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const definitions: CraftTargetDefinitions = {
  nextTargetId: 40,
  targets: [
    { targetId: 't27', modId: 'prefix1' },
    { targetId: 't28', modId: 'suffix1' },
  ],
  values: [],
  alternatives: [],
}
function essenceCatalog() {
  const catalog = boneCatalog()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix1' },
    },
  ]
  return catalog
}
afterEach(cleanup)

it('精华建议按 tN 解释失去的目标，真实移除实例与操作完整交给预览', () => {
  const catalog = essenceCatalog()
  const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix2', 'suffix1'])))
  const step = value(analyzeEssenceTargetDefinitions(catalog, state, definitions)).find(
    (step) => step.operation.removeAffixId === 'a2',
  )
  if (!step) throw Error('缺少移除目标结果')
  const preview = vi.fn()
  render(
    <EssenceAdvicePanel
      catalog={catalog}
      state={state}
      definitions={definitions}
      steps={[step]}
      translations={{}}
      busy={false}
      onStartEssence={preview}
    />,
  )
  expect(screen.getByText(/本次指定结果失去目标：suffix1/)).toBeDefined()
  expect(screen.queryByText(/本次指定结果失去目标：t28/)).toBeNull()
  expect(screen.getByText(/指定移除整组：suffix1 · suffix1 5/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览此精华方案' }))
  expect(preview).toHaveBeenCalledWith(step)
})

it('骨骼风险展示真实档位，已匹配目标的损失按定义解释', () => {
  const catalog = boneCatalog()
  const state = value(
    enableCraftAffixIdentity(
      catalog,
      boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3']),
    ),
  )
  const config = {
    ...definitions,
    targets: [
      { targetId: 't27', modId: 'exclusive1' },
      { targetId: 't28', modId: 'suffix1' },
    ],
  }
  const step = value(analyzeBoneTargetDefinitions(catalog, state, config)).find(
    (step) => step.operation.kind === 'desecrate' && step.operation.removeAffixId === 'a4',
  )
  if (!step) throw Error('缺少移除目标骨骼结果')
  const preview = vi.fn()
  render(
    <BoneAdvicePanel
      catalog={catalog}
      state={state}
      definitions={config}
      steps={[step]}
      translations={{}}
      busy={false}
      onPreview={preview}
    />,
  )
  expect(screen.getByText(/本次指定结果失去目标：suffix1/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: /预览骨骼建议/ }))
  expect(preview).toHaveBeenCalledWith(step.operation)
})

it('准备路线保留新追加实例的数值与第一步操作身份', () => {
  const catalog = essenceCatalog()
  const state = value(enableCraftAffixIdentity(catalog, { ...boneState(), rarity: 'normal' }))
  const config = { ...definitions, targets: [{ targetId: 't27', modId: 'prefix1' }] }
  const advice = value(analyzeEssencePreparationDefinitions(catalog, state, config))
  const preview = vi.fn()
  render(
    <EssencePreparationPanel
      catalog={catalog}
      state={state}
      definitions={config}
      routes={advice.routes}
      truncated={advice.truncated}
      translations={{}}
      busy={false}
      onStartPreparation={preview}
    />,
  )
  expect(screen.getByText(/^prefix2 · prefix2 1/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览第一步' }))
  expect(preview).toHaveBeenCalledWith(advice.routes[0]?.preparations[0])
  expect(preview.mock.calls[0]?.[0].rolls[0].affixId).toBe('a1')
})

it('合金卡片按定义解释失配目标，保留移除池实际档位和预览实例', async () => {
  const primary: import('@poe2-tools/item-core').CraftCatalog = JSON.parse(
    readFileSync(
      resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
      'utf8',
    ),
  )
  const { alloyTestFixture } = await import('../../../../packages/item-core/src/alloyTestFixture')
  const { analyzeAlloyTargetDefinitions } = await import('@poe2-tools/item-core')
  const { AlloyAdvicePanel } = await import('./AlloyAdvicePanel')
  const catalog = { ...primary, alloys: alloyTestFixture() }
  const state = value(
    enableCraftAffixIdentity(catalog, {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [
        { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
        { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
      ],
    }),
  )
  const config = {
    ...definitions,
    targets: [
      { targetId: 't27', modId: 'AlloyMaximumRunicWard1' },
      { targetId: 't28', modId: 'FireResist1' },
    ],
  }
  const step = value(analyzeAlloyTargetDefinitions(catalog, state, config)).find(
    (step) => step.operation.removeAffixId === 'a2',
  )
  if (!step) throw Error('缺少合金结果')
  const preview = vi.fn()
  render(
    <AlloyAdvicePanel
      catalog={catalog}
      state={state}
      definitions={config}
      steps={[step]}
      translations={{}}
      busy={false}
      onPreview={preview}
    />,
  )
  expect(screen.getByText(/此结果将移除或使已有目标失配：FireResist1/)).toBeDefined()
  expect(screen.getByText(/随机移除池中存在已有目标：FireResist1/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '演练此合金结果' }))
  expect(preview).toHaveBeenCalledWith(step.operation)
})
