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

function show() {
  return render(
    <Preview file={file} fields={fields} locale="zh-CN" bilingual={false} onDownload={vi.fn()} />,
  )
}

function changeSection(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
}
function openReview() {
  fireEvent.click(screen.getByRole('button', { name: /^待核对 / }))
}

describe('Preview 灰阶工作台', () => {
  it('构筑身份、紧凑命中数和当前下载作为首层信息', () => {
    const { container } = show()
    expect(screen.getByRole('heading', { name: 'Synthetic Rich - 0.5.5' })).toBeDefined()
    expect(screen.getByText('魔巫 · 瓦拉煞的门徒')).toBeDefined()
    expect(screen.getByText('词缀命中 7/8')).toBeDefined()
    expect(screen.getByText('自由备注保留原文')).toBeDefined()
    expect(screen.getByRole('button', { name: '下载 rich.build' })).toBeDefined()
    expect(container.querySelector('.meter')).toBeNull()
  })

  it('区块切换保持数量，显示真实宝石与天赋名称、等级和标记', () => {
    const { container } = show()
    expect(screen.getByText('主手')).toBeDefined()
    changeSection('技能')
    expect(screen.queryByText('主手')).toBeNull()
    expect(screen.getByText('烈焰冲击')).toBeDefined()
    expect(screen.getByText('深思施法')).toBeDefined()
    expect(screen.getByText('Lv 52–100')).toBeDefined()
    expect(screen.getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo')).toBeDefined()
    changeSection('天赋')
    expect(screen.getByText('力量')).toBeDefined()
    expect(screen.getAllByText('attributes30_')).toHaveLength(1)
    expect(container.querySelector('.mk-red .num')?.textContent).toBe('+5')
    expect(container.querySelectorAll('.passives > li')).toHaveLength(3)
  })

  it('传奇名称头部与注入行保留，编号词缀仍逐行对齐', () => {
    const { container } = show()
    expect(screen.getByText('Surefooted Sigil')).toBeDefined()
    // 注入行移进名称牌第二行的“✓ 传奇名已写入”，对照行里不再重复（spec §6.4.3）
    expect(screen.getAllByText('稳步印记')).toHaveLength(1)
    expect(screen.getByText('传奇名已写入')).toBeDefined()
    expect(screen.getByText('2/3 · 1 行待核对')).toBeDefined()
    expect(container.textContent).toContain('法术伤害提高 149%')
    expect(screen.getAllByLabelText('未命中')).toHaveLength(2)
  })

  it('待核对清单定位到人话位置，跨区切回并转移焦点', () => {
    const scroll = stubScroll()
    show()
    changeSection('技能')
    openReview()
    fireEvent.click(screen.getByRole('button', { name: '定位到 戒指 2 · 第 3 行' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
    expect(screen.getByRole('button', { name: /^装备/ }).getAttribute('aria-pressed')).toBe('true')
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
    expect(screen.getByText('词缀命中 1/1')).toBeDefined()
    expect(screen.getByRole('button', { name: '待核对 2（名称 2）' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '仅看待核对' }))
    expect(screen.queryByText('戒指 1')).toBeNull()
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-0-additional-text-0')
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-1-unique-name')
    expect(screen.getByLabelText('传奇名未收录')).toBeDefined()
  })

  it('说明中的未命中会先展开说明再定位；自由备注不算问题', () => {
    custom({ name: 'Desc', description: 'Free note\n1. Unknown Affix' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-description-1')
    expect((document.querySelector('.build-details') as HTMLDetailsElement).open).toBe(true)
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
    expect(screen.getByRole('button', { name: /^天赋/ }).getAttribute('aria-pressed')).toBe('true')
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

// —— M2：装备页签的名称牌、对照行、折叠与译文提示框（spec §6.4.3、§6.4.4）——
const cardOf = (text: string) => screen.getByText(text).closest('article') as HTMLElement
function showWith(bilingual: boolean) {
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

describe('装备名称牌（spec §6.4.3）', () => {
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

  it('unique：传奇名挂 unique_name 锚点；第二行“传奇”标签与“✓ 传奇名已写入”；没有对照行时去掉底边', () => {
    show()
    const name = document.getElementById('line-inventory-slots-1-unique-name') as HTMLElement
    expect(name.textContent).toBe('稳步印记')
    const card = cardOf('稳步印记')
    expect(card.className).toBe('pt-panel pt-panel--item pt-panel--unique')
    expect(card.querySelector('.pt-nameplate')?.className).toBe(
      'pt-nameplate pt-nameplate--unique pt-nameplate--shut',
    )
    expect(within(card).getByText('Surefooted Sigil').className).toBe('pt-nameplate__en')
    expect(within(card).getByText('传奇').getAttribute('title')).toBe(
      '传奇名：来自构筑的传奇字段，写入译文首行',
    )
    expect(card.querySelector('.pt-pairs')).toBeNull()
  })

  it('有未命中行时第二行显示“⚠ x/y · n 行待核对”，对照行四重标记', () => {
    show()
    const card = cardOf('红宝石戒指')
    expect(within(card).getByText('2/3 · 1 行待核对').closest('.pt-nameplate__warn')).not.toBeNull()
    expect(within(card).getAllByLabelText('未命中')).toHaveLength(2)
    expect(within(card).getByText('未命中 · 保留原文')).toBeDefined()
  })

  it('“导出时保留英文原行”开启时第二行加“双语”标签', () => {
    showWith(true)
    expect(within(cardOf('炎种长杖')).getByText('双语').className).toBe('pt-nameplate__tag')
  })

  it('视觉隐藏的列说明替代原列头', () => {
    const { container } = show()
    expect(screen.getByText('对照分两栏：左栏原文（英文），右栏译文（简体中文）').className).toBe(
      'visually-hidden',
    )
    expect(container.querySelector('.preview-columns')).toBeNull()
  })
})

describe('译文视图的只读提示框（spec §6.4.4）', () => {
  it('装备页签换成提示框：名称牌提示框形态、属性行、分隔线与未命中标记；顶部说明在“；”后可断行', () => {
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
    expect(cardOf('炎种长杖').querySelector('.pt-tooltip__prop')?.textContent).toBe(
      '主手·适用等级 16–100',
    )
    expect(cardOf('稳步印记').querySelector('.pt-tooltip__prop')?.textContent).toBe('腰带·传奇')
    changeSection('技能')
    expect(container.querySelector('.pt-tooltips')).toBeNull()
  })
})

describe('名称回退、传奇基底与 collapsed（spec §6.4.3，B1、R9）', () => {
  it('名称英文回退：不渲染 Cinzel 英文名，未收录标记紧跟名称；名称类待核对时不显示 ✓', () => {
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

  it('传奇装备的基底名在第二行挂首行锚点；未收录时译文视图按 N 聚焦属性行里的基底名元素', () => {
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
})
