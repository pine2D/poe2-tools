import { collectCraftCosts } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  socketHash,
  socketStrategyCatalog,
  socketStrategyState,
} from '../../../../packages/item-core/src/socketStrategyFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function start(sockets: (string | null)[] = []) {
  render(
    <RehearsalPanel
      catalog={socketStrategyCatalog()}
      initialState={{ ...socketStrategyState(), sockets }}
      translations={{ 'Desert Rune': '沙漠符文', 'Glacial Rune': '冰川符文' }}
    />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
}
it('从零孔依次打孔填孔，停止、取消草稿、费用和保存恢复贯通', () => {
  start()
  change('规则 1 条件 1', 'open-sockets')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', 'fire')
  change('规则 2 条件 1', 'socket-count')
  change('规则 2 条件 1 孔数下限', '2')
  change('规则 2 动作', 'stop')
  change('规则 3 条件 1', 'always')
  change('规则 3 动作', 'artificer')
  click('开始指引步骤')
  expect(screen.getByLabelText('打孔草稿')).toBeDefined()
  click('取消打孔')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toEqual([])
  for (const apply of ['应用打孔', '应用镶嵌', '应用打孔', '应用镶嵌']) {
    click('开始指引步骤')
    click(apply)
  }
  expect(screen.getByText('命中规则 2：停止。')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.augmentSourceHash).toBe(socketHash)
  expect(p.operations).toEqual([
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 0, augmentId: 'fire' },
    { kind: 'artificer' },
    { kind: 'socket', socketIndex: 1, augmentId: 'fire' },
  ])
  expect(collectCraftCosts(socketStrategyCatalog(), p.operations)).toMatchObject({
    ok: true,
    value: [
      { id: 'currency:artificer', count: 2 },
      { id: 'augment:Desert Rune', count: 2 },
    ],
  })
  click('撤销')
  expect(screen.getByText(/命中规则 1：.*第一空孔/)).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 2：停止。')).toBeDefined()
})
it('指定第二孔预览显示正确的旧符文，改规则取消草稿', () => {
  start(['fire', 'cold'])
  change('规则 1 条件 1', 'always')
  change('规则 1 动作', 'socket')
  change('规则 1 符文', 'fire')
  change('规则 1 镶嵌孔位', '1')
  click('开始指引步骤')
  expect((screen.getByLabelText('目标孔位') as HTMLSelectElement).value).toBe('1')
  expect(screen.getByText('旧符文会被覆盖：冰川符文，不会返还。')).toBeDefined()
  change('规则 1 动作', 'stop')
  expect(screen.queryByLabelText('镶嵌草稿')).toBeNull()
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
})
