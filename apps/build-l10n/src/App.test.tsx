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
  await screen.findByText('词典就绪')
}

function upload(name: string, text: string) {
  fireEvent.change(screen.getByLabelText('选择 .build 文件'), {
    target: { files: [new File([text], name, { type: 'application/json' })] },
  })
}

// 概览卡的下载按钮与文件行的同名（都是「下载 rich.build」），只在侧栏列表里找。
// 不能用 within(getByRole('listitem'))：主区还有 .misslist / .supports / .passives 的 <li>。
const inFileList = () => within(screen.getByRole('list', { name: '已导入文件' }))

describe('App', () => {
  it('上传文件 → 列表显示覆盖率 → 下载得到译文', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('rich.build', rich)
    // 文件名在列表按钮与（Task 5 起）概览里都会出现：按角色找列表按钮
    await screen.findByRole('button', { name: 'rich.build' })
    expect(screen.getByText('88%')).toBeDefined()
    fireEvent.click(inFileList().getByLabelText('下载 rich.build'))
    expect(blobs).toHaveLength(1)
    expect(await blobs[0]?.text()).toBe(expected)
    // 下载是任务流的最后一步，点完必须说清文件去哪儿（研究报告 G8 / P2-11）
    expect(await screen.findByText(/已下载 rich\.build/)).toBeDefined()
    expect(screen.getByText(/放进 Build Planner 目录后同名替换/)).toBeDefined()
  })

  it('双语选项改变输出；全部下载在多文件时给 zip', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    fireEvent.click(screen.getByLabelText('双语（保留英文原行）'))
    fireEvent.click(inFileList().getByLabelText('下载 rich.build'))
    expect(await blobs[0]?.text()).toContain('149% increased Spell Damage')
    upload('rich2.build', rich)
    await screen.findByRole('button', { name: 'rich2.build' })
    fireEvent.click(screen.getByRole('button', { name: '全部下载' }))
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
    expect(inFileList().getByText('—')).toBeDefined()
    fireEvent.change(screen.getByLabelText('粘贴 .build 内容'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByText('添加粘贴内容'))
    await screen.findByRole('button', { name: 'pasted-2.build' })
    expect(screen.getByText('解析失败')).toBeDefined()
    fireEvent.click(screen.getByLabelText('移除 pasted-2.build'))
    await waitFor(() => expect(screen.queryByText('pasted-2.build')).toBeNull())
  })

  it('切换 locale 重新加载词典；词典加载失败时可以重试', async () => {
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
    await screen.findByText('词典就绪')
    fireEvent.click(screen.getByLabelText('繁体中文（台服）'))
    await waitFor(() => expect(calls.some((u) => u.includes('/zh-TW/stats.json'))).toBe(true))
    await screen.findByText('词典就绪')
  })

  it('primary 表缺失 → 顶栏徽章报失败，主区给出原因与重试', async () => {
    let attempt = 0
    const good = fakeDictFetch(miniBundle)
    render(
      <App
        fetchImpl={async (url) => {
          attempt += 1
          // 首轮 7 张表并发请求（stats 是第 1 次）；stats 失败会让 loadDict 提前返回，
          // meta.json 根本不会取，所以第一轮总共只有 7 次调用，第 8 次起放行。
          if (attempt <= 7 && url.includes('/stats.json'))
            return { ok: false, status: 404, json: async () => null }
          return good(url)
        }}
      />,
    )
    await screen.findByText('词典加载失败')
    expect(screen.getByText('zh-CN/stats.json：HTTP 404')).toBeDefined()
    // 主区错误卡的按钮叫「重新加载词典」，徽章里的叫「重试加载词典」，两个名字不撞
    expect(screen.getByRole('button', { name: '重新加载词典' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重试加载词典' }))
    await screen.findByText('词典就绪')
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

  it('空态只有一块引导区：没有侧栏、没有两句互相矛盾的空文案', async () => {
    await renderReady()
    // level 2 把它与顶栏那个 <h1> 字标分开
    expect(screen.getByRole('heading', { level: 2, name: 'PoE2 构筑汉化' })).toBeDefined()
    expect(screen.queryByText('还没有文件')).toBeNull()
    expect(screen.queryByText(/选择左侧文件/)).toBeNull()
    // 全站只有一个拖放区，所以「选择 .build 文件」不会一名两指
    expect(screen.getAllByLabelText('选择 .build 文件')).toHaveLength(1)
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    // 有文件之后引导区让位给预览，侧栏出现
    expect(screen.queryByRole('heading', { level: 2, name: 'PoE2 构筑汉化' })).toBeNull()
  })
})
