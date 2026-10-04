import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// spec §5.14 的完整声明只有一处出处（契约 C5）；契约 C18 保证 happy-dom 测试里可以直接导入 compliance.mjs
import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
// @ts-expect-error 构建脚本直接由 Node 执行，不进入浏览器包。
import { EXTENSION_PAGE_FORBIDDEN } from '../../../scripts/check-site.mjs'
import { L1_DEMO_LABEL } from '../../shared/l1Demo'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { ExtensionPage } from './ExtensionPage'
import { downloadHref, EXTENSION_RELEASE, formatSize } from './release'

afterEach(cleanup)

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]'
const COE_BETA = 'https://beta.craftofexile.com/?game=poe2'
const META = `（v${EXTENSION_RELEASE.version}，zip，${formatSize(EXTENSION_RELEASE.bytes)}）`
const DOWNLOAD_TEXT = `下载扩展${META}`
// 可访问名称在浏览器与 happy-dom 里可能在“下载扩展”与括号之间多一个空格，比较时忽略空白
const isDownloadName = (name: string) =>
  name.replace(/\s+/g, '') === DOWNLOAD_TEXT.replace(/\s+/g, '')
// 本文件在 apps/site/src/pages/extension/：上四级是 apps/，上五级是仓库根
const here = dirname(fsPathFromMetaUrl(import.meta.url))

function setup() {
  const view = render(<ExtensionPage />)
  const main = view.container.querySelector('main') as HTMLElement
  return { ...view, main }
}
const texts = (nodes: Iterable<Element>) => [...nodes].map((node) => node.textContent)
// section 的名称来自 aria-labelledby 指向的标题
function labelOf(root: HTMLElement, section: Element): string | null {
  const id = section.getAttribute('aria-labelledby')
  return id === null ? null : (root.querySelector(`#${id}`)?.textContent ?? null)
}

describe('扩展介绍页：面向普通用户', () => {
  it('下载按钮直链 zip、带 download 属性，文字取自 release.json；页面不出现开发向内容', () => {
    const { container, main } = setup()
    const download = screen.getByRole('link', { name: isDownloadName })
    expect(download.getAttribute('href')).toBe(downloadHref)
    expect(downloadHref).toBe(`/downloads/${EXTENSION_RELEASE.file}`)
    expect(download.hasAttribute('download')).toBe(true)
    expect(download.textContent).toBe(DOWNLOAD_TEXT)
    const hrefs = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    for (const word of EXTENSION_PAGE_FORBIDDEN as string[]) {
      expect(main.textContent, word).not.toContain(word)
      for (const href of hrefs) expect(href, word).not.toContain(word)
    }
    expect(
      hrefs.some((href) => /\/archive\/|install\.md|compatibility\.md|[0-9a-f]{40}/.test(href)),
    ).toBe(false)
    // SHA-256 只放在 GitHub Release；页面也不链接 Release（扩展发布 spec §7、§9）
    expect(main.textContent).not.toContain(EXTENSION_RELEASE.sha256)
    expect(hrefs.some((href) => href.includes('/releases'))).toBe(false)
    expect(container.querySelector('pre')).toBeNull()
  })

  it('页面根带 pt-backdrop，跳转链接指向 main', () => {
    const { container } = setup()
    expect((container.firstElementChild as HTMLElement).className).toBe('pt-backdrop portal')
    expect(screen.getByRole('link', { name: '跳到主要内容' }).getAttribute('href')).toBe('#main')
    expect(container.querySelector('main#main')?.className).toBe('portal-main ext-main')
  })

  it('阅读顺序：先确认环境，再出现下载按钮，然后是安装、确认生效与更新说明', () => {
    const { container } = setup()
    const order = ['#env', '.pt-forge-btn', '#install', '#verify', '#update'].map(
      (selector) => container.querySelector(selector) as Element,
    )
    for (const node of order) expect(node).not.toBeNull()
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as Element
      const after = order[i] as Element
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    }
    const env = container.querySelector('#env') as HTMLElement
    expect(env.contains(container.querySelector('.pt-forge-btn'))).toBe(false)
  })
})

