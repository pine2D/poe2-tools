import {
  CRAFT_RULES_VERSION,
  DESECRATION_SOURCE,
  importCraftState,
  inspectItem,
  parseCraftProject,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { FracturePanel } from './FracturePanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function start() {
  const catalog = boneCatalog('Ring')
  const source = parseItem(
    [
      'Item Class: Rings',
      'Rarity: Rare',
      'Test Ring',
      'Synthetic Base',
      '--------',
      'Item Level: 80',
      '--------',
      '{ Prefix Modifier "prefix1" }',
      'prefix1 5(1-10)',
      '{ Prefix Modifier "prefix2" }',
      'prefix2 6(1-10)',
      '{ Suffix Modifier "suffix1" }',
      'suffix1 7(1-10)',
      '{ Suffix Modifier "suffix2" }',
      'suffix2 8(1-10)',
    ].join('\n'),
  )
  if (!source.ok) throw new Error(source.error)
  const imported = importCraftState(
    catalog,
    'Synthetic Base',
    source.item,
    inspectItem(source.item, {
      items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} },
    }),
  )
  if (!imported.ok) throw new Error(imported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={imported.value}
      translations={{ 'Fracturing Orb': '破溃宝珠' }}
    />,
  )
}

it('破裂预览不消费，应用保留数值并支持取消、撤销与项目恢复', () => {
  start()
  fireEvent.click(screen.getByRole('button', { name: '预览破裂 prefix1' }))
  expect(screen.getByLabelText('破裂待应用结果')).toBeDefined()
  expect(screen.queryByText('破溃宝珠 × 1')).toBeNull()
  expect(screen.getByText('破裂状态：未锁定 → 已锁定')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '取消破裂步骤' }))
  expect(screen.queryByLabelText('破裂待应用结果')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '预览破裂 prefix1' }))
  fireEvent.click(screen.getByRole('button', { name: '应用破裂步骤' }))
  expect(screen.getByText('破溃宝珠 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toEqual([{ kind: 'fracture', modId: 'prefix1' }])
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('破溃宝珠 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('破溃宝珠 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect(screen.queryByLabelText('prefix1 · 数值 1')).toBeNull()
  fireEvent.change(screen.getByLabelText('prefix2 · 数值 1'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getAllByText('prefix1 5(1-10)').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '剥离石' }))
  const removal = screen.getByRole('region', { name: '选择要移除的词缀' })
  expect(within(removal).queryByRole('button', { name: /组 prefix1/ })).toBeNull()
})

it('目标改动清除待应用破裂，普通草稿期间不能开启破裂', () => {
  start()
  fireEvent.click(screen.getByRole('button', { name: '预览破裂 prefix1' }))
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'prefix1' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 prefix1' }))
  expect(screen.queryByLabelText('破裂待应用结果')).toBeNull()
  expect(screen.getByText('此组已达成目标，可演练锁定。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect(
    (screen.getByRole('button', { name: '预览破裂 prefix1' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('未知数值保留在全部候选中但不能锁定，未达成目标说明锁定后果', () => {
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  const unknown = state.affixes.find((a) => a.modId === 'prefix2')
  if (!unknown) throw new Error('missing fixture')
  unknown.lines = ['prefix2 (1-10)']
  render(
    <FracturePanel
      catalog={boneCatalog()}
      state={state}
      label="破溃宝珠"
      disabled={false}
      targetModIds={['prefix1']}
      targetValues={[{ modId: 'prefix1', bounds: [{ index: 0, min: 9 }] }]}
      targetAlternatives={[]}
      onPreview={vi.fn()}
    />,
  )
  expect(screen.getByText(/当前有 4 组候选/)).toBeDefined()
  expect(
    (screen.getByRole('button', { name: '预览破裂 prefix2' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(screen.getByText('此组目标数值尚未达成，破裂后不能再用神圣调整。')).toBeDefined()
})

it('回响第二组期间破裂可应用和恢复，保留两组候选与已有机会', () => {
  const catalog = boneCatalog()
  const restored = parseCraftProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      desecrationSourceHash: DESECRATION_SOURCE.sha256,
      initialState: {
        baseId: 'Synthetic Base',
        itemLevel: 80,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      },
      cursor: 4,
      operations: [
        {
          currency: 'alchemy',
          modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'],
          rolls: [
            { modId: 'prefix1', values: [5] },
            { modId: 'prefix2', values: [6] },
            { modId: 'suffix1', values: [7] },
            { modId: 'suffix2', values: [8] },
          ],
        },
        {
          kind: 'desecrate',
          boneId: 'preserved_rib',
          affixKind: 'suffix',
          directionOmen: 'dextral_necromancy',
        },
        {
          kind: 'desecration-offer',
          modIds: ['suffix3', 'suffix4', 'exclusive1'],
          revealOmen: 'abyssal_echoes',
        },
        { kind: 'desecration-reroll', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
      ],
    }),
    catalog,
  )
  if (!restored.ok) throw new Error(restored.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={restored.value.project.initialState}
      initialProject={restored.value}
      translations={{ 'Fracturing Orb': '破溃宝珠' }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '预览破裂 prefix1' }))
  fireEvent.click(screen.getByRole('button', { name: '应用破裂步骤' }))
  expect(screen.getByLabelText('首组揭示选项')).toBeDefined()
  expect(screen.getByLabelText('第二组揭示选项')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const result = parseCraftProject(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '', catalog)
  if (!result.ok) throw new Error(result.error)
  expect(result.value.states.at(-1)?.pendingDesecration).toEqual(
    restored.value.states.at(-1)?.pendingDesecration,
  )
  expect(
    result.value.project.operations.filter((op) => 'kind' in op && op.kind === 'desecration-offer'),
  ).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('破溃宝珠 × 1')).toBeDefined()
  expect(screen.getByLabelText('第二组揭示选项')).toBeDefined()
})
