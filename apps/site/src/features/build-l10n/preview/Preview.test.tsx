import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../../../shared/dict/loadDict'
import { fsPathFromMetaUrl } from '../../../shared/testing/fsPath'
import { translateSource } from '../translate/runTranslation'
import { buildFieldRows } from './fields'
import { Preview } from './Preview'
import { LEVEL_TITLE } from './plate'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../../../data/fixtures/synthetic')}/`
const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}
const result = translateSource(
  { id: 'f1', name: 'rich.build', text: readFileSync(`${fixtures}rich.build`, 'utf8') },
  dict,
  { bilingual: false, annotateUniques: true },
)
if (!result.ok) throw new Error(result.error)
const file = result.file
const fields = buildFieldRows(file, false)

// happy-dom 没有 scrollIntoView。先在 beforeAll 里补一个真实存在的空实现，用例里再用
// vi.spyOn 观察它 —— 直接 Object.defineProperty 打桩的话 vi.restoreAllMocks() 恢复不了，
// 桩会泄漏到后面的用例。
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

function stubScroll() {
  return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
}

function show(bilingual = false) {
  return render(
    <Preview
      file={file}
      fields={buildFieldRows(file, bilingual)}
      locale="zh-CN"
      bilingual={bilingual}
      onDownload={vi.fn()}
    />,
  )
}

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })
function changeSection(name: string) {
  fireEvent.click(tab(name))
}
function openReview() {
  fireEvent.click(screen.getByRole('button', { name: /^待核对 / }))
}
const cardOf = (text: string) => screen.getByText(text).closest('article') as HTMLElement