describe('下载区：本页唯一的金属重点（方案 §3.3）', () => {
  it('只有一扇无标题栏的 pt-frame--hero，框内只有一个金属主按钮，就是下载按钮', () => {
    const { container } = setup()
    const frames = container.querySelectorAll('.pt-frame')
    expect(frames).toHaveLength(1)
    const gate = frames[0] as HTMLElement
    expect(gate.tagName).toBe('DIV')
    expect(gate.className).toBe('pt-frame pt-frame--hero ext-gate')
    expect(container.querySelector('.pt-titlebar')).toBeNull()
    const title = screen.getByRole('heading', { level: 1 })
    expect(gate.contains(title)).toBe(true)
    expect(title.className).toBe('pt-hero-title pt-hero-title--extension')
    expect(title.textContent).toBe('熟悉的术语，就在原来的工具里。')
    expect(title.querySelector('br')?.className).toBe('mobile-break')
    expect(title.querySelector('.pt-hero-title__gold')?.textContent).toBe('就在原来的工具里。')
    const forge = container.querySelectorAll('.pt-forge-btn')
    expect(forge).toHaveLength(1)
    const download = screen.getByRole('link', { name: isDownloadName })
    expect(download).toBe(forge[0])
    expect(download.className).toBe('pt-forge-btn ext-download__btn')
    expect(download.querySelector('.ext-download__meta')?.textContent).toBe(META)
    expect(container.querySelector('#download')?.contains(download)).toBe(true)
    expect(gate.contains(download)).toBe(true)
  })

  it('hero 标题两个分句各自整体换行：宽度不够时只在“，”后断开', () => {
    const { container } = setup()
    const h1 = container.querySelector('h1') as HTMLElement
    expect(texts(h1.querySelectorAll('.hero-clause'))).toEqual([
      '熟悉的术语，',
      '就在原来的工具里。',
    ])
    expect(h1.querySelector('.pt-hero-title__gold')?.classList.contains('hero-clause')).toBe(true)
    const rules = parseRules(
      readFileSync(resolve(here, '../../shared/styles/site.css'), 'utf8'),
    ).filter((rule) => rule.selectors.includes('.hero-clause'))
    expect(rules.map((rule) => [rule.atRules, [...rule.declarations]])).toEqual([
      [[], [['display', 'inline-block']]],
    ])
  })

  it('导语一句话说清能力范围；安装路线是四个页内链接，目标都存在', () => {
    const { container } = setup()
    const lead = container.querySelector('.ext-gate__lead') as HTMLElement
    expect(lead.textContent).toBe(
      'PoE2 中文助手在 Craft of Exile 的英文界面上显示国服简体术语，可以用中文搜基底和词缀；部分装备的国服文本可转成英文导入。',
    )
    expect(texts(lead.querySelectorAll('.nw'))).toEqual([
      'Craft of Exile',
      '部分装备的国服文本',
      '可转成英文导入。',
    ])
    const nav = screen.getByRole('navigation', { name: '安装路线' })
    expect(container.querySelector('.ext-gate')?.contains(nav)).toBe(true)
    const links = within(nav).getAllByRole('link')
    expect(texts(links)).toEqual(['确认环境', '下载', '安装（四步）', '确认生效'])
    const targets = links.map((link) => link.getAttribute('href') ?? '')
    expect(targets).toEqual(['#env', '#download', '#install', '#verify'])
    for (const target of targets) expect(container.querySelector(target), target).not.toBeNull()
  })

  it('左栏“先确认环境”：四项环境、不支持范围与 CoE Beta 链接', () => {
    const { container } = setup()
    const env = container.querySelector('section#env') as HTMLElement
    expect(labelOf(container, env)).toBe('先确认环境')
    const heading = within(env).getByRole('heading', { level: 2 })
    expect(heading.className).toBe('pt-subhead')
    expect(heading.textContent).toBe('先确认环境')
    expect(env.querySelector('.ext-gate__note')?.textContent).toBe('以下几项都符合再下载。')
    expect(texts(env.querySelectorAll('dt'))).toEqual(['浏览器', '站点', '原站设置', '术语'])
    expect(texts(env.querySelectorAll('dd'))).toEqual([
      '电脑上的 Chrome',
      'beta.craftofexile.com 新版 Beta',
      'PoE2 → English',
      '国服简体中文 暂无台服繁体',
    ])
    expect(env.querySelector('.ext-env__not')?.textContent).toBe(
      '不支持旧版 www 站和 PoE1，也不会翻译所有英文段落。',
    )
    const coe = within(env).getByRole('link', { name: /打开 CoE Beta/ })
    expect(coe.getAttribute('href')).toBe(COE_BETA)
    expect(coe.className).toBe('text-link ext-env__link')
    // 外链箭头是 Icon external（aria-hidden 的 SVG），不用 Unicode 字形“↗”
    expect(coe.textContent?.trim()).toBe('打开 CoE Beta')
    const icon = coe.querySelector('svg.icon')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M7 17 17 7')
  })

  it('右栏“再下载”：说明 → 下载按钮 → 发布日期、权限、更新入口 → 完整声明；中间的中缝只是装饰', () => {
    const { container } = setup()
    const download = container.querySelector('section#download') as HTMLElement
    expect(labelOf(container, download)).toBe('再下载')
    const heading = within(download).getByRole('heading', { level: 2 })
    expect(heading.className).toBe('pt-subhead')
    expect(heading.textContent).toBe('再下载')
    expect(download.querySelector('.ext-gate__note')?.textContent).toBe(
      '扩展还没有上架 Chrome 应用商店。从本站下载 zip，再按下面四步安装，只需操作一次。',
    )
    expect(texts(download.querySelectorAll('.ext-facts > li'))).toEqual([
      `发布于 ${EXTENSION_RELEASE.date}`,
      '只申请“存储”权限，用来在本机保存设置',
      '已装旧版？看更新方法',
    ])
    expect(
      within(download).getByRole('link', { name: '已装旧版？看更新方法' }).getAttribute('href'),
    ).toBe('#update')
    const legal = download.querySelector('.ext-gate__legal') as HTMLElement
    expect(legal.textContent).toBe(FULL_DISCLAIMER)
    expect(legal.querySelectorAll(FOCUSABLE)).toHaveLength(0)
    const seam = container.querySelector('.ext-seam') as HTMLElement
    expect(seam.getAttribute('aria-hidden')).toBe('true')
    expect(seam.querySelector('.pt-motif.pt-motif--knot')).not.toBeNull()
    expect(seam.previousElementSibling?.id).toBe('env')
    expect(seam.nextElementSibling?.id).toBe('download')
    expect(container.querySelectorAll('.pt-subhead')).toHaveLength(2)
  })
})

