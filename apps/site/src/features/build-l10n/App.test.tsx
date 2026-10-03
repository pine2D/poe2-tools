import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../../packages/build-core/src/testing/miniDict'
import { fakeDictFetch } from '../../shared/testing/fakeDictFetch'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { App } from './App'
import { mockMatchMedia } from './testing/mockMatchMedia'

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../../data/fixtures/synthetic')}/`
const rich = readFileSync(`${fixtures}rich.build`, 'utf8')
const expected = readFileSync(`${fixtures}rich.expected.zh-CN.build`, 'utf8').trimEnd()

// Testing Library 不自动清理：不 cleanup 的话上一个用例的 DOM 会留到下一个用例
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

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

// 第一期起导入后默认进入阶段看板；需要单文件预览（页签、待核对清单、N/F）时先进入逐项核对
function enterReview() {
  fireEvent.click(screen.getByRole('button', { name: /^逐项核对 / }))
}

// hero 标题在逗号后有 <br className="mobile-break" />，happy-dom 计算可访问名时会在断行处多一个空格
const HERO = /^英文构筑，\s*中文读懂。$/

describe('App', () => {
  it('上传文件 → 列表显示覆盖率 → 下载得到译文', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    // Toast 的常驻容器从一开始就在，下载前是空的（控制者追加 g）
    const toastLive = document.querySelector('.app__toast-live')
    expect(toastLive).not.toBeNull()
    expect(toastLive?.textContent).toBe('')
    upload('rich.build', rich)
    // 文件名在列表按钮与（Task 5 起）概览里都会出现：按角色找列表按钮
    await screen.findByRole('button', { name: 'rich.build' })
    // 侧栏文件项：有待核对项时显示“待核对 n”，与信息行同一口径（spec §5.12，B1）
    expect(inFileList().getByText('待核对 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '下载 rich.build' }))
    expect(blobs).toHaveLength(1)
    expect(await blobs[0]?.text()).toBe(expected)
    // 下载是任务流的最后一步，点完必须说清文件去哪儿（研究报告 G8 / P2-11）
    expect(await screen.findByText(/已开始下载 rich\.build/, { selector: 'p' })).toBeDefined()
    expect(screen.getByText('下载后怎么使用？')).toBeDefined()
    // 还是同一个容器节点在播报，不是重新挂载了一个（容器常在）
    expect(document.querySelector('.app__toast-live')).toBe(toastLive)
    expect(toastLive?.textContent).toContain('已开始下载 rich.build')
  })

  it('双语选项改变输出；全部下载在多文件时给 zip', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    fireEvent.click(screen.getByLabelText('导出时保留英文原行'))
    fireEvent.click(screen.getByRole('button', { name: '下载 rich.build' }))
    expect(await blobs[0]?.text()).toContain('149% increased Spell Damage')
    upload('rich2.build', rich)
    await screen.findByRole('button', { name: 'rich2.build' })
    fireEvent.click(screen.getByRole('button', { name: '下载全部 2 份' }))
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
    expect(inFileList().getByText('词缀 0/0')).toBeDefined()
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
    const download = screen.getByRole('button', { name: '下载全部 0 份' }) as HTMLButtonElement
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
    expect(screen.getByRole('heading', { level: 2, name: HERO })).toBeDefined()
    expect(screen.queryByText('还没有文件')).toBeNull()
    expect(screen.queryByText(/选择左侧文件/)).toBeNull()
    // 全站只有一个拖放区，所以「选择 .build 文件」不会一名两指
    expect(screen.getAllByLabelText('选择 .build 文件')).toHaveLength(1)
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    // 有文件之后引导区让位给预览，侧栏出现
    expect(screen.queryByRole('heading', { level: 2, name: HERO })).toBeNull()
  })

  it('侧栏抽屉：开关声明了它控制谁，点一次展开、选中文件后自动收起', async () => {
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    const toggle = screen.getByRole('button', { name: /^文件 · / })
    expect(toggle.getAttribute('aria-controls')).toBe('app-side')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // 选一份文件之后抽屉收起，主区立刻露出来（≤560 的核心动线）
    fireEvent.click(screen.getByRole('button', { name: 'rich.build' }))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // 焦点必须交还给开关：≤560 下 <aside> 随即 display:none，刚被点击的文件按钮
    // 连同它一起消失，不接住的话焦点掉回 <body>，键盘与读屏用户在核心动线正中间丢掉光标
    expect(document.activeElement).toBe(toggle)
  })

  it('词典状态是一条礼貌播报，读屏听得到三态切换（M-1）', async () => {
    await renderReady()
    // 页面上不止一个 role="status"（词典徽章、Toast 常驻容器），用文案定位徽章那一个
    const live = screen.getByText('词典就绪').closest('[role="status"]')
    expect(live).not.toBeNull()
    expect(live?.getAttribute('aria-live')).toBe('polite')
  })

  it('导入前隐藏批量操作，导入后位于文件区', async () => {
    await renderReady()
    expect(screen.queryByRole('button', { name: /下载全部/ })).toBeNull()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(screen.getByRole('button', { name: '下载全部 1 份' }).closest('aside')).not.toBeNull()
  })

  it('移除当前文件选中相邻文件，最后一份移除回到导入页', async () => {
    await renderReady()
    upload('a.build', rich)
    await screen.findByRole('button', { name: 'a.build' })
    upload('b.build', JSON.stringify({ name: 'Next Build' }))
    await screen.findByRole('button', { name: 'b.build' })
    fireEvent.click(screen.getByRole('button', { name: '移除 a.build' }))
    expect(screen.getByRole('heading', { name: 'Next Build' })).toBeDefined()
    expect(screen.getByRole('button', { name: '下载 b.build' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '移除 b.build' }))
    expect(screen.getByRole('heading', { name: HERO })).toBeDefined()
  })

  it('切换预览不改变下载文件，切换文件复位阅读状态', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('a.build', rich)
    await screen.findByRole('button', { name: 'a.build' })
    enterReview()
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    fireEvent.click(screen.getByRole('button', { name: '下载 a.build' }))
    expect(await blobs[0]?.text()).toBe(expected)
    upload('b.build', rich)
    fireEvent.click(await screen.findByRole('button', { name: 'b.build' }))
    // 两份同 link，归为同一构筑的两个阶段；第二列是 b.build
    const reviews = screen.getAllByRole('button', { name: /^逐项核对 / })
    expect(reviews).toHaveLength(2)
    fireEvent.click(reviews[1] as HTMLElement)
    expect((screen.getByRole('radio', { name: '中英对照' }) as HTMLInputElement).checked).toBe(true)
    expect(document.querySelector('.stats__ok')?.textContent).toBe('词缀命中 7/8')
  })

  it('批量部分成功准确报告成功与失败份数', async () => {
    await renderReady()
    const blobs = interceptDownloads()
    upload('good.build', rich)
    await screen.findByRole('button', { name: 'good.build' })
    upload('bad.build', 'not json')
    await screen.findByRole('button', { name: 'bad.build' })
    fireEvent.click(screen.getByRole('button', { name: '下载成功的 1 份' }))
    expect(blobs).toHaveLength(1)
    expect(await blobs[0]?.text()).toBe(expected)
    expect(screen.getByText(/另有 1 份失败未导出/, { selector: 'p' })).toBeDefined()
  })
})

