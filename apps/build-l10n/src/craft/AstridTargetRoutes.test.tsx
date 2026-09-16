import { readFileSync } from 'node:fs'
import {
  addCraftAffix,
  alloyCatalogSignature,
  type CraftCatalog,
  type CraftState,
  craftCandidates,
  extractTargetDefinitions,
  findTargetCapacityContext,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { CraftTargets } from './CraftTargets'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (result: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return () => {}
    },
  }
})
vi.setConfig({ testTimeout: 15_000 })
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  alloys: alloyTestFixture(),
}
const astrid = 'pob2:augment:["Astrid\'s Creativity","caster"]'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function save() {
  click('保存演练到本机')
  const read = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!read.ok) throw Error(read.error)
  return read.value
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function setup(needsSocket: boolean) {
  const sourceHash = (path: string) =>
    catalog._meta.sources.find((entry) => entry.path === path)?.sha256
  const input = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-16-v87',
    sourceCommit: catalog._meta.sourceCommit,
    augmentSourceHash: sourceHash('src/Data/ModRunes.lua'),
    essenceSourceHash: sourceHash('src/Data/Essence.lua'),
    alloyCatalogSignature: alloyCatalogSignature(catalog),
    initialState: {
      baseId: 'Volatile Wand',
      rarity: 'normal',
      itemLevel: 86,
      sourceText: null,
      affixes: [],
      nextAffixId: 1,
      sockets: needsSocket ? [] : [null],
      quality: 20,
    },
    operations: [
      { currency: 'transmutation', modIds: ['SpellDamageOnWeapon1'] },
      {
        kind: 'essence',
        essenceId: 'Metadata/Items/Currency/CurrencyGreaterEssenceCritical',
        values: [50],
      },
      ...(needsSocket ? [{ kind: 'artificer' }] : []),
      { kind: 'socket', socketIndex: 0, augmentId: astrid },
    ],
    cursor: 2,
    targetDefinitions: {
      nextTargetId: 3,
      targets: ['SpellCriticalStrikeChance4', 'AlloyEffectOfSocketedAugments1'].map((modId, i) => ({
        targetId: `t${i + 1}`,
        modId,
      })),
      alternatives: [],
      values: [],
    },
    orphanedTargets: [],
  }
  const read = parseTargetCraftProject(JSON.stringify(input), catalog)
  if (!read.ok) throw Error(read.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={read.value.project.initialState}
      initialProject={read.value}
    />,
  )
}
it.each([false, true])(
  '纯Astrid未来路线支持准备孔位、第二工艺和完整恢复（需打孔=%s）',
  (needsSocket) => {
    setup(needsSocket)
    const buttons = [...(needsSocket ? ['应用打孔'] : []), '应用镶嵌', '应用合金结果']
    for (const apply of buttons) {
      const before = save()
      click('生成多步示例路线')
      const preview = screen.getAllByRole('button', { name: '预览路线第一步' })[0]
      if (!preview) throw Error('缺少容量路线')
      fireEvent.click(preview)
      expect(save().project).toEqual(before.project)
      click(apply)
      expect(save().project.cursor).toBe(before.project.cursor + 1)
    }
    expect(screen.getByLabelText('当前工艺容量').textContent).toContain('工艺占用 2 / 当前容量 2')
    const finished = save().project
    click('撤销')
    save()
    click('恢复本机演练')
    click('重做')
    expect(save().project).toEqual(finished)
  },
)

it('网页添加第七目标会按拟编辑组合选择真实Serle历史', () => {
  const serle = 'pob2:augment:["Serle\'s Triumph","caster"]'
  let state: CraftState = {
    baseId: 'Volatile Wand',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes: [],
    sockets: [serle, null],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix'] as const) {
    const mod = craftCandidates(catalog, state).find((entry) => entry.kind === kind)
    if (!mod) throw Error('缺少普通候选')
    const result = addCraftAffix(catalog, state, mod.id)
    if (!result.ok) throw Error(result.error)
    state = result.value
  }
  const seventh = craftCandidates(catalog, state).find((entry) => entry.kind === 'suffix')
  if (!seventh) throw Error('缺少第四后缀')
  const extracted = extractTargetDefinitions(
    catalog,
    state,
    state.affixes.map((a) => a.modId),
    false,
    false,
  )
  if (!extracted.ok) throw Error(extracted.error)
  const capacityHistory = [{ ...state, sockets: [astrid, null] }, state]
  const capacityContext = findTargetCapacityContext(catalog, capacityHistory, extracted.value)
  if (!capacityContext) throw Error('缺少容量来源')
  expect(capacityContext.sockets).toEqual([astrid, null])
  const onEdit = vi.fn()
  render(
    <CraftTargets
      catalog={catalog}
      state={state}
      definitions={extracted.value}
      capacityContext={capacityContext}
      capacityHistory={capacityHistory}
      onEdit={onEdit}
      onStart={() => {}}
      onStartEssence={() => {}}
      onStartPreparation={() => {}}
      onPreviewRoute={() => {}}
      translations={{}}
      busy={false}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: seventh.id } })
  click(`加入目标 ${seventh.id}`)
  expect(onEdit).toHaveBeenCalledWith({ kind: 'add', modId: seventh.id })
})