describe('安装与确认生效（L0）', () => {
  it('安装四步：标题与文案按样稿，第 4 步写明拼图图标要点两次', () => {
    const { container } = setup()
    const install = container.querySelector('section#install') as HTMLElement
    expect(labelOf(container, install)).toBe('安装')
    expect(install.closest('.pt-frame')).toBeNull()
    expect(install.querySelector('.ext-guide__head p')?.textContent).toBe(
      `当前版本 v${EXTENSION_RELEASE.version}。下载后按顺序做一次，之后不用重复。`,
    )
    const steps = [...install.querySelectorAll('.ext-steps > li.ext-step')]
    expect(texts(steps.map((li) => li.querySelector('h3') as Element))).toEqual([
      '解压到固定文件夹',
      '打开开发者模式',
      '加载扩展',
      '在 CoE Beta 中启用',
    ])
    expect(steps.map((li) => texts(li.querySelectorAll('p')))).toEqual([
      ['把下载的 zip 解压到一个固定的文件夹，之后不要删除或移动它。'],
      ['在 Chrome 地址栏打开 chrome://extensions，打开右上角“开发者模式”。'],
      ['点“加载已解压的扩展程序”，选刚才解压的文件夹。'],
      [
        '打开 CoE Beta，选 PoE2 → English 并刷新页面。',
        '点工具栏的拼图图标，在展开的列表里点“PoE2 中文助手”打开弹窗，再打开“启用简体中文”。',
      ],
    ])
    expect(install.querySelector('.ext-guide__note')?.textContent).toBe(
      'Chrome 会提示扩展不是来自应用商店，这是正常的。开发者模式需要一直开着，关掉后扩展会停用；Chrome 更新后如果扩展被停用，回到扩展页重新打开即可。',
    )
    for (const h3 of install.querySelectorAll('h3')) expect(h3.className).toBe('')
  })

  it('确认生效：两处检查项，搜索候选示意取自正式词典、用共用的 l1demo__ 类并标明是自绘示意', () => {
    const { container } = setup()
    const verify = container.querySelector('section#verify') as HTMLElement
    expect(labelOf(container, verify)).toBe('确认生效')
    expect(verify.closest('.pt-frame')).toBeNull()
    expect(verify.querySelector('.ext-verify__mark')?.getAttribute('aria-hidden')).toBe('true')
    expect(verify.querySelector('.ext-verify__intro')?.textContent).toBe(
      '装好后回到 CoE Beta 刷新页面，看下面两处。',
    )
    const see = [...verify.querySelectorAll('.ext-see > li > span')].map((span) => [
      span.firstChild?.textContent,
      span.querySelector('small')?.textContent,
    ])
    expect(see).toEqual([
      [
        '导航、按钮等已收录的界面文字显示为中文',
        '装备属性保留英文对照；词典没收录的内容保持英文、不猜译，这是正常现象。弹窗里打开“显示中英对照”可同时看到英文。',
      ],
      [
        '首页的基底搜索框输入“水晶”，出现中英对照的候选',
        '如下图：选“水晶法器 → Crystal Focus”，原站照常用英文搜索。',
      ],
    ])
    const demo = verify.querySelector('figure') as HTMLElement
    expect(demo.className).toBe('pt-panel pt-panel--inset ext-demo')
    const caption = demo.querySelector('figcaption') as HTMLElement
    expect(caption.className).toBe('l1demo__cap')
    expect(demo.getAttribute('aria-labelledby')).toBe(caption.id)
    expect(caption.textContent).toBe('示例中文助手的搜索候选 · 自绘示意，不是 CoE 截图')
    expect(caption.querySelector('.l1demo__tag')?.textContent).toBe('示例')
    // 搜索框标签画的是扩展生效时原站标签的译名（与首页同一常量），不再写英文 “Base search”
    const label = demo.querySelector('.l1demo__label') as HTMLElement
    expect(label.textContent).toBe(L1_DEMO_LABEL)
    expect(label.hasAttribute('lang')).toBe(false)
    // 搜索框的放大镜是 Task 2 加入的 Icon search；候选框是整框，不用首页的拆段修饰类
    expect(demo.querySelectorAll('.l1demo__field > svg.icon')).toHaveLength(1)
    // 扩展不渲染“中文输入”之类的徽记：示意只画扩展真实输出的部分
    expect(demo.querySelector('.l1demo__ime')).toBeNull()
    expect(demo.querySelector('.l1demo__field')?.textContent).toBe('水晶')
    expect([...demo.querySelectorAll('.l1demo__box')].map((box) => box.className)).toEqual([
      'l1demo__box',
    ])
    expect(demo.querySelector('.l1demo__help')?.textContent).toBe(
      '“水晶”：选择英文查询（方向键移动，Enter 选择，Escape 取消）',
    )
    const options = [...demo.querySelectorAll('.l1demo__opt')]
    const pairs = options.map((option) => [
      option.firstElementChild?.textContent ?? '',
      option.querySelector('[lang="en"]')?.textContent ?? '',
    ])
    expect(pairs).toEqual([
      ['水晶法器', 'Crystal Focus'],
      ['符文水晶法器', 'Runeforged Crystal Focus'],
      ['符文师匠水晶法器', 'Runemastered Crystal Focus'],
    ])
    // 选中只靠类名表示外观（与首页同一写法），不写 ARIA 状态或 data 属性
    expect(options.map((option) => option.className)).toEqual([
      'l1demo__opt l1demo__opt--selected',
      'l1demo__opt',
      'l1demo__opt',
    ])
    expect(demo.querySelector('[aria-selected], [data-selected]')).toBeNull()
    const by = demo.querySelector('.l1demo__by') as HTMLElement
    expect(by.textContent).toBe('PoE2 中文助手 · 非官方')
    expect(by.getAttribute('aria-hidden')).toBe('true')
    expect(by.querySelector('.pt-motif.pt-motif--gem.pt-attr-ext')).not.toBeNull()
    expect(demo.querySelector('.l1demo__foot')?.textContent).toBe(
      '候选框底部有“PoE2 中文助手 · 非官方”署名，用来区分扩展和原站的内容。',
    )
    expect(demo.querySelectorAll(FOCUSABLE)).toHaveLength(0)
    // 示意不能和扩展实际行为脱节：候选名在正式词典里，搜索框标签是扩展对原站标签的译名，
    // 说明句与扩展搜索框一致，弹窗开关名与弹窗一致
    const items = readFileSync(resolve(here, '../../../../../data/dict/zh-CN/items.json'), 'utf8')
    for (const [zh, en] of pairs) expect(items, en).toContain(`"${en}": "${zh}"`)
    const search = readFileSync(
      resolve(here, '../../../../poe2-extension/src/content/search-controller.ts'),
      'utf8',
    )
    expect(search).toContain('：选择英文查询（方向键移动，Enter 选择，Escape 取消）')
    const ui = JSON.parse(
      readFileSync(resolve(here, '../../../../../data/l10n/coe-beta/ui.zh-CN.json'), 'utf8'),
    ) as { entries: Record<string, string> }
    expect(ui.entries['Search for a craftable item']).toBe(L1_DEMO_LABEL)
    const popup = readFileSync(resolve(here, '../../../../poe2-extension/popup.html'), 'utf8')
    for (const label of ['启用简体中文', '显示中英对照', '检查更新']) expect(popup).toContain(label)
  })

  it('三种状态与 0.4.0 弹窗同词：判据用弹窗状态词与带署名的候选，未生效三个原因的做法与弹窗状态 5、3、6 一致', () => {
    const { container } = setup()
    const states = [...container.querySelectorAll('#verify .ext-states > .ext-state')]
    expect(states.map((state) => state.className)).toEqual([
      'ext-state ext-state--ok',
      'ext-state ext-state--part',
      'ext-state ext-state--off',
    ])
    expect(states.map((state) => state.querySelector('dt')?.textContent)).toEqual([
      '生效中',
      '部分生效',
      '未生效',
    ])
    for (const state of states) {
      expect(state.querySelector('dt svg')?.getAttribute('aria-hidden')).toBe('true')
    }
    const [ok, part, off] = states as [Element, Element, Element]
    expect(ok.querySelector('dd')?.textContent).toBe(
      '两处都对上了。页面上仍有一些英文是正常的：未收录的内容保持原文。转换装备文本后，仍要在原站核对导入结果。',
    )
    expect(part.querySelector('dd')?.textContent).toBe(
      '弹窗显示“部分生效”，或界面已有中文但基底搜索框输入“水晶”不出候选，或某一整块区域的界面文字仍全是英文。先刷新页面；仍不行请反馈，并写明是哪个区域。',
    )
    const offDd = off.querySelector('dd') as HTMLElement
    // 不再用“页面有没有中文”判断：语言不是 English 时扩展会显示中文提示，原站自带中文界面时页面本来就是中文
    expect(offDd.firstChild?.textContent).toBe(
      '扩展弹窗顶部显示“未生效”；或者在搜索框输入“水晶”，没有出现带“PoE2 中文助手 · 非官方”署名的候选。原站自带的中文界面不算生效。通常是下面三个原因之一：',
    )
    const causes = [...offDd.querySelectorAll('.ext-causes > li.ext-cause')].map((cause) => [
      cause.querySelector('.ext-cause__why')?.textContent,
      cause.querySelector('.ext-cause__fix')?.textContent,
    ])
    expect(causes).toEqual([
      [
        '不是 CoE Beta 页面',
        '地址要是 beta.craftofexile.com；旧版 www 站不支持。地址没错时，可能是页面在安装或更新扩展之前就打开了，刷新即可。',
      ],
      [
        '没切到 PoE2 + English',
        '在原站选 PoE2，右上角语言选 English，再刷新页面。语言不是 English 时，页面左下角会出现扩展的提示，弹窗里也会写明原因。',
      ],
      [
        '扩展未启用',
        '在 chrome://extensions 确认开发者模式和这个扩展都开着，刚在扩展页打开扩展时要刷新页面；在弹窗里打开“启用简体中文”不用刷新。',
      ],
    ])
    // 不为“初始化失败”单列第四条：弹窗状态 7 自带做法句与“刷新页面”按钮
    expect(offDd.querySelectorAll('.ext-causes > li')).toHaveLength(3)
    // 状态词与弹窗同源：0.4.0 弹窗的状态词是 page-view.ts 里 PageView['word'] 的字面量
    const pageView = readFileSync(
      resolve(here, '../../../../poe2-extension/src/popup/page-view.ts'),
      'utf8',
    )
    for (const word of ['生效中', '部分生效', '未生效'])
      expect(pageView, word).toContain(`'${word}'`)
  })
})