describe('Preview 主区框与信息行', () => {
  it('构筑名作为主区框标题，信息行给出文件名、升华、命中数与下载主按钮', () => {
    const { container } = show()
    const heading = screen.getByRole('heading', { name: 'Synthetic Rich - 0.5.5' })
    expect(heading.className).toBe('pt-titlebar__title')
    expect(heading.getAttribute('title')).toBe('Synthetic Rich - 0.5.5')
    expect(heading.hasAttribute('data-user-text')).toBe(true)
    expect(heading.closest('.pt-frame')?.className).toBe('pt-frame app__build-frame')
    expect(screen.getByText('魔巫 · 瓦拉煞的门徒')).toBeDefined()
    const hit = container.querySelector('.stats__ok') as HTMLElement
    expect(hit.textContent).toBe('词缀命中 7/8')
    // 计数与 M0 同为 <b class="pt-num">（字重 600、--ink，M2 Ruling 13）
    expect(hit.querySelector('b.pt-num')?.textContent).toBe('7/8')
    expect(screen.getByText('自由备注保留原文')).toBeDefined()
    const download = screen.getByRole('button', { name: '下载 rich.build' })
    expect(download.className).toBe('pt-forge-btn')
    // 图标与 M0 的 .pt-icon 同为 18px（M2 Ruling 13）
    expect(download.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(container.querySelectorAll('.pt-forge-btn')).toHaveLength(1)
    expect(container.querySelector('.meter')).toBeNull()
  })

  it('繁体模式：lang 只挂在词典内容上，页签、下载按钮与标题栏不在 lang=zh-TW 容器内（spec §4.4）', () => {
    render(
      <Preview file={file} fields={fields} locale="zh-TW" bilingual={false} onDownload={vi.fn()} />,
    )
    // base.css 的 :lang(zh-TW) 会把这些衬线固定文案改回无衬线，所以它们的祖先不得带 lang="zh-TW"
    expect(tab('装备').closest('[lang="zh-TW"]')).toBeNull()
    expect(screen.getByRole('button', { name: /^下载 / }).closest('[lang="zh-TW"]')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Synthetic Rich - 0.5.5' }).closest('[lang="zh-TW"]'),
    ).toBeNull()
    // 词典内容仍按目标语言标注：tabpanel、待核对清单、构筑说明区，以及名称牌名称自身
    expect(screen.getByRole('tabpanel').getAttribute('lang')).toBe('zh-TW')
    expect(document.getElementById('review-list')?.getAttribute('lang')).toBe('zh-TW')
    expect(document.getElementById('build-details')?.getAttribute('lang')).toBe('zh-TW')
    const name = document.getElementById('line-inventory-slots-0-additional-text-0') as HTMLElement
    expect(name.className).toBe('pt-nameplate__name')
    expect(name.getAttribute('lang')).toBe('zh-TW')
  })

  it('导入后自动滚到主区框顶部', () => {
    const scroll = stubScroll()
    const { container } = show()
    expect(scroll.mock.contexts[0]).toBe(container.querySelector('.app__build-frame'))
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  })

  it('“构筑说明与来源”是按钮，展开独立区域（位于页签行之前）', () => {
    const { container } = show()
    const toggle = screen.getByRole('button', { name: '构筑说明与来源' })
    const region = document.getElementById('build-details') as HTMLElement
    expect(toggle.getAttribute('aria-controls')).toBe('build-details')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(region.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(region.hidden).toBe(false)
    expect(within(region).getByText('构筑说明').closest('.pt-panel--card')).not.toBeNull()
    const row = container.querySelector('.pt-tabs-row') as HTMLElement
    expect(region.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Preview 金属页签（spec §5.7）', () => {
  it('tablist 与 tabpanel 语义：选中页签、aria-controls、aria-labelledby 与计数', () => {
    show()
    expect(screen.getByRole('tablist', { name: '构筑内容' })).toBeDefined()
    expect(tab('装备').getAttribute('aria-selected')).toBe('true')
    expect(tab('装备').textContent).toBe('装备4')
    const panel = screen.getByRole('tabpanel')
    expect(panel.id).toBe('build-tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-gear')
    expect(panel.tabIndex).toBe(0)
    changeSection('天赋')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-passives')
  })

  it('方向键切换分区并把焦点交给新页签，Home/End 到首末', () => {
    show()
    fireEvent.keyDown(tab('装备'), { key: 'ArrowRight' })
    expect(tab('技能').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('技能'))
    expect(screen.getByText('烈焰冲击')).toBeDefined()
    fireEvent.keyDown(tab('技能'), { key: 'End' })
    expect(tab('天赋').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('天赋'), { key: 'Home' })
    expect(tab('装备').getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tab').map((node) => node.tabIndex)).toEqual([0, -1, -1])
  })

  it('页签行吸顶；工具组依次为下一项、仅看待核对、视图分段，视觉隐藏的列说明在 tabpanel 之前', () => {
    const { container } = show()
    const row = container.querySelector('.pt-tabs-row') as HTMLElement
    expect(row.className).toBe('pt-tabs-row pt-tabs-row--sticky')
    const tools = row.querySelector('.pt-tabs-row__tools') as HTMLElement
    expect([...tools.children].map((node) => node.getAttribute('aria-label'))).toEqual([
      '下一项待核对',
      '仅看待核对',
      '预览方式',
    ])
    const only = screen.getByRole('button', { name: '仅看待核对' })
    expect(only.textContent).toBe('仅看待核对 F')
    expect(only.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(only.querySelector('.pt-wide-only')?.textContent).toBe('仅看')
    const caption = screen.getByText('对照分两栏：左栏原文（英文），右栏译文（简体中文）')
    expect(caption.className).toBe('visually-hidden')
    expect(caption.nextElementSibling?.id).toBe('build-tabpanel')
    expect(container.querySelector('.preview-columns')).toBeNull()
  })
})

describe('Preview 装备名称牌（spec §6.4.3）', () => {
  it('base：中文基底名作名称，挂首行锚点与说明 title，右侧 Cinzel 英文名；不显示“基底”标签', () => {
    show()
    const name = document.getElementById('line-inventory-slots-0-additional-text-0') as HTMLElement
    expect(name.className).toBe('pt-nameplate__name')
    expect(name.textContent).toBe('炎种长杖')
    expect(name.getAttribute('lang')).toBe('zh-CN')
    expect(name.getAttribute('title')).toBe('基底名：写入译文首行')
    expect(name.getAttribute('tabindex')).toBe('-1')
    const card = cardOf('炎种长杖')
    expect(card.className).toBe('pt-panel pt-panel--item')
    expect(within(card).getByText('Pyrophyte Staff').className).toBe('pt-nameplate__en')
    expect(within(card).queryByText('基底')).toBeNull()
    expect(within(card).getByText('主手').getAttribute('title')).toBe('Weapon1')
    expect(within(card).getByTitle(LEVEL_TITLE).textContent).toBe('适用等级 16–100')
    expect(within(card).getByText('3/3').closest('.pt-nameplate__ok')).not.toBeNull()
    expect(card.querySelectorAll('.pt-pair')).toHaveLength(3)
  })

  it('unique：传奇名作名称并挂 unique_name 锚点；第二行“传奇”标签与“✓ 传奇名已写入”，注入行不进对照行', () => {
    show()
    const name = document.getElementById('line-inventory-slots-1-unique-name') as HTMLElement
    expect(name.textContent).toBe('稳步印记')
    expect(screen.getAllByText('稳步印记')).toHaveLength(1)
    const card = cardOf('稳步印记')
    expect(card.className).toBe('pt-panel pt-panel--item pt-panel--unique')
    expect(card.querySelector('.pt-nameplate')?.className).toBe(
      'pt-nameplate pt-nameplate--unique pt-nameplate--shut',
    )
    expect(within(card).getByText('Surefooted Sigil').className).toBe('pt-nameplate__en')
    expect(within(card).getByText('传奇').getAttribute('title')).toBe(
      '传奇名：来自构筑的传奇字段，写入译文首行',
    )
    expect(within(card).getByText('传奇名已写入')).toBeDefined()
    expect(card.querySelector('.pt-pairs')).toBeNull()
    expect(screen.queryByText('传奇名注入')).toBeNull()
  })

  it('有未命中行时第二行显示“⚠ x/y · n 行待核对”，对照行四重标记', () => {
    show()
    const card = cardOf('红宝石戒指')
    expect(within(card).getByText('2/3 · 1 行待核对').closest('.pt-nameplate__warn')).not.toBeNull()
    expect(within(card).getAllByLabelText('未命中')).toHaveLength(2)
    expect(card.querySelector('.pt-tag-miss')?.textContent).toBe('未命中 · 保留原文')
  })

  it('“导出时保留英文原行”开启时第二行加“双语”标签', () => {
    show(true)
    expect(within(cardOf('炎种长杖')).getByText('双语').className).toBe('pt-nameplate__tag')
  })
})

describe('Preview 技能与天赋（spec §6.4.2）', () => {
  it('技能卡：gem 名称牌、适用等级，辅助宝石 NamePair 中文在前', () => {
    show()
    changeSection('技能')
    expect(screen.queryByText('主手')).toBeNull()
    const card = cardOf('烈焰冲击')
    expect(card.className).toBe('pt-panel pt-panel--item pt-panel--gem')
    expect(card.querySelector('.pt-nameplate')?.className).toBe('pt-nameplate pt-nameplate--gem')
    expect(within(card).getByText('Flameblast').className).toBe('pt-nameplate__en')
    expect(within(card).getByTitle(LEVEL_TITLE).textContent).toBe('适用等级 52–100')
    expect(screen.queryByText(/^Lv /)).toBeNull()
    const pair = screen.getByText('深思施法').closest('.namepair') as HTMLElement
    expect([...pair.children].map((node) => node.className)).toEqual([
      'namepair__zh namepair__zh--gem',
      'namepair__en',
    ])
    expect(screen.getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo')).toBeDefined()
    expect(cardOf('火焰风暴').querySelector('.pt-nameplate')?.className).toBe(
      'pt-nameplate pt-nameplate--gem pt-nameplate--shut',
    )
  })

  it('辅助宝石中文缺失时中文位置显示“未命中”，英文位置显示 id', () => {
    show()
    changeSection('技能')
    const pair = screen
      .getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo')
      .closest('.namepair') as HTMLElement
    expect(pair.firstElementChild?.textContent).toBe('未命中')
    expect(pair.firstElementChild?.className).toBe(
      'namepair__zh namepair__zh--gem namepair__zh--miss',
    )
  })

  it('天赋：一张 card 的紧凑列表，名称中文在前，备注缩进在名称行下', () => {
    const { container } = show()
    changeSection('天赋')
    expect(container.querySelectorAll('ul.passives')).toHaveLength(1)
    expect(
      container.querySelector('#build-tabpanel ul.passives')?.closest('.pt-panel--card'),
    ).not.toBeNull()
    expect(container.querySelectorAll('.passives > li')).toHaveLength(3)
    expect(container.querySelectorAll('.passives > li.passive--name-only')).toHaveLength(2)
    expect(container.querySelector('.passives .pt-nameplate')).toBeNull()
    expect(screen.getByText('力量').nextElementSibling?.textContent).toBe('Strength')
    const noted = container.querySelector('.passives > li:not(.passive--name-only)') as HTMLElement
    expect([...noted.children].map((node) => node.className)).toEqual(['namepair', 'pt-pairs'])
    expect(screen.getAllByText('attributes30_')).toHaveLength(1)
    expect(container.querySelector('.mk-red .num')?.textContent).toBe('+5')
  })
})

describe('Preview 定位、快捷键与译文视图', () => {
  it('待核对清单定位到人话位置，跨区切回并转移焦点', () => {
    const scroll = stubScroll()
    show()
    changeSection('技能')
    openReview()
    fireEvent.click(screen.getByRole('button', { name: '定位到 戒指 2 · 第 3 行' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
    expect(tab('装备').getAttribute('aria-selected')).toBe('true')
  })

  it('N 循环定位、F 筛选保留上下文，译文模式仍能聚焦目标', () => {
    show()
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
    expect(document.activeElement?.className).toContain('pt-tooltip__mod')
    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByRole('button', { name: '仅看待核对' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByText('主手')).toBeNull()
    expect(screen.getByText('戒指 2')).toBeDefined()
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByText('主手')).toBeDefined()
  })

  it('译文视图：装备页签换成只读提示框，顶部说明在“；”后可断行', () => {
    const { container } = show()
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    expect(container.querySelectorAll('.pt-tooltips .pt-panel--item')).toHaveLength(4)
    expect(container.querySelectorAll('.pt-nameplate--tooltip')).toHaveLength(4)
    const note = container.querySelector('.pt-tooltip-note') as HTMLElement
    expect(note.textContent).toBe('只读预览：中文词缀用提亮的词缀蓝；核对请切回“中英对照”')
    expect(note.querySelector('.pt-tooltip-note__tail')?.textContent).toBe('核对请切回“中英对照”')
    expect(screen.getByText('仅显示译文（简体中文）').className).toBe('visually-hidden')
    const ring = cardOf('红宝石戒指')
    expect(ring.querySelector('.pt-tooltip__prop')?.textContent).toBe('戒指 2')
    expect(ring.querySelector('.pt-divider')).not.toBeNull()
    expect(within(ring).getByText('未命中 · 保留原文')).toBeDefined()
    const weapon = cardOf('炎种长杖')
    expect(weapon.querySelector('.pt-tooltip__prop')?.textContent).toBe('主手·适用等级 16–100')
    expect(weapon.querySelector('.pt-nameplate__meta')).toBeNull()
    expect(cardOf('稳步印记').querySelector('.pt-tooltip__prop')?.textContent).toBe('腰带·传奇')
    changeSection('技能')
    expect(container.querySelector('.pt-panel--gem')).not.toBeNull()
    expect(container.querySelector('.pt-tooltips')).toBeNull()
  })

  // 附录 B.10：开启“导出时保留英文原行”时，提示框属性行末尾加“双语”标签（与对照视图名称牌第二行同一形态），
  // 英文原行本身仍不在提示框里显示
  it('译文视图：开启“导出时保留英文原行”时提示框属性行末尾显示“双语”标签，英文原行不显示', () => {
    const both = translateSource(
      { id: 'f2', name: 'rich.build', text: readFileSync(`${fixtures}rich.build`, 'utf8') },
      dict,
      { bilingual: true, annotateUniques: true },
    )
    if (!both.ok) throw new Error(both.error)
    const { container } = render(
      <Preview
        file={both.file}
        fields={buildFieldRows(both.file, true)}
        locale="zh-CN"
        bilingual
        onDownload={vi.fn()}
      />,
    )
    // 对照视图里炎种长杖确有保留的英文原行，下面“提示框不显示原行”的断言才有意义
    expect(cardOf('炎种长杖').querySelector('.app__pair-orig')?.textContent).toBe(
      '149% increased Spell Damage原文',
    )
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    const weapon = cardOf('炎种长杖')
    const prop = weapon.querySelector('.pt-tooltip__prop') as HTMLElement
    expect(prop.textContent).toBe('主手·适用等级 16–100·双语')
    const last = prop.lastElementChild?.lastElementChild
    expect(last?.className).toBe('pt-nameplate__tag')
    expect(last?.textContent).toBe('双语')
    expect(weapon.querySelector('.app__pair-orig')).toBeNull()
    expect(weapon.textContent).not.toContain('increased Spell Damage')
    expect(cardOf('红宝石戒指').querySelector('.pt-tooltip__prop')?.textContent).toBe('戒指 2·双语')
    expect(cardOf('稳步印记').querySelector('.pt-tooltip__prop')?.textContent).toBe(
      '腰带·传奇·双语',
    )
    expect(container.querySelectorAll('.pt-tooltips .pt-tooltip__prop')).toHaveLength(4)
    for (const item of container.querySelectorAll('.pt-tooltips .pt-tooltip__prop')) {
      expect(within(item as HTMLElement).getByText('双语').className).toBe('pt-nameplate__tag')
    }
  })

  // 附录 B.7 的思路用于属性行：每项与其后的“·”同在一个分组（.pt-tooltip__seg，样式里不拆行），
  // 换行只发生在“·”之后，“·”留在上一行行尾、不出现在行首，各项自身不被拆开
  it('译文视图：属性行每项与其后的“·”同组，最后一项不带“·”', () => {
    const both = translateSource(
      { id: 'f3', name: 'rich.build', text: readFileSync(`${fixtures}rich.build`, 'utf8') },
      dict,
      { bilingual: true, annotateUniques: true },
    )
    if (!both.ok) throw new Error(both.error)
    const { container } = render(
      <Preview
        file={both.file}
        fields={buildFieldRows(both.file, true)}
        locale="zh-CN"
        bilingual
        onDownload={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    const props = [...container.querySelectorAll('.pt-tooltips .pt-tooltip__prop')]
    expect(props).toHaveLength(4)
    for (const prop of props) {
      const segs = [...prop.children]
      expect(segs.length, prop.textContent ?? '').toBeGreaterThan(1)
      for (const [i, seg] of segs.entries()) {
        expect(seg.className, prop.textContent ?? '').toBe('pt-tooltip__seg')
        const dots = seg.querySelectorAll(':scope > .pt-tooltip__dot')
        if (i < segs.length - 1) {
          expect(dots, prop.textContent ?? '').toHaveLength(1)
          expect(seg.lastElementChild, prop.textContent ?? '').toBe(dots[0])
          expect(dots[0]?.getAttribute('aria-hidden')).toBe('true')
        } else {
          expect(dots, prop.textContent ?? '').toHaveLength(0)
        }
      }
    }
    const belt = cardOf('稳步印记').querySelector('.pt-tooltip__prop') as HTMLElement
    expect([...belt.children].map((seg) => seg.textContent)).toEqual(['腰带·', '传奇·', '双语'])
  })

  it('译文视图：未开启“导出时保留英文原行”时提示框不显示“双语”标签', () => {
    const { container } = show()
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    const tooltips = container.querySelector('.pt-tooltips') as HTMLElement
    expect(within(tooltips).queryByText('双语')).toBeNull()
    expect(cardOf('炎种长杖').querySelector('.pt-tooltip__prop')?.textContent).toBe(
      '主手·适用等级 16–100',
    )
  })

  it('阅读方式不修改输出或导出双语选项', () => {
    const onDownload = vi.fn()
    const output = file.output
    const { container } = render(
      <Preview
        file={file}
        fields={fields}
        locale="zh-CN"
        bilingual={false}
        onDownload={onDownload}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    expect(container.querySelectorAll('.pt-tooltips').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '下载 rich.build' }))
    expect(onDownload).toHaveBeenCalledOnce()
    expect(file.output).toBe(output)
    fireEvent.click(screen.getByRole('radio', { name: '中英对照' }))
    expect(container.querySelectorAll('.pt-tooltips')).toHaveLength(0)
  })
})

function custom(build: object) {
  const result = translateSource(
    { id: 'custom', name: 'custom.build', text: JSON.stringify(build) },
    dict,
    { bilingual: false, annotateUniques: true },
  )
  if (!result.ok) throw new Error(result.error)
  return render(
    <Preview
      file={result.file}
      fields={buildFieldRows(result.file, false)}
      locale="zh-CN"
      bilingual={false}
      onDownload={vi.fn()}
    />,
  )
}

describe('待核对边界', () => {
  it('基底与传奇名称未收录参与计数、过滤、定位，不改变词缀分母', () => {
    custom({
      name: 'Names',
      inventory_slots: [
        {
          inventory_id: 'Weapon1',
          additional_text: 'Unknown Staff\n1. 149% increased Spell Damage',
        },
        { inventory_id: 'Belt1', unique_name: 'Unknown Unique' },
        { inventory_id: 'Ring1', additional_text: 'Pyrophyte Staff' },
      ],
    })
    expect(document.querySelector('.stats__ok')?.textContent).toBe('词缀命中 1/1')
    expect(screen.getByRole('button', { name: '待核对 2（名称 2）' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '仅看待核对' }))
    expect(screen.queryByText('戒指 1')).toBeNull()
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-0-additional-text-0')
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-1-unique-name')
    expect(screen.getByLabelText('传奇名未收录')).toBeDefined()
  })

  it('名称英文回退：不再渲染 Cinzel 英文名，未收录标记紧跟名称；名称类待核对时不显示 ✓（B1、R9）', () => {
    const { container } = custom({
      name: 'Fallback',
      inventory_slots: [
        {
          inventory_id: 'Weapon1',
          additional_text: 'Unknown Staff\n1. 149% increased Spell Damage',
        },
        { inventory_id: 'Belt1', unique_name: 'Unknown Unique' },
      ],
    })
    const staff = screen.getByLabelText('基底名未收录')
    expect(staff.id).toBe('line-inventory-slots-0-additional-text-0')
    const staffPlate = staff.closest('.pt-nameplate') as HTMLElement
    expect(staff.closest('.pt-nameplate__name')?.getAttribute('lang')).toBe('en')
    expect(staffPlate.querySelector('.pt-nameplate__en')).toBeNull()
    expect(staffPlate.querySelector('.pt-nameplate__miss')?.textContent).toBe('基底名未收录')
    expect(within(staffPlate).getByText('词缀 1/1').className).toBe('pt-nameplate__count pt-num')
    expect(staffPlate.querySelector('.pt-nameplate__ok')).toBeNull()
    const belt = screen.getByLabelText('传奇名未收录').closest('.pt-nameplate') as HTMLElement
    expect(belt.querySelector('.pt-nameplate__en')).toBeNull()
    expect(within(belt).getAllByText('Unknown Unique')).toHaveLength(1)
    expect(container.querySelectorAll('.pt-nameplate__miss')).toHaveLength(2)
  })

  it('传奇装备的基底名：第二行“基底 <名>”挂首行锚点；未收录时译文视图按 N 聚焦属性行里的基底名元素', () => {
    const { container } = custom({
      name: 'UniqueBase',
      inventory_slots: [
        { inventory_id: 'Belt1', unique_name: 'Surefooted Sigil', additional_text: 'Unknown Sash' },
      ],
    })
    const base = document.getElementById('line-inventory-slots-0-additional-text-0') as HTMLElement
    expect(base.closest('.pt-nameplate__meta')).not.toBeNull()
    expect(base.parentElement?.textContent).toBe('基底 Unknown Sash 基底名未收录')
    expect(base.getAttribute('aria-label')).toBe('基底名未收录')
    fireEvent.click(screen.getByRole('radio', { name: '译文' }))
    fireEvent.keyDown(window, { key: 'n' })
    const focused = document.activeElement as HTMLElement
    expect(focused.id).toBe('line-inventory-slots-0-additional-text-0')
    expect(focused.closest('.pt-tooltip__prop')).not.toBeNull()
    expect(container.querySelector('.pt-tooltip__prop')?.textContent).toContain('传奇')
  })

  it('collapsed：首行是编号词缀时名称为槽位名，默认折叠，展开控件切换“展开 / 收起”', () => {
    const { container } = custom({
      name: 'Collapsed',
      inventory_slots: [
        {
          inventory_id: 'Charm1',
          additional_text: '1. +10 to maximum Life\n2. 20% increased Movement Speed',
          level_interval: [1, 100],
        },
      ],
    })
    const plate = container.querySelector('.pt-nameplate') as HTMLElement
    expect(plate.className).toBe('pt-nameplate pt-nameplate--collapsed pt-nameplate--shut')
    const name = plate.querySelector('.pt-nameplate__name') as HTMLElement
    expect(name.textContent).toBe('魔符')
    expect(name.getAttribute('title')).toBe('Charm1')
    expect(plate.querySelector('.pt-nameplate__en')).toBeNull()
    const toggle = screen.getByRole('button', { name: /^备注 2 行 · 展开/ })
    expect(toggle.className).toBe('pt-nameplate__toggle')
    const rows = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement
    expect(rows.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('备注 2 行 · 收起')
    expect(rows.hidden).toBe(false)
    expect(plate.className).toBe('pt-nameplate pt-nameplate--collapsed')
  })

  it('collapsed 含未命中行时默认展开；手动收起后清单定位先展开再聚焦', () => {
    custom({
      name: 'CollapsedMiss',
      inventory_slots: [
        { inventory_id: 'Charm1', additional_text: '1. +10 to maximum Life\n2. Unknown Affix' },
      ],
    })
    const toggle = screen.getByRole('button', { name: /^备注 2 行 · 收起/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    openReview()
    fireEvent.click(screen.getByRole('button', { name: '定位到 魔符 · 第 2 行' }))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.id).toBe('line-inventory-slots-0-additional-text-1')
  })

  it('说明中的未命中会先展开说明再定位；自由备注不算问题', () => {
    custom({ name: 'Desc', description: 'Free note\n1. Unknown Affix' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-description-1')
    expect(
      screen.getByRole('button', { name: '构筑说明与来源' }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect((document.getElementById('build-details') as HTMLElement).hidden).toBe(false)
    expect(screen.getByRole('button', { name: '待核对 1' })).toBeDefined()
  })

  it('技能与天赋备注的问题能跨区循环，筛选不会丢失定位目标', () => {
    custom({
      name: 'Cross',
      skills: [
        {
          id: 'Gem',
          support_skills: [{ id: 'Support', additional_text: '1. Unknown support affix' }],
        },
      ],
      passives: [{ id: 'Passive', additional_text: '1. Unknown passive affix' }],
    })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-skills-0-support-skills-0-additional-text-0')
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-passives-0-additional-text-0')
    expect(tab('天赋').getAttribute('aria-selected')).toBe('true')
  })

  it('没有待核对时筛选禁用，N/F 不隐藏内容', () => {
    custom({
      name: 'Clean',
      inventory_slots: [
        {
          inventory_id: 'Weapon1',
          additional_text: 'Pyrophyte Staff\n1. 149% increased Spell Damage',
        },
      ],
    })
    const button = screen.getByRole('button', { name: '仅看待核对' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'n' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('主手')).toBeDefined()
    expect(screen.queryByRole('button', { name: /下一项待核对/ })).toBeNull()
  })
})
