import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  exportCraftItemText,
  parseCraftProject,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (r: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return () => {}
    },
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function setup(sameName = false) {
  const catalog = boneCatalog(),
    initialState = boneState(['prefix1', 'suffix1'])
  delete initialState.sockets
  const text = exportCraftItemText(catalog, initialState)
  if (!text.ok) throw Error(text.error)
  initialState.sourceText = text.value.text
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState,
    operations: [],
    cursor: 0,
    pricing: {
      unit: 'divine',
      baseCost: 2,
      prices: {
        'currency:exalted': 0.1,
        'omen:Omen of Greater Exaltation': 0.2,
        'omen:Omen of Sinistral Exaltation': 0.3,
      },
    },
  }
  const restored = parseCraftProject(JSON.stringify(project), catalog)
  if (!restored.ok) throw Error(restored.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      initialProject={restored.value}
      translations={{
        'Omen of Greater Exaltation': sameName ? '合成同名预兆' : '强效崇高预兆',
        'Omen of Sinistral Exaltation': sameName ? '合成同名预兆' : '左旋崇高预兆',
      }}
    />,
  )
}
it('路线报价区分同译名且不重复计算起点，应用和撤销更新实际成本并保留报价', async () => {
  setup(true)
  expect(screen.getByText('当前总成本：2 神圣石')).toBeDefined()
  for (const id of ['prefix2', 'prefix3']) {
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
  }
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const buttons = await screen.findAllByRole('button', { name: '预览路线第一步' })
  const button = buttons[0]
  if (!button) throw Error('没有路线')
  expect(screen.getByText('路线新增成本：0.6 神圣石')).toBeDefined()
  expect(screen.getByText('完成路线后总成本：2.6 神圣石')).toBeDefined()
  fireEvent.click(button)
  expect(screen.getByText('当前总成本：2 神圣石')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('当前总成本：2.6 神圣石')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const p = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(p.pricing.prices['currency:exalted']).toBe(0.1)
  expect(parseTargetCraftProject(JSON.stringify(p), boneCatalog()).ok).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('当前总成本：2 神圣石')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('当前总成本：2.6 神圣石')).toBeDefined()
})
it('报价草稿明确应用，非法金额不覆盖旧报价，切换单位清空金额', () => {
  setup()
  const panel = screen.getByRole('region', { name: '制作报价' })
  fireEvent.change(within(panel).getByLabelText('起点成本'), { target: { value: '3' } })
  expect(screen.getByText('当前总成本：2 神圣石')).toBeDefined()
  fireEvent.click(within(panel).getByRole('button', { name: '应用报价' }))
  expect(screen.getByText('当前总成本：3 神圣石')).toBeDefined()
  fireEvent.change(within(panel).getByLabelText('起点成本'), { target: { value: '-1' } })
  fireEvent.click(within(panel).getByRole('button', { name: '应用报价' }))
  expect(within(panel).getByRole('alert').textContent).toContain('报价格式无效')
  expect(screen.getByText('当前总成本：3 神圣石')).toBeDefined()
  fireEvent.change(within(panel).getByLabelText('计价单位'), { target: { value: 'exalted' } })
  expect((within(panel).getByLabelText('起点成本') as HTMLInputElement).value).toBe('')
  fireEvent.click(within(panel).getByRole('button', { name: '应用报价' }))
  expect(screen.getByText('当前总成本：待补报价')).toBeDefined()
  fireEvent.change(within(panel).getByLabelText('起点成本'), { target: { value: '0' } })
  fireEvent.click(within(panel).getByRole('button', { name: '应用报价' }))
  expect(screen.getByText('当前总成本：0 崇高石')).toBeDefined()
  fireEvent.click(within(panel).getByRole('button', { name: '清除本项目报价' }))
  expect(screen.queryByText('当前总成本：0 崇高石')).toBeNull()
})

it('同译名材料保留独立单价，恢复相同项目清除未应用的报价草稿', () => {
  setup(true)
  const panel = screen.getByRole('region', { name: '制作报价' })
  expect(
    (
      within(panel).getByLabelText(
        '合成同名预兆（Omen of Greater Exaltation）单价',
      ) as HTMLInputElement
    ).value,
  ).toBe('0.2')
  expect(
    (
      within(panel).getByLabelText(
        '合成同名预兆（Omen of Sinistral Exaltation）单价',
      ) as HTMLInputElement
    ).value,
  ).toBe('0.3')
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  fireEvent.change(within(panel).getByLabelText('起点成本'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect((screen.getByLabelText('起点成本') as HTMLInputElement).value).toBe('2')
  expect(screen.getByText('当前总成本：2 神圣石')).toBeDefined()
})
