import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../../packages/build-core/src/testing/miniDict'
import { fakeDictFetch } from '../../shared/testing/fakeDictFetch'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { App } from './App'
import { EXAMPLE_SERIES } from './example'

const rich = readFileSync(
  resolve(
    dirname(fsPathFromMetaUrl(import.meta.url)),
    '../../../../../data/fixtures/synthetic/rich.build',
  ),
  'utf8',
)
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function ready(files = [new File([rich], 'rich.build')]) {
  render(<App fetchImpl={fakeDictFetch(miniBundle)} />)
  await screen.findByText('词典就绪')
  fireEvent.change(screen.getByLabelText('选择 .build 文件'), { target: { files } })
  await screen.findByRole('heading', { name: '处理结果' })
}

describe('A 单页交付', () => {
  it('默认显示可下载结果，核对和阶段表按需进入', async () => {
    await ready()
    expect(screen.getByText('1 份可下载')).toBeTruthy()
    expect(screen.getByRole('button', { name: '下载中文文件' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(document.querySelector('.stageboard__table')).toBeNull()
    expect(document.getElementById('build-title')).toBeNull()
    expect(document.getElementById('app-side')).toBeNull()
    expect(screen.getByText('导出选项').closest('details')?.open).toBe(false)
  })

  it('待核对在结果内展开，收起后焦点返回原入口', async () => {
    await ready()
    const name = '查看待核对 rich.build'
    fireEvent.click(screen.getByRole('button', { name }))
    expect(document.querySelector('.delivery__review #build-title')).toBeTruthy()
    expect(document.getElementById('review-list')?.hidden).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '收起核对' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name })))
    expect(document.getElementById('build-title')).toBeNull()
  })

  it('导出范围独立于阶段比较和逐项核对，返回保留选项', async () => {
    await ready(EXAMPLE_SERIES.map((item) => new File([item.text], item.name)))
    fireEvent.change(screen.getByLabelText('下载范围'), { target: { value: 'all' } })
    fireEvent.click(screen.getByText('导出选项'))
    fireEvent.click(screen.getByLabelText('导出时保留英文原行'))
    fireEvent.click(screen.getByRole('button', { name: /^阶段比较 / }))
    expect(document.querySelector('.stageboard__table')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '逐项核对 1–30 级' }))
    expect((screen.getByLabelText('下载范围') as HTMLSelectElement).value).toBe('all')
    fireEvent.click(screen.getByRole('button', { name: '返回处理结果' }))
    expect(screen.getByRole('heading', { name: '处理结果' })).toBeTruthy()
    expect((screen.getByLabelText('导出时保留英文原行') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('下载范围') as HTMLSelectElement).value).toBe('all')
  })

  it('当前文件导出不因进入同一构筑的阶段比较而改成首阶段', async () => {
    await ready(EXAMPLE_SERIES.map((item) => new File([item.text], item.name)))
    fireEvent.click(screen.getByRole('button', { name: '查看内容 example-2.build' }))
    fireEvent.change(screen.getByLabelText('下载范围'), { target: { value: 'file' } })
    fireEvent.click(screen.getByRole('button', { name: '收起核对' }))
    fireEvent.click(screen.getByRole('button', { name: /^阶段比较 / }))
    expect(screen.getByText('当前文件 · example-2.build')).toBeTruthy()
    fireEvent.click(screen.getByText('查看实际导出内容'))
    expect(document.querySelector('.app__output-name')?.textContent).toBe('example-2.build')
  })

  it('部分文件失败时明确数量，成功文件仍可直接下载', async () => {
    await ready([new File(['{'], 'broken.build'), new File([rich], 'rich.build')])
    expect(screen.getByText('1 份可下载')).toBeTruthy()
    expect(screen.getByText('1 份解析失败，不会导出')).toBeTruthy()
    expect((screen.getByLabelText('下载范围') as HTMLSelectElement).value).toBe('all')
    expect(screen.getByRole('button', { name: '下载中文文件' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(screen.getByRole('button', { name: '下载 rich.build' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下载 broken.build' })).toBeNull()
  })

  it('移除失败文件后焦点仍落在相邻文件的可用操作上', async () => {
    await ready([new File(['{'], 'a.build'), new File(['{'], 'b.build')])
    fireEvent.click(screen.getByRole('button', { name: '移除 a.build' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '移除 b.build' })),
    )
    fireEvent.click(screen.getByRole('button', { name: '移除 b.build' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('选择 .build 文件')),
    )
  })

  it('实际输出预览与所选范围一致，下载失败不丢文件和选项', async () => {
    await ready(EXAMPLE_SERIES.map((item) => new File([item.text], item.name)))
    fireEvent.click(screen.getByText('导出选项'))
    fireEvent.click(screen.getByLabelText('导出时保留英文原行'))
    fireEvent.change(screen.getByLabelText('下载范围'), { target: { value: 'file' } })
    fireEvent.click(screen.getByText('查看实际导出内容'))
    const panel = within(screen.getByRole('region', { name: '导出构筑' }))
    expect(panel.queryByRole('combobox', { name: '选择要查看的导出文件' })).toBeNull()
    expect(
      (panel.getByRole('textbox', { name: '下载文件内容' }) as HTMLTextAreaElement).value,
    ).toContain('increased Spell Damage')
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        throw new Error('blocked')
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: '下载中文文件' }))
    expect(screen.getByRole('alert').textContent).toContain('文件和设置已保留')
    expect(screen.getByText('3 份可下载')).toBeTruthy()
    expect((screen.getByLabelText('导出时保留英文原行') as HTMLInputElement).checked).toBe(true)
  })
})
