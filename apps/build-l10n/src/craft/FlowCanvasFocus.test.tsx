import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { RehearsalPanel } from './RehearsalPanel'

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function setup() {
  const view = render(
    <RehearsalPanel catalog={catalog()} initialState={state('normal')} translations={{}} />,
  )
  click('启用条件指引示例')
  click('启用分阶段流程')
  return view
}
afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
  localStorage.clear()
})
it('画布默认收起，关闭归还焦点并保留缩放；清除待连线并恢复滚动', () => {
  document.body.style.overflow = 'scroll'
  setup()
  expect(screen.queryByRole('dialog')).toBeNull()
  click('打开流程画布')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '返回制作演练' }))
  expect(document.body.style.overflow).toBe('hidden')
  click('缩小画布')
  click('连接规则 2 的应用后路线')
  click('返回制作演练')
  expect(document.body.style.overflow).toBe('scroll')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '打开流程画布' }))
  click('打开流程画布')
  expect(screen.getByLabelText('画布缩放').textContent).toBe('75%')
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  click('连接规则 2 的应用后路线')
  screen.getByRole('button', { name: '添加画布阶段' }).focus()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBeDefined()
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  click('连接规则 2 的应用后路线')
  expect(fireEvent.keyDown(screen.getByLabelText('流程画布'), { key: 'Escape' })).toBe(false)
  expect(screen.queryByLabelText('画布连接状态')).toBeNull()
  expect(screen.getByRole('dialog')).toBeDefined()
  expect(fireEvent.keyDown(screen.getByLabelText('流程画布'), { key: 'Escape' })).toBe(true)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('画布内管理阶段并返回原规则编辑器，卸载恢复原滚动设置', () => {
  const view = setup()
  click('打开流程画布')
  click('添加画布阶段')
  fireEvent.click(screen.getByText('管理画布阶段'))
  const name = screen.getByLabelText('画布阶段名称 stage-2')
  fireEvent.change(name, { target: { value: ' 收尾 ' } })
  fireEvent.blur(name)
  expect(screen.getByRole('button', { name: '画布阶段 stage-2：收尾' })).toBeDefined()
  expect(
    (screen.getByRole('button', { name: '删除画布阶段 stage-1' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('画布阶段 stage-2：收尾')
  click('返回制作演练')
  click('打开流程画布')
  expect(
    screen.getByRole('button', { name: '画布阶段 stage-2：收尾' }).getAttribute('aria-pressed'),
  ).toBe('true')
  click('删除画布阶段 stage-2')
  expect(screen.queryByRole('button', { name: '画布阶段 stage-2：收尾' })).toBeNull()
  click('编辑画布规则 2')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement?.tagName).toBe('FIELDSET')
  click('打开流程画布')
  view.unmount()
  expect(document.body.style.overflow).toBe('')
})
