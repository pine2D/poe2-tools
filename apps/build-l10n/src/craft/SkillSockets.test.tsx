import {
  type CraftCatalog,
  type CraftState,
  loadTargetWorkbenchProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftItemTextPanel } from './CraftItemTextPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'
import { SkillSocketsPanel } from './SkillSocketsPanel'

const catalog: CraftCatalog = {
  bases: [
    {
      id: 'Test Wand',
      name: 'Test Wand',
      type: 'Wand',
      tags: ['default', 'wand', 'onehand'],
      requirements: {},
      properties: {},
      implicit: 'Grants Skill: Level (1-20) Test Spell',
      implicitTags: [],
      sourceQuality: 20,
      socketLimit: 2,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [],
  },
}
const initialState: CraftState = {
  baseId: 'Test Wand',
  itemLevel: 53,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  implicitLines: ['Grants Skill: Level 12 Test Spell (Max Level 13)'],
}
const translations = {
  "Perfect Jeweller's Orb": '完美工匠石',
  "Lesser Jeweller's Orb": '低阶工匠石',
  "Greater Jeweller's Orb": '高阶工匠石',
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

it('未知孔数主动声明，预览取消不计费，直接五孔保存未来并恢复重做', () => {
  render(
    <RehearsalPanel catalog={catalog} initialState={initialState} translations={translations} />,
  )
  const preview = () => screen.getByRole('button', { name: '预览辅助孔结果' }) as HTMLButtonElement
  expect(preview().disabled).toBe(true)
  change('工匠石档位', 'perfect')
  change('操作前技能辅助孔数', '2')
  click('预览辅助孔结果')
  expect(screen.getByLabelText('辅助孔待应用结果').textContent).toContain('2 → 5')
  click('展开前后变化')
  expect(screen.getByLabelText('装备技能辅助孔变化').textContent).toContain('未知 → 5')
  expect(save().operations).toEqual([])
  click('取消辅助孔结果')
  change('工匠石档位', 'perfect')
  change('操作前技能辅助孔数', '2')
  click('预览辅助孔结果')
  click('应用辅助孔结果')
  expect(screen.getByLabelText('当前装备技能辅助孔').textContent).toContain('5')
  expect(screen.getByText('完美工匠石 × 1')).toBeDefined()
  const applied = save()
  expect(applied.rulesVersion).toBe('basic-2026-09-17-v99')
  expect(applied.operations).toEqual([
    { kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 },
  ])
  const loaded = loadTargetWorkbenchProject(JSON.stringify(applied), catalog)
  expect(loaded.ok).toBe(true)
  if (!loaded.ok) throw Error(loaded.error)
  expect(loaded.value.states.at(-1)).toMatchObject({
    grantedSkillSockets: 5,
    implicitLines: initialState.implicitLines,
  })
  expect(loaded.value.states.at(-1)?.sockets).toBeUndefined()
  expect(loaded.value.states.at(-1)?.grantedSkillLevel).toBeUndefined()
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(0)
  expect(future.operations).toHaveLength(1)
  const restored = loadTargetWorkbenchProject(JSON.stringify(future), catalog)
  if (!restored.ok) throw Error(restored.error)
  cleanup()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      initialProject={restored.value}
      translations={translations}
    />,
  )
  click('重做')
  expect(screen.getByLabelText('当前装备技能辅助孔').textContent).toContain('5')
  expect(screen.queryByRole('button', { name: '预览辅助孔结果' })).toBeNull()
})

it('指引的未知声明不自动落入规则，配置三孔后转入辅助孔停止条件', () => {
  render(
    <RehearsalPanel catalog={catalog} initialState={initialState} translations={translations} />,
  )
  click('启用条件指引示例')
  change('规则 1 条件 1', 'granted-skill-sockets')
  change('规则 1 条件 1 辅助孔下限', '3')
  change('规则 2 动作', 'skill-sockets')
  expect((screen.getByLabelText('规则 2 操作前技能辅助孔数') as HTMLInputElement).value).toBe('')
  expect(save().strategy.rules[1].action.kind).toBe('currency')
  change('规则 2 操作前技能辅助孔数', '2')
  click('应用规则 2 辅助孔配置')
  expect(save().strategy.rules[1].action).toEqual({
    kind: 'skill-sockets',
    tier: 'lesser',
    previousSockets: 2,
  })
  click('开始指引步骤')
  click('预览辅助孔结果')
  click('应用辅助孔结果')
  expect(screen.getByLabelText('当前装备技能辅助孔').textContent).toContain('3')
  expect(screen.queryByRole('button', { name: '开始指引步骤' })).toBeNull()
})

it('辅助孔结果直接提示保存项目，避免等待词典或导出丢失状态', () => {
  const fetchImpl = vi.fn(() => new Promise<never>(() => undefined))
  render(
    <CraftItemTextPanel
      catalog={catalog}
      state={{ ...initialState, grantedSkillSockets: 5 }}
      pending={false}
      fetchImpl={fetchImpl}
    />,
  )
  click('导出装备文本')
  expect(screen.getByRole('alert').textContent).toContain('辅助孔')
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '下载装备文本' })).toBeNull()
})

it('无效孔数不可预览，装备变更清空声明且已知孔数不能被配置覆盖', () => {
  const onPreview = vi.fn()
  const view = render(
    <SkillSocketsPanel
      catalog={catalog}
      state={initialState}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  for (const value of ['', '1', '3', '2.5']) {
    change('操作前技能辅助孔数', value)
    expect(
      (screen.getByRole('button', { name: '预览辅助孔结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  }
  change('操作前技能辅助孔数', '2')
  view.rerender(
    <SkillSocketsPanel
      catalog={catalog}
      state={{ ...initialState, itemLevel: 54 }}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  expect((screen.getByLabelText('操作前技能辅助孔数') as HTMLInputElement).value).toBe('')
  view.rerender(
    <SkillSocketsPanel
      catalog={catalog}
      state={{ ...initialState, grantedSkillSockets: 4 }}
      configuration={{ kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 }}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  expect(screen.getByRole('alert').textContent).toContain('一致')
  expect(
    (screen.getByRole('button', { name: '预览辅助孔结果' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(onPreview).not.toHaveBeenCalled()
})
