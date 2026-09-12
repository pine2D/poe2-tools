import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../packages/build-core/src/testing/miniDict'
import type { FetchJson } from '../dict/loadDict'
import { fakeDictFetch } from '../testing/fakeDictFetch'
import { CraftItemTextPanel } from './CraftItemTextPanel'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Iron Helmet',
      name: 'Iron Helmet',
      type: 'Helmet',
      tags: ['default', 'helmet'],
      requirements: { Level: 1 },
      properties: { Armour: 18 },
      implicit: null,
      implicitTags: [],
      sourceQuality: 20,
      socketLimit: 2,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [],
}
const state: CraftState = {
  baseId: 'Iron Helmet',
  itemLevel: 80,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
}
function open() {
  fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'en' } })
  fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
}
function textarea() {
  return screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement
}
function copy() {
  fireEvent.click(screen.getByRole('button', { name: '复制英文装备文本' }))
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function localeFetch(omit: string[] = []): FetchJson {
  return (url) => {
    const bundle = structuredClone(miniBundle)
    bundle.locale = url.includes('zh-TW') ? 'zh-TW' : 'zh-CN'
    if (bundle.items)
      bundle.items.bases = { 'Iron Helmet': bundle.locale === 'zh-TW' ? '臺服鐵盔' : '国服铁盔' }
    return fakeDictFetch(bundle, { omit })(url)
  }
}
function chooseLanguage(value: string) {
  fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value } })
}
function deferred() {
  let finish: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}

describe('三语装备文本', () => {
  it.each(['close', 'unmount'] as const)(
    '加载未完成时 %s 忽略迟到响应且英语始终可选',
    async (action) => {
      const gate = deferred()
      const inner = localeFetch()
      const fetchImpl: FetchJson = async (url) => {
        await gate.promise
        return inner(url)
      }
      const view = render(
        <CraftItemTextPanel
          catalog={catalog}
          state={state}
          pending={false}
          fetchImpl={fetchImpl}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
      expect(screen.queryByRole('textbox')).toBeNull()
      if (action === 'close') {
        fireEvent.click(screen.getByRole('button', { name: '收起装备文本' }))
        chooseLanguage('en')
        fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
        expect(textarea().value).toContain('Item Level: 80')
      } else view.unmount()
      await act(async () => {
        gate.finish()
      })
      if (action === 'close') {
        expect(textarea().value).toContain('Item Level: 80')
        expect(screen.queryByLabelText('演练装备简体中文文本')).toBeNull()
      } else expect(screen.queryByRole('textbox')).toBeNull()
    },
  )
  it('默认中文只在展开后加载，两套语言独立，复制和下载使用当前内容', async () => {
    const fetchImpl = vi.fn(localeFetch())
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob
      return 'blob:cn'
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let filename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download
    })
    render(
      <CraftItemTextPanel catalog={catalog} state={state} pending={false} fetchImpl={fetchImpl} />,
    )
    expect((screen.getByLabelText('装备文本语言') as HTMLSelectElement).value).toBe('zh-CN')
    expect(fetchImpl).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
    })
    const text = screen.getByLabelText('演练装备简体中文文本') as HTMLTextAreaElement
    expect(text.value).toContain('国服铁盔')
    fireEvent.click(screen.getByRole('button', { name: '复制简体中文装备文本' }))
    await act(async () => {})
    expect(writeText).toHaveBeenCalledWith(text.value)
    fireEvent.click(screen.getByRole('button', { name: '下载装备文本' }))
    expect(filename).toBe('poe2-simulated-item.zh-CN.txt')
    expect(await blob?.text()).toBe(text.value)
    expect(revoke).toHaveBeenCalledWith('blob:cn')
    await act(async () => {
      chooseLanguage('zh-TW')
    })
    expect((screen.getByLabelText('演练装备繁体中文文本') as HTMLTextAreaElement).value).toContain(
      '臺服鐵盔',
    )
    const calls = fetchImpl.mock.calls.length
    chooseLanguage('en')
    expect(textarea().value).toContain('Iron Helmet')
    expect(fetchImpl).toHaveBeenCalledTimes(calls)
  })
  it('快速切换与折叠忽略旧词典结果，后台响应不抢焦点', async () => {
    const cn = deferred()
    const tw = deferred()
    const inner = localeFetch()
    const fetchImpl: FetchJson = async (url) => {
      await (url.includes('zh-TW') ? tw.promise : cn.promise)
      return inner(url)
    }
    render(
      <CraftItemTextPanel catalog={catalog} state={state} pending={false} fetchImpl={fetchImpl} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
    chooseLanguage('zh-TW')
    expect(screen.queryByRole('textbox')).toBeNull()
    const language = screen.getByLabelText('装备文本语言')
    language.focus()
    await act(async () => {
      cn.finish()
    })
    expect(screen.queryByRole('textbox')).toBeNull()
    await act(async () => {
      tw.finish()
    })
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('臺服鐵盔')
    expect(document.activeElement).toBe(language)
    fireEvent.click(screen.getByRole('button', { name: '收起装备文本' }))
    await act(async () => {})
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('失败可以重试，灰区缺失使用英文基底，旧复制完成不覆盖切换消息', async () => {
    let failing = true
    const inner = localeFetch(['items'])
    const fetchImpl: FetchJson = (url) =>
      failing ? Promise.resolve({ ok: false, status: 500, json: async () => null }) : inner(url)
    const copyGate = deferred()
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () => copyGate.promise,
    } as unknown as Clipboard)
    render(
      <CraftItemTextPanel catalog={catalog} state={state} pending={false} fetchImpl={fetchImpl} />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
    })
    expect(screen.getByRole('alert').textContent).toContain('500')
    expect(screen.queryByRole('textbox')).toBeNull()
    failing = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重试词典加载' }))
    })
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('Iron Helmet')
    expect(screen.getByText(/基底缺少/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '复制简体中文装备文本' }))
    chooseLanguage('en')
    await act(async () => {
      copyGate.finish()
    })
    expect(screen.getByRole('status').textContent).not.toContain('已复制')
  })
  it('请求期间当前装备改变或卸载不会采用旧输出', async () => {
    const gate = deferred()
    const inner = localeFetch()
    const fetchImpl: FetchJson = async (url) => {
      await gate.promise
      return inner(url)
    }
    const view = render(
      <CraftItemTextPanel catalog={catalog} state={state} pending={false} fetchImpl={fetchImpl} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
    view.rerender(
      <CraftItemTextPanel
        catalog={catalog}
        state={{ ...state, itemLevel: 81 }}
        pending={false}
        fetchImpl={fetchImpl}
      />,
    )
    await act(async () => {
      gate.finish()
    })
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('物品等级: 81')
    view.unmount()
  })
})