it('无文件时可加载自造示例、核对并下载，导航不再推荐工坊', async () => {
  await renderReady()
  expect(document.querySelector('a[href="/craft/"]')).toBeNull()
  expect(screen.getByRole('link', { name: 'PoE2 Tools 首页' }).getAttribute('href')).toBe('/')
  const blobs = interceptDownloads()
  fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
  await screen.findByRole('button', { name: 'example-1.build' })
  fireEvent.click(screen.getByRole('button', { name: '打包下载 3 个阶段' }))
  expect(blobs).toHaveLength(1)
  expect(blobs[0]?.type).toBe('application/zip')
})

it('一级标题属于主内容区域', async () => {
  await renderReady()
  expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 }).textContent).toBe(
    'PoE2 构筑汉化',
  )
})

// —— M2：构筑页骨架与状态（spec §4.2 白名单、§6.4.1、§6.4.2、§6.7）——
const frames = () => document.querySelectorAll('.pt-frame')
const forges = () => document.querySelectorAll('.pt-forge-btn')
const failingDict = () => {
  const good = fakeDictFetch(miniBundle)
  return async (url: string) =>
    url.includes('/stats.json') ? { ok: false, status: 404, json: async () => null } : good(url)
}

describe('构筑页骨架（M2）', () => {
  it('宽屏：侧栏是 L0 面板，含 rail、本次文件、文件列表、批量下载与下载帮助', async () => {
    mockMatchMedia(false)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    const side = document.querySelector('#app-side .app__side-inner') as HTMLElement
    expect(side.closest('aside')?.id).toBe('app-side')
    expect(within(side).getByText('本次文件')).toBeDefined()
    const all = within(side).getByRole('button', { name: '下载全部 1 份' })
    expect(all.className).toBe('pt-btn pt-btn--quiet pt-btn--block')
    // 图标与 M0 的 .pt-icon 同为 18px（M2 Ruling 13）
    expect(all.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(within(side).getByText('下载后怎么使用？').className).toBe(
      'pt-textbtn pt-textbtn--underline',
    )
    expect(document.querySelectorAll('.pt-frame .pt-frame')).toHaveLength(0)
  })

  it('宽屏已导入：只有主区一扇框（角饰 4 个），唯一的 pt-forge-btn 是下载（spec §4.2）', async () => {
    mockMatchMedia(false)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(frames()).toHaveLength(1)
    // 导入后默认是阶段看板：主区框带看板修饰类（平涂标题栏只用于看板）
    expect(screen.getByRole('main').querySelector('.pt-frame')?.className).toBe(
      'pt-frame app__build-frame app__build-frame--board',
    )
    expect(forges()).toHaveLength(1)
    expect(forges()[0]?.getAttribute('aria-label')).toBe('下载 rich.build')
  })

  it('≤1099px 已导入：只剩主区一扇框（spec §4.2、§6.7）', async () => {
    mockMatchMedia(true)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(frames()).toHaveLength(1)
    expect(forges()).toHaveLength(1)
  })

  it('≤1099px：侧栏不渲染 pt-frame，内容直接排在抽屉里；抽屉开关是 L0 折叠条', async () => {
    mockMatchMedia(true)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(document.querySelector('.pt-frame--side')).toBeNull()
    expect(document.querySelector('#app-side > .app__side-inner')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^文件 · / }).className).toBe(
      'pt-sidetoggle app__sidetoggle',
    )
  })

  it('断点跨越时侧栏都是 L0 面板，文件列表保持', async () => {
    const media = mockMatchMedia(false)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(document.querySelector('.pt-frame--side')).toBeNull()
    act(() => media.set(true))
    expect(document.querySelector('.pt-frame--side')).toBeNull()
    expect(document.querySelector('#app-side > .app__side-inner')).not.toBeNull()
    expect(inFileList().getByRole('button', { name: 'rich.build' })).toBeDefined()
  })

  it('侧栏脚注在框外，只写未命中说明，不写词典版本（B14）', async () => {
    mockMatchMedia(false)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    const note = screen.getByText('未命中的行保留原文，不做猜测替换')
    expect(note.className).toBe('app__side-note')
    expect(note.closest('.pt-frame')).toBeNull()
    expect(within(screen.getByRole('complementary')).queryByText(/^词典 /)).toBeNull()
  })

  it('词典状态条：pt-dictbar 常驻 role=status，就绪时圆点、“词典就绪”与版本号', async () => {
    await renderReady()
    const bar = screen.getByText('词典就绪').closest('[role="status"]') as HTMLElement
    expect(bar.className).toBe('pt-dictbar app__dictbar')
    expect(bar.querySelector('.pt-dictbar__dot')?.getAttribute('aria-hidden')).toBe('true')
    expect(bar.querySelector('b')?.textContent).toBe('zh-CN 0.0.0（测试联盟）')
  })

  it('空态：一扇 hero 框，标题栏“导入 .build”，唯一的 pt-forge-btn 是“选择 .build 文件”', async () => {
    await renderReady()
    expect(frames()).toHaveLength(1)
    const frame = frames()[0] as HTMLElement
    expect(frame.className).toBe('pt-frame pt-frame--hero app__empty')
    expect(frame.querySelector('.pt-titlebar__title')?.textContent).toBe('导入 .build')
    expect(forges()).toHaveLength(1)
    expect(forges()[0]?.tagName).toBe('LABEL')
    expect(forges()[0]?.getAttribute('for')).toBe('file-input')
    expect(screen.queryByText(/^词典 /)).toBeNull()
  })

  it('词典失败且没有文件：ErrorCard 在框外，下面一扇只有拖放区的“导入 .build”框，没有 pt-forge-btn', async () => {
    render(<App fetchImpl={failingDict()} />)
    await screen.findByText('词典加载失败')
    // ErrorCard 在框外，标题仍是 h2
    const card = screen
      .getByRole('heading', { level: 2, name: '词典没能加载' })
      .closest('.pt-panel') as HTMLElement
    expect(card.className).toBe('pt-panel pt-panel--card app__error')
    expect(card.closest('.pt-frame')).toBeNull()
    expect(within(card).getByRole('button', { name: '重新加载词典' }).className).toBe('pt-btn')
    // 390 宽不把“问题”拆开（spec §6.7 R15，M2 Ruling 13）
    const hint = card.querySelector('.app__error-hint') as HTMLElement
    expect(hint.textContent).toBe(
      '没有词典就没法翻译。多半是网络或缓存出了问题，重试一次通常就好。',
    )
    expect([...hint.querySelectorAll('.nw')].map((node) => node.textContent)).toEqual(['问题'])
    expect(frames()).toHaveLength(1)
    const frame = frames()[0] as HTMLElement
    expect(frame.className).toBe('pt-frame pt-frame--hero app__import')
    expect(frame.querySelector('.pt-titlebar__title')?.textContent).toBe('导入 .build')
    expect(within(frame).getByText('选择 .build 文件').className).toBe('pt-btn')
    expect(frame.querySelector('.app__drop-trust')?.textContent).toBe(
      '文件只在你的浏览器里解析，不会上传到任何服务器',
    )
    expect(within(frame).queryByRole('button', { name: '试用示例构筑' })).toBeNull()
    expect(forges()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '重试加载词典' }).className).toBe(
      'pt-btn pt-btn--quiet pt-btn--xs',
    )
  })

  it('词典失败且有文件：主区只有 ErrorCard 不加框；宽屏时侧栏仍是 L0 面板，全页没有金属框', async () => {
    mockMatchMedia(false)
    render(<App fetchImpl={failingDict()} />)
    await screen.findByText('词典加载失败')
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    const main = screen.getByRole('main')
    expect(main.querySelector('.pt-frame')).toBeNull()
    expect(within(main).getByRole('heading', { name: '词典没能加载' })).toBeDefined()
    expect(frames()).toHaveLength(0)
    expect(document.querySelector('#app-side .app__side-inner')).not.toBeNull()
  })

  it('解析失败：主区框的标题栏是文件名，框里只有 ErrorCard，动作是默认 pt-btn', async () => {
    await renderReady()
    upload('bad.build', 'not json')
    await screen.findByRole('button', { name: 'bad.build' })
    const frame = screen.getByRole('main').querySelector('.pt-frame') as HTMLElement
    const title = frame.querySelector('.pt-titlebar__title') as HTMLElement
    expect(title.textContent).toBe('bad.build')
    expect(title.getAttribute('title')).toBe('bad.build')
    expect(title.hasAttribute('data-user-text')).toBe(true)
    // 读屏大纲：ErrorCard 在主区框内，标题比框的标题栏（h2）低一级（M2 移交 A1）
    expect(title.tagName).toBe('H2')
    expect(within(frame).getByRole('heading', { level: 3, name: '这个文件没法解析' })).toBeDefined()
    expect(within(frame).getByRole('button', { name: '移除 bad.build' }).className).toBe('pt-btn')
    expect(forges()).toHaveLength(0)
  })

  it('有文件在等词典：主区框的标题栏是文件名，框里是提示文字', async () => {
    render(<App fetchImpl={() => new Promise(() => {})} />)
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { name: 'rich.build' }).className).toBe(
      'pt-titlebar__title',
    )
    expect(within(main).getByText('正在准备简体中文词典，文件已保留…')).toBeDefined()
    expect(forges()).toHaveLength(0)
  })
})