describe('参考信息与删除项', () => {
  it('更新、隐私、装备文本转换、支持范围、反馈五节，各自带 aria-labelledby；其余标题保持 L0', () => {
    const { container } = setup()
    const details = [...container.querySelectorAll('.ext-details > section')]
    expect(details.map((section) => labelOf(container, section))).toEqual([
      '更新与恢复',
      '文本处理与隐私',
      '装备文本转换',
      '支持范围与已知限制',
      '遇到问题？',
    ])
    expect(details.map((section) => section.id)).toEqual(['update', 'privacy', 'convert', '', ''])
    expect(texts(container.querySelectorAll('#update p'))).toEqual([
      '下载新版 zip，解压覆盖原文件夹里的文件，在扩展页点该扩展的“重新加载”（圆形箭头），再刷新 CoE 页面；弹窗里的“检查更新”会打开本页对比版本。',
      '关闭汉化可恢复原文。禁用或卸载扩展后，也请刷新原站页面。',
    ])
    expect(texts(container.querySelectorAll('#privacy p'))).toEqual([
      '汉化和文本转换都在你的浏览器里完成，设置也保存在本机。填入英文并在 CoE 点击继续后，由原站处理后续操作。',
      '扩展仅面向 CoE Beta，不需要游戏账号登录，也不代替你执行原站导入。',
    ])
    expect(screen.getByRole('link', { name: '查看权限与隐私说明' }).getAttribute('href')).toBe(
      'https://github.com/pine2D/poe2-tools/blob/main/docs/chrome-extension/privacy.md',
    )
    expect((details[3] as Element).querySelector('p')?.textContent).toBe(
      '当前版本不保证支持所有页面和装备格式。遇到未收录的内容、有歧义的译文或损坏的数值时，会提示你检查，不会猜译。Windows 自带的中文输入法尚未完成验证，遇到输入问题请反馈。',
    )
    expect((details[4] as Element).querySelector('p')?.textContent).toBe(
      '可以先关闭扩展，看看原站是否也有同样的问题。反馈时请说明页面、操作步骤和扩展版本；如果附上装备样本，请先删去私人信息。',
    )
    expect(
      within(details[4] as HTMLElement)
        .getByRole('link', { name: '反馈问题' })
        .getAttribute('href'),
    ).toBe('https://github.com/pine2D/poe2-tools/issues')
    for (const name of [
      '安装',
      '确认生效',
      '更新与恢复',
      '文本处理与隐私',
      '装备文本转换',
      '支持范围与已知限制',
      '遇到问题？',
    ]) {
      expect(screen.getByRole('heading', { name }).className, name).toBe('')
    }
  })

  // 首页写“部分装备的国服文本可转成英文导入（支持范围见介绍页）”，落点就是这一节；
  // 按钮名逐字取自扩展实际渲染的文字（import-controller.ts）与扩展对原站按钮的译名（ui.zh-CN.json）
  it('装备文本转换：在“确认生效”之后，有序步骤写明入口、快捷键、预览与由玩家在原站确认，限制写明咒符和传奇', () => {
    const { container, main } = setup()
    const section = container.querySelector('#convert') as HTMLElement
    expect(section).not.toBeNull()
    expect(section.tagName).toBe('SECTION')
    expect(labelOf(container, section)).toBe('装备文本转换')
    const heading = within(section).getByRole('heading', { level: 2, name: '装备文本转换' })
    expect(heading.className).toBe('')
    const verify = container.querySelector('#verify') as Element
    expect(verify.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    const steps = texts(section.querySelectorAll('ol > li'))
    expect(steps).toEqual([
      '在 CoE Beta 点原站的“导入装备”，粘贴在游戏里按 Ctrl+Alt+C 复制的国服装备文本。',
      '点“预览中文转换”，对照原文与英文两栏核对。',
      '预览后显示“可以填入”（译文完整）时，核对两栏后点“填入英文到原站导入框”；显示“需先核对 N 处”时这个按钮不能用，点问题前面的“第 N 行”会选中原文里的这一行，改正后重新预览。',
      '最后由你自己点原站的“继续”（Proceed）完成导入。扩展不会替你提交，导入结果以原站为准。',
    ])
    expect(texts(section.querySelectorAll('ol > li:nth-child(3) strong'))).toEqual([
      '填入英文到原站导入框',
      '第 N 行',
    ])
    // 第 2、3 步引用的按钮名、结论词与定位按钮逐字取自面板源码（第三期核对清单）：控制器改词时这里先失败
    const controller = readFileSync(
      resolve(here, '../../../../poe2-extension/src/content/import-controller.ts'),
      'utf8',
    )
    for (const text of ['预览中文转换', '填入英文到原站导入框', '可以填入', '需先核对']) {
      expect(controller, text).toContain(text)
    }
    // 定位按钮的文字是模板串 `第 ${行号} 行`；用正则字面量，避免字符串里出现 ${ 触发 Biome 报警
    expect(controller).toMatch(/`第 \$\{/)
    const limits = section.querySelector('ol + p')?.textContent ?? ''
    expect(limits).toContain('咒符')
    expect(limits).toContain('传奇')
    expect(limits).toContain('仅供对照')
    expect(limits).toContain('保持原文')
    for (const word of EXTENSION_PAGE_FORBIDDEN as string[]) {
      expect(section.textContent, word).not.toContain(word)
    }
    expect(main.querySelectorAll('#convert').length).toBe(1)
  })

  it('能力区与旧“确认翻译生效”一节已删去', () => {
    const { container, main } = setup()
    expect(container.querySelector('section[aria-label="主要能力"]')).toBeNull()
    expect(main.querySelector('.pt-divider')).toBeNull()
    for (const word of ['看得懂', '搜得到', '核对后再导入']) {
      expect(main.textContent, word).not.toContain(word)
    }
    expect(screen.queryByRole('heading', { name: '确认翻译生效' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '先确认你的使用环境' })).toBeNull()
  })
})

describe('extension.css（二期样稿，令牌化）', () => {
  const css = readFileSync(resolve(here, '../../shared/styles/extension.css'), 'utf8')
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = parseRules(css)
  const squash = (value: string) => value.replace(/\s+/g, '')
  const norm = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
  const NARROW = ['max-width: 620px']
  const FORCED = ['forced-colors: active']
  // 取某个选择器在指定条件（外层 @media，由外到内）下的全部声明；conditions 为空表示顶层
  function decls(selector: string, conditions: readonly string[] = []): Map<string, string> {
    const merged = new Map<string, string>()
    for (const rule of rules) {
      if (!rule.selectors.map(norm).includes(selector)) continue
      if (rule.atRules.length !== conditions.length) continue
      if (!conditions.every((c, i) => squash(rule.atRules[i] ?? '').includes(squash(c)))) continue
      for (const [name, value] of rule.declarations) merged.set(name, norm(value))
    }
    return merged
  }

  it('字号只用 --fs-* 令牌；margin、padding、gap 不写 px、em、rem（几何尺寸除外）', () => {
    let sizes = 0
    for (const rule of rules) {
      const where = rule.selectors.join(', ')
      for (const [name, value] of rule.declarations) {
        if (name === 'font-size') {
          sizes += 1
          expect(norm(value), `${where} font-size`).toMatch(/^var\(--fs-[a-z-]+\)$/)
        }
        if (/^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(name)) {
          expect(value, `${where} ${name}`).not.toMatch(/\d(px|r?em)\b/)
        }
      }
    }
    expect(sizes).toBeGreaterThan(10)
  })

  it('颜色只取 ui-theme 令牌：不写十六进制、rgb()、hsl() 字面颜色', () => {
    expect(bare).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(bare).not.toMatch(/\b(rgba?|hsla?)\(/)
  })

  it('页面层不写衬线字体栈、不设层级、不裁切角饰、不引用外部资源（spec §7.1、§4.5、§8.5）', () => {
    expect(bare).not.toMatch(/--pt-(serif|cinzel)/)
    expect(bare).not.toMatch(/z-index/)
    expect(bare).not.toMatch(/overflow\s*:\s*(hidden|clip)|contain\s*:\s*paint/)
    expect(bare).not.toMatch(/url\(/)
  })

  it('环境与下载左右分、中缝居中；≤850px 改单列，中缝变横线', () => {
    expect(decls('.ext-gate__split').get('grid-template-columns')).toBe(
      'minmax(0, 1fr) var(--seam-w) minmax(0, 1fr)',
    )
    expect(decls('.ext-gate__split').get('--seam-w')).toBe('calc(var(--sp-8) + var(--sp-4))')
    expect(decls('.ext-gate__split', ['max-width: 850px']).get('grid-template-columns')).toBe(
      'minmax(0, 1fr)',
    )
    expect(decls('.ext-seam__line', ['max-width: 850px']).get('height')).toBe('1px')
  })

  it('安装四步：宽屏四列，≤1099px 两列，≤620px 单列竖排、轨线在左', () => {
    expect(decls('.ext-steps').get('grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))')
    expect(decls('.ext-steps', ['max-width: 1099px']).get('grid-template-columns')).toBe(
      'repeat(2, minmax(0, 1fr))',
    )
    expect(decls('.ext-steps', NARROW).get('grid-template-columns')).toBe('minmax(0, 1fr)')
    expect(decls('.ext-step', NARROW).get('border-inline-start')).toBe('1px solid var(--line-2)')
    expect(decls('.ext-verify__grid', ['max-width: 1099px']).get('grid-template-columns')).toBe(
      'minmax(0, 1fr)',
    )
  })

  it('≤620px：下载按钮通栏、版本与大小换到第二行；页内链接可点高 ≥44px', () => {
    const button = decls('.ext-download .pt-forge-btn', NARROW)
    expect(button.get('width')).toBe('100%')
    expect(button.get('flex-direction')).toBe('column')
    expect(button.get('min-height')).toBe('46px')
    expect(decls('.ext-download__meta', NARROW).get('font-size')).toBe('var(--fs-micro)')
    for (const selector of [
      '.ext-route a',
      '.ext-env__link',
      '.ext-facts .text-link',
      '.ext-details .text-link',
    ]) {
      expect(decls(selector, NARROW).get('min-height'), selector).toBe('44px')
    }
  })

  it('状态色写在 dt 上、图标随文字色；写了颜色的图标在强制色彩下改为 inherit', () => {
    expect(decls('.ext-state--ok dt').get('color')).toBe('var(--ok)')
    expect(decls('.ext-state--part dt').get('color')).toBe('var(--miss)')
    expect(decls('.ext-state--off dt').get('color')).toBe('var(--danger)')
    expect(decls('.ext-see .icon').get('color')).toBe('var(--ok)')
    expect(decls('.ext-see .icon', FORCED).get('color')).toBe('inherit')
    expect(decls('.ext-seam__line', FORCED).get('background')).toBe('CanvasText')
  })

  it('候选下拉示意的样式来自共用的 l1-demo.css：本页不重复写，只放大选中项', () => {
    // 底色、边框、选中外观与搜索框图标的强制色彩由 l1-demo.css 负责（apps/site/src/testing/l1-demo.test.ts）
    expect(bare).not.toMatch(/\.ext-(cands|coe)\b|\.ext-demo__/)
    expect(bare).not.toMatch(/aria-selected|data-selected/)
    const selected = decls('.ext-demo .l1demo__opt--selected')
    expect(selected.get('font-size')).toBe('var(--fs-lead)')
    expect(selected.get('margin-block')).toBe('var(--sp-1)')
  })
})
