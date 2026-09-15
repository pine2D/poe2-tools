import type { CraftStep } from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { CraftRehearsalReportPanel } from './CraftRehearsalReportPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const props = {
  catalog: boneCatalog(),
  initialState: { ...boneState(), rarity: 'normal' as const },
  operations: [{ currency: 'transmutation', modIds: ['prefix1'] }] as CraftStep[],
  cursor: 1,
  translations: {},
}
const report = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: '制作步骤清单文本' })

it('展开才生成清单，游标改变后立即更新，收起恢复焦点', () => {
  const { rerender } = render(<CraftRehearsalReportPanel {...props} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '导出制作步骤清单' }))
  expect(report().value).toContain('步骤 1：蜕变石')
  rerender(<CraftRehearsalReportPanel {...props} cursor={0} />)
  expect(report().value).not.toContain('步骤 1：')
  fireEvent.click(screen.getByRole('button', { name: '收起步骤清单' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '导出制作步骤清单' }))
})

it('剪贴板复制旧结果期间撤销，不显示过期成功消息', async () => {
  let resolve: () => void = () => {}
  const writeText = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const { rerender } = render(<CraftRehearsalReportPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '导出制作步骤清单' }))
  const old = report().value
  fireEvent.click(screen.getByRole('button', { name: '复制步骤清单' }))
  expect(writeText).toHaveBeenCalledWith(old)
  rerender(<CraftRehearsalReportPanel {...props} cursor={0} />)
  await act(async () => resolve())
  expect(screen.queryByText('已复制步骤清单。')).toBeNull()
  expect(report().value).not.toContain('步骤 1：')
})

it('剪贴板不可用时可以选中全文，下载内容与预览相同并释放 URL', async () => {
  vi.stubGlobal('navigator', {})
  let blob: Blob | undefined
  const create = vi.fn((value: Blob) => {
    blob = value
    return 'blob:report-test'
  })
  const revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(<CraftRehearsalReportPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '导出制作步骤清单' }))
  fireEvent.click(screen.getByRole('button', { name: '复制步骤清单' }))
  expect(await screen.findByText('无法访问剪贴板，请选中全文后手动复制。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '选中清单全文' }))
  expect(report().selectionEnd).toBe(report().value.length)
  fireEvent.click(screen.getByRole('button', { name: '下载步骤清单' }))
  expect(await blob?.text()).toBe(report().value)
  expect(click).toHaveBeenCalledOnce()
  expect(revoke).toHaveBeenCalledWith('blob:report-test')
})

it('回放失败时没有可复制或下载的半份清单', () => {
  render(<CraftRehearsalReportPanel {...props} cursor={2} />)
  fireEvent.click(screen.getByRole('button', { name: '导出制作步骤清单' }))
  expect(screen.getByRole('alert').textContent).toContain('历史位置')
  expect(screen.queryByRole('button', { name: '下载步骤清单' })).toBeNull()
})

it('父组件以相同报告输入重新渲染时，不重复回放和翻译历史', () => {
  const translateLine = vi.fn((line: string) => line)
  const { rerender } = render(
    <CraftRehearsalReportPanel {...props} translateLine={translateLine} />,
  )
  fireEvent.click(screen.getByRole('button', { name: '导出制作步骤清单' }))
  const calls = translateLine.mock.calls.length
  expect(calls).toBeGreaterThan(0)
  rerender(<CraftRehearsalReportPanel {...props} translateLine={translateLine} />)
  expect(translateLine).toHaveBeenCalledTimes(calls)
  rerender(<CraftRehearsalReportPanel {...props} cursor={0} translateLine={translateLine} />)
  expect(report().value).not.toContain('步骤 1：')
})