// 契约 §2.4：M2 结束时构筑页组件不再使用改版前的类名（外观全部来自 ui-theme 与 app__* 页面类）
const OLD_CLASS =
  /^(card|tip|chip|seg|badge|preview|preview-toolbar|preview-controls|preview-columns|build-header|review-summary|section-nav|review-next|sec|errorcard|toast|toast-live|filelist|dropzone|paste|rail-h|batch-download|download-help|empty|example-action|options|export-settings|opt|cta|button|hint|muted)(__[\w-]+|--[\w-]+)?$/
function oldClasses(): string[] {
  const found = new Set<string>()
  for (const node of document.querySelectorAll('[class]')) {
    for (const name of node.classList) if (OLD_CLASS.test(name)) found.add(name)
  }
  return [...found]
}

it('构筑页各状态都不再使用改版前的类名', async () => {
  mockMatchMedia(false)
  await renderReady()
  expect(oldClasses()).toEqual([])
  upload('rich.build', rich)
  await screen.findByRole('button', { name: 'rich.build' })
  expect(oldClasses()).toEqual([])
  enterReview()
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  expect(oldClasses()).toEqual([])
  fireEvent.click(screen.getByRole('radio', { name: '译文' }))
  expect(oldClasses()).toEqual([])
  for (const name of ['技能', '天赋']) {
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
    expect(oldClasses()).toEqual([])
  }
  upload('bad.build', 'not json')
  fireEvent.click(await screen.findByRole('button', { name: 'bad.build' }))
  expect(oldClasses()).toEqual([])
  cleanup()
  render(<App fetchImpl={failingDict()} />)
  await screen.findByText('词典加载失败')
  expect(oldClasses()).toEqual([])
})

