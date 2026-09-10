import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../packages/build-core/src/testing/miniDict'
import { App } from './App'
import { fakeDictFetch } from './testing/fakeDictFetch'
import { fsPathFromMetaUrl } from './testing/fsPath'

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../data/fixtures/synthetic')}/`
const rich = readFileSync(`${fixtures}rich.build`, 'utf8')
const expected = readFileSync(`${fixtures}rich.expected.zh-CN.build`, 'utf8').trimEnd()

// Testing Library 不自动清理：不 cleanup 的话上一个用例的 DOM 会留到下一个用例
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// 拦截下载：收集 Blob，不真的点链接
function interceptDownloads(): Blob[] {
  const blobs: Blob[] = []
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test'
    }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return blobs
}

async function renderReady() {
  render(<App fetchImpl={fakeDictFetch(miniBundle)} />)
  await screen.findByText('词典就绪：zh-CN 0.0.0（测试联盟）')
}

function upload(name: string, text: string) {
  fireEvent.change(screen.getByLabelText('选择 .build 文件'), {
    target: { files: [new File([text], name, { type: 'application/json' })] },
  })
}

describe('App', () => {
  it('上传文件 → 列表显示覆盖率 → 下载得到译文', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('rich.build', rich)
    // 文件名在列表按钮与（Task 5 起）概览里都会出现：按角色找列表按钮
    await screen.findByRole('button', { name: 'rich.build' })
    expect(screen.getByText('88%')).toBeDefined()
    fireEvent.click(screen.getByLabelText('下载 rich.build'))
    expect(blobs).toHaveLength(1)
    expect(await blobs[0]?.text()).toBe(expected)
  })

  it('双语选项改变输出；全部下载在多文件时给 zip', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    fireEvent.click(screen.getByLabelText('双语（保留英文原行）'))
    fireEvent.click(screen.getByLabelText('下载 rich.build'))
    expect(await blobs[0]?.text()).toContain('149% increased Spell Damage')
    upload('rich2.build', rich)
    await screen.findByRole('button', { name: 'rich2.build' })
    fireEvent.click(screen.getByText('全部下载'))
    expect(blobs[1]?.type).toBe('application/zip')
  })

  it('粘贴内容成为 pasted-1.build；非 JSON 显示解析失败', async () => {
    await renderReady()
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), {
      target: { value: '{"name":"x","inventory_slots":[]}' },
    })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    await screen.findByRole('button', { name: 'pasted-1.build' })
    // 覆盖率破折号只看列表项（概览里无升华也显示破折号）
    expect(within(screen.getByRole('listitem')).getByText('—')).toBeDefined()
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    await screen.findByRole('button', { name: 'pasted-2.build' })
    expect(screen.getByText('解析失败')).toBeDefined()
    fireEvent.click(screen.getByLabelText('移除 pasted-2.build'))
    await waitFor(() => expect(screen.queryByText('pasted-2.build')).toBeNull())
  })

  it('切换 locale 重新加载词典；词典加载失败时显示错误', async () => {
    const calls: string[] = []
    const inner = fakeDictFetch(miniBundle)
    render(
      <App
        fetchImpl={async (url) => {
          calls.push(url)
          return inner(url)
        }}
      />,
    )
    await screen.findByText('词典就绪：zh-CN 0.0.0（测试联盟）')
    fireEvent.change(screen.getByLabelText('目标语言'), { target: { value: 'zh-TW' } })
    await screen.findByText('词典就绪：zh-TW 0.0.0（测试联盟）')
    expect(calls.some((u) => u.includes('/zh-TW/stats.json'))).toBe(true)
  })

  it('primary 表缺失 → 页脚显示加载失败', async () => {
    render(<App fetchImpl={fakeDictFetch(miniBundle, { omit: ['stats'] })} />)
    await screen.findByText('词典加载失败：zh-CN/stats.json：HTTP 404')
  })

  it('词典加载期间文件列表不消失，覆盖率位置显示"待词典就绪"且下载禁用', async () => {
    render(<App fetchImpl={() => new Promise(() => {})} />)
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(screen.getByText('待词典就绪')).toBeDefined()
    const download = screen.getByLabelText('下载 rich.build') as HTMLButtonElement
    expect(download.disabled).toBe(true)
  })

  it('顶栏字标是产品名，不再是内部包名', async () => {
    await renderReady()
    expect(screen.getByRole('heading', { level: 1, name: 'PoE2 构筑汉化' })).toBeDefined()
    expect(screen.queryByText('build-l10n')).toBeNull()
  })
})