describe('CraftItemTextPanel', () => {
  it('默认折叠，展开聚焦只读文本，复制真实文本，收起返回入口', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    render(<CraftItemTextPanel catalog={catalog} state={state} pending={false} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    open()
    expect(textarea().readOnly).toBe(true)
    expect(document.activeElement).toBe(textarea())
    expect(textarea().value).toContain('Item Level: 80')
    copy()
    await act(async () => {})
    expect(writeText).toHaveBeenCalledWith(textarea().value)
    expect(screen.getByRole('status').textContent).toContain('已复制')
    fireEvent.click(screen.getByRole('button', { name: '收起装备文本' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '导出装备文本' }))
  })

  it.each(['missing', 'rejected'])('剪贴板%s时可选中全文手动复制且不误报成功', async (kind) => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
      kind === 'missing'
        ? (undefined as unknown as Clipboard)
        : ({ writeText: vi.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard),
    )
    render(<CraftItemTextPanel catalog={catalog} state={state} pending={false} />)
    open()
    copy()
    await act(async () => {})
    expect(screen.getByRole('status').textContent).toContain('手动复制')
    expect(screen.getByRole('status').textContent).not.toContain('已复制')
    fireEvent.click(screen.getByRole('button', { name: '选中全部文本' }))
    expect(textarea().selectionStart).toBe(0)
    expect(textarea().selectionEnd).toBe(textarea().value.length)
    expect(document.activeElement).toBe(textarea())
  })

  it('当前装备变更不抢焦点，并忽略旧复制完成', async () => {
    let finish: (() => void) | undefined
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    } as unknown as Clipboard)
    const view = render(<CraftItemTextPanel catalog={catalog} state={state} pending={false} />)
    open()
    copy()
    const button = screen.getByRole('button', { name: '下载装备文本' })
    button.focus()
    view.rerender(
      <CraftItemTextPanel catalog={catalog} state={{ ...state, itemLevel: 81 }} pending={false} />,
    )
    expect(textarea().value).toContain('Item Level: 81')
    expect(document.activeElement).toBe(button)
    await act(async () => {
      finish?.()
    })
    expect(screen.getByRole('status').textContent).not.toContain('已复制')
  })

  it.each([false, true])('下载安全文件名与完整文本，异常=%s仍释放URL', async (fail) => {
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob
      return 'blob:simulated'
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let filename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download
      if (fail) throw new Error('blocked')
    })
    render(<CraftItemTextPanel catalog={catalog} state={state} pending={false} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: '下载装备文本' }))
    expect(filename).toBe('poe2-simulated-item.txt')
    expect(blob?.type).toBe('text/plain;charset=utf-8')
    expect(await blob?.text()).toBe(textarea().value)
    expect(revoke).toHaveBeenCalledWith('blob:simulated')
    if (fail) expect(screen.getByRole('status').textContent).toContain('下载失败')
  })

  it('非法状态不显示可复制或下载的结果', () => {
    render(
      <CraftItemTextPanel
        catalog={catalog}
        state={{ ...state, baseId: 'missing' }}
        pending={false}
      />,
    )
    open()
    expect(screen.getByRole('alert').textContent).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '复制英文装备文本' })).toBeNull()
  })
})