describe('阶段看板（第一期）', () => {
  it('试用示例：三份文件归为一个构筑，默认显示三列看板，下载得到 zip', async () => {
    mockMatchMedia(false)
    await renderReady()
    const blobs = interceptDownloads()
    fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '打包下载 3 个阶段' }))
    expect(blobs[0]?.type).toBe('application/zip')
    expect(await screen.findByText(/共 3 个阶段/, { selector: 'p' })).toBeDefined()
  })

  it('逐项核对进入单阶段预览，返回阶段对照回到看板', async () => {
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(screen.queryByRole('tab', { name: /^装备/ })).toBeNull()
    enterReview()
    expect(screen.getByRole('tab', { name: /^装备/ })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '返回阶段对照' }))
    expect(screen.getByRole('region', { name: '阶段对照表' })).toBeDefined()
  })

  // 看板与逐项核对互换时整块卸载：不接住焦点就掉回 <body>，键盘与读屏用户在新主动线中途丢位置
  it('逐项核对与返回阶段对照都交接焦点：进入落在构筑标题，返回落回原来的逐项核对按钮', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    fireEvent.click(screen.getByRole('button', { name: '逐项核对 1–30 级' }))
    expect(document.activeElement).toBe(document.getElementById('build-title'))
    fireEvent.click(screen.getByRole('button', { name: '返回阶段对照' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '逐项核对 1–30 级' }))
  })

  it('两套攻略分成两个构筑，可切换', async () => {
    await renderReady()
    upload('a.build', JSON.stringify({ name: 'Act 1 - Alpha', link: 'https://example.invalid/a' }))
    await screen.findByRole('heading', { name: 'Act 1 - Alpha' })
    upload('b.build', JSON.stringify({ name: 'Act 1 - Beta', link: 'https://example.invalid/b' }))
    await screen.findByRole('button', { name: 'b.build' })
    const group = screen.getByRole('radiogroup', { name: '切换构筑' })
    fireEvent.click(within(group).getByLabelText('Act 1 - Beta'))
    expect(screen.getByRole('heading', { name: 'Act 1 - Beta' })).toBeDefined()
  })

  // 看板按构筑重挂，“切换构筑”单选组随之卸载：不接住焦点就掉回 <body>，方向键再按无效
  it('切换构筑后焦点落在新的选中项上', async () => {
    await renderReady()
    upload('a.build', JSON.stringify({ name: 'Act 1 - Alpha', link: 'https://example.invalid/a' }))
    await screen.findByRole('heading', { name: 'Act 1 - Alpha' })
    upload('b.build', JSON.stringify({ name: 'Act 1 - Beta', link: 'https://example.invalid/b' }))
    await screen.findByRole('button', { name: 'b.build' })
    const before = within(screen.getByRole('radiogroup', { name: '切换构筑' })).getByLabelText(
      'Act 1 - Alpha',
    )
    before.focus()
    // 键盘方向键在浏览器里等于选中下一项并触发 change
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: '切换构筑' })).getByLabelText('Act 1 - Beta'),
    )
    expect(screen.getByRole('heading', { name: 'Act 1 - Beta' })).toBeDefined()
    const after = within(screen.getByRole('radiogroup', { name: '切换构筑' })).getByLabelText(
      'Act 1 - Beta',
    )
    expect(before.isConnected).toBe(false)
    expect(document.activeElement).toBe(after)
    expect((after as HTMLInputElement).checked).toBe(true)
  })

  it('解析失败的阶段不进看板，侧栏照常提示', async () => {
    await renderReady()
    upload('ok.build', JSON.stringify({ name: 'Act 1 - G', link: 'https://example.invalid/g' }))
    await screen.findByRole('heading', { name: 'Act 1 - G' })
    upload('bad.build', '{ not json')
    await screen.findByRole('button', { name: 'bad.build' })
    fireEvent.click(screen.getByRole('button', { name: 'ok.build' }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(1)
    expect(screen.getByText('解析失败的文件不会导出。')).toBeDefined()
  })

  it('已导入时全页只有一扇金属框（侧栏是 L0 面板）', async () => {
    mockMatchMedia(false)
    await renderReady()
    upload('rich.build', rich)
    await screen.findByRole('button', { name: 'rich.build' })
    expect(frames()).toHaveLength(1)
    expect(document.querySelector('.pt-frame--side')).toBeNull()
    expect(document.querySelector('#app-side .app__side-inner')).not.toBeNull()
  })

  // 修订 1（侧栏让位）：看板同时展示多个阶段，侧栏文件降为紧凑行，没有单选语义
  it('看板显示多个阶段时侧栏降为紧凑行：不标当前文件，抽屉开关写份数', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    const list = screen.getByRole('list', { name: '已导入文件' })
    expect(list.className).toBe('app__files app__files--stages')
    expect(list.querySelector('[aria-current]')).toBeNull()
    const toggle = screen.getByRole('button', { name: /^文件 · / })
    expect(toggle.textContent).toBe('文件 · 3 份')
    expect(toggle.querySelector('.app__sidecount')).toBeNull()
    // 逐项核对是单文件视图：恢复普通文件项与当前项标记
    fireEvent.click(screen.getByRole('button', { name: '逐项核对 1–30 级' }))
    expect(list.className).toBe('app__files')
    expect(
      within(list).getByRole('button', { name: 'example-1.build' }).getAttribute('aria-current'),
    ).toBe('true')
  })

  // 紧凑行不是死控件：点同一构筑的另一份进入它的逐项核对，焦点交给构筑标题
  it('看板多阶段时点侧栏紧凑行进入该阶段的逐项核对', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    const pick = inFileList().getByRole('button', { name: 'example-3.build' })
    expect(pick.getAttribute('title')).toMatch(/^逐项核对 /)
    fireEvent.click(pick)
    expect(screen.getByRole('button', { name: '返回阶段对照' })).toBeDefined()
    expect(document.activeElement).toBe(document.getElementById('build-title'))
    expect(
      inFileList().getByRole('button', { name: 'example-3.build' }).getAttribute('aria-current'),
    ).toBe('true')
    // 返回看板落回终局一列的“逐项核对”
    fireEvent.click(screen.getByRole('button', { name: '返回阶段对照' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '逐项核对 终局' }))
  })

  it('在逐项核对时移除全部文件，再次导入回到默认的阶段看板', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    fireEvent.click(screen.getByRole('button', { name: '逐项核对 1–30 级' }))
    expect(screen.queryByRole('region', { name: '阶段对照表' })).toBeNull()
    for (const n of [1, 2, 3]) {
      fireEvent.click(inFileList().getByRole('button', { name: `移除 example-${n}.build` }))
    }
    fireEvent.click(await screen.findByRole('button', { name: '试用示例构筑' }))
    await screen.findByRole('heading', { name: '示例构筑（自造）' })
    expect(screen.getByRole('region', { name: '阶段对照表' })).toBeDefined()
    expect(screen.getByRole('list', { name: '已导入文件' }).className).toBe(
      'app__files app__files--stages',
    )
  })
})
