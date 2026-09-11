import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { type TranslatedFile, translateSource } from '../translate/runTranslation'
import { buildFieldRows } from './fields'
import { Preview } from './Preview'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/fixtures/synthetic')}/`
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

describe('Preview 概览卡', () => {
  it('覆盖率是一个大数字 + 分数 + 一条轨', () => {
    const { container } = show()
    expect(screen.getByRole('heading', { level: 2, name: '概览' })).toBeDefined()
    // `<p class="cov__num">{88}<small>%</small></p>`：Testing Library 的 getNodeText()
    // 只取元素的**直接**文本子节点，所以这个 <p> 的可匹配文本是 "88"，`%` 属于 <small>。
    // 写 '88%' 永远匹配不到。整串要看 textContent。
    expect(screen.getByText('88')).toBeDefined()
    expect(container.querySelector('.cov__num')?.textContent).toBe('88%')
    expect(screen.getByText('命中 7 / 8 条编号行')).toBeDefined()
    expect(
      screen.getByRole('group', { name: '共 8 条编号行，命中 7 条，未命中 1 条' }),
    ).toBeDefined()
    expect(container.querySelectorAll('.meter__cell')).toHaveLength(8)
  })

  it('构筑名、升华、文件名各占一行', () => {
    show()
    expect(screen.getByText('Synthetic Rich - 0.5.5')).toBeDefined()
    expect(screen.getByText('魔巫 · 瓦拉煞的门徒')).toBeDefined()
    expect(screen.getByText('rich.build')).toBeDefined()
  })

  it('未命中清单是人话定位，不是 JSON 路径', () => {
    show()
    expect(screen.getByText('1 处未命中')).toBeDefined()
    expect(screen.getByText('戒指 2 · 第 3 行')).toBeDefined()
    expect(screen.queryByText('inventory_slots[3].additional_text')).toBeNull()
  })

  it('点「定位」滚到那一行并把焦点放过去', () => {
    const scroll = stubScroll()
    show()
    fireEvent.click(screen.getByRole('button', { name: '定位到 戒指 2 · 第 3 行' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
  })

  it('「跳到第一处」也能纯键盘走通', () => {
    const scroll = stubScroll()
    show()
    const jump = screen.getByRole('button', { name: '跳到第一处未命中' })
    fireEvent.click(jump)
    expect(scroll).toHaveBeenCalled()
  })

  it('概览卡顶部就是下载入口，并写清楚下载完该干什么', () => {
    const onDownload = vi.fn()
    render(
      <Preview
        file={file}
        fields={fields}
        locale="zh-CN"
        bilingual={false}
        onDownload={onDownload}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '下载 rich.build' }))
    expect(onDownload).toHaveBeenCalled()
    expect(screen.getByText('放进 Build Planner 目录，同名替换即可')).toBeDefined()
  })
})

describe('Preview 卡片', () => {
  it('槽位卡头三段式：中文槽位名 + inventory_id + 编号行计数', () => {
    show()
    expect(screen.getByText('主手')).toBeDefined()
    expect(screen.getByText('Weapon1')).toBeDefined()
    expect(screen.getByText('3 / 3')).toBeDefined()
    // 戒指 2 有一条没命中
    expect(screen.getByText('2 / 3')).toBeDefined()
    expect(screen.getByText('Ring2')).toBeDefined()
  })

  it('宝石卡头右端补 level_interval，与槽位卡的 inventory_id 位置对称', () => {
    show()
    // rich.build 的 skills[0].level_interval 是 [52, 100]
    expect(screen.getByText('Lv 52–100')).toBeDefined()
  })

  it('传奇槽位命中词典：卡头显示英文名与中文译名，卡体仍保留传奇名注入行（C-1）', () => {
    const { container } = show()
    expect(screen.getByText('腰带')).toBeDefined()
    expect(screen.getByText('传奇')).toBeDefined()
    const head = container.querySelector('.card--unique .card__head')
    expect(head?.querySelector('.namepair__en')?.textContent).toBe('Surefooted Sigil')
    expect(head?.querySelector('.namepair__zh')?.textContent).toBe('稳步印记')
    expect(head?.querySelector('.namepair__zh--miss')).toBeNull()
    // 卡体「传奇名注入」的既有逻辑不受影响；中文译名因此在卡头与卡体各出现一次
    expect(screen.getByText('传奇名注入')).toBeDefined()
    expect(screen.getAllByText('稳步印记')).toHaveLength(2)
  })

  it('传奇槽位未命中词典：卡头保留英文名并标出未命中，不吞掉这条信息（C-1）', () => {
    const missText = JSON.stringify({
      name: 'Unique Miss',
      inventory_slots: [
        {
          inventory_id: 'Belt1',
          unique_name: 'Totally Unknown Unique Item',
          slot_x: 0,
          slot_y: 0,
        },
      ],
    })
    const missResult = translateSource(
      { id: 'f2', name: 'uniq-miss.build', text: missText },
      dict,
      { bilingual: false, annotateUniques: true },
    )
    if (!missResult.ok) throw new Error(missResult.error)
    const { container } = render(
      <Preview
        file={missResult.file}
        fields={buildFieldRows(missResult.file, false)}
        locale="zh-CN"
        bilingual={false}
        onDownload={vi.fn()}
      />,
    )
    const head = container.querySelector('.card--unique .card__head')
    expect(head?.querySelector('.namepair__en')?.textContent).toBe('Totally Unknown Unique Item')
    expect(head?.querySelector('.namepair__zh--miss')?.textContent).toBe('未命中')
    expect(screen.getByLabelText('未命中')).toBeDefined()
    // 未命中不进覆盖率分母（口径不变，只统计编号行），卡体 emptyText 也保留
    expect(container.querySelector('.tip--empty')?.textContent).toBe('这个槽位没有备注')
  })

  it('未命中行左右两列都标出来，命中行安静', () => {
    const { container } = show()
    const missed = screen.getAllByLabelText('未命中')
    expect(missed).toHaveLength(2)
    expect(screen.getByText('未命中 · 保留英文')).toBeDefined()
    // "149%" 被 MarkupText 单独包进 <span class="num">，正文不再是一个整体文本节点，
    // 所以这里比 textContent 而不是 getByText
    expect(container.textContent).toContain('法术伤害提高 149%')
  })

  it('标记语法还原成颜色，跨行标记不破坏对齐', () => {
    const { container } = show()
    expect(screen.getByText('任意魔符')).toBeDefined()
    expect(container.querySelectorAll('.mk-grey').length).toBeGreaterThan(0)
    // passives[1] 是 `<m>{<red>{Strength +5 is needed here}}`，整段 kept，
    // Task 1 起退化成单列，只渲染原文一份，所以是 1 个而不是 2 个
    expect(container.querySelectorAll('.mk-red')).toHaveLength(1)
    // 数值高亮跟着标记一起生效
    expect(container.querySelector('.mk-red .num')?.textContent).toBe('+5')
  })

  it('宝石与天赋：命中显示中文，未命中显示 id，没备注的显式说一句', () => {
    show()
    expect(screen.getByText('烈焰冲击')).toBeDefined()
    expect(screen.getByText('深思施法')).toBeDefined()
    expect(screen.getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo')).toBeDefined()
    expect(screen.getByText('力量')).toBeDefined()
    expect(screen.getAllByText('attributes30_')).toHaveLength(2)
    expect(screen.getAllByText('这个宝石没有备注').length).toBeGreaterThan(0)
  })

  it('整段原样的字段退化成单列，构筑说明不再左右逐字重复（I-2）', () => {
    const { container } = show()
    expect(container.querySelectorAll('.tip--solo').length).toBeGreaterThan(0)
    // rich.build 的 description 是 `<l>{<gold>{Leveling notes}}` + 一行说明，整段 kept
    expect(screen.getAllByText('Leveling notes')).toHaveLength(1)
    // 混合字段（魔符卡：既有 kept 又有命中的编号行）不退化，列头照旧在
    expect(screen.getAllByText('原文 · EN').length).toBeGreaterThan(0)
  })

  it('天赋行是「名字 | 备注」两列：一个 li 里正好两个直接子元素，名字在前（I-3）', () => {
    const { container } = show()
    const items = [...container.querySelectorAll('.passives > li')]
    expect(items).toHaveLength(3)
    for (const li of items) {
      const kids = [...li.children]
      // 两列 grid 依赖「每个 li 恰好两个直接子元素」：多包一层 div 或少给一个备注格，
      // 名字与备注就会落到同一列里，整个天赋区退回堆叠
      expect(kids).toHaveLength(2)
      expect(kids[0]?.classList.contains('namepair')).toBe(true)
      expect(kids[1]?.classList.contains('tip')).toBe(true)
    }
  })

  it('区块眉标与中文标题成对出现', () => {
    show()
    expect(screen.getByText('Overview')).toBeDefined()
    expect(screen.getByText('Gear')).toBeDefined()
    expect(screen.getByText('Gems')).toBeDefined()
    expect(screen.getByText('Passives')).toBeDefined()
    expect(screen.getByRole('heading', { level: 2, name: '槽位' })).toBeDefined()
  })
})

// 一份「一条未命中都没有」的文件：筛选开关禁用，F 键也必须跟着不生效（Task 5 会验后半句）。
// 拆成模块级常量而不是每次现算：Task 7 的「归零那一帧」探针要把同一份 file 当作新 prop 传进去。
const cleanResult = translateSource(
  {
    id: 'f3',
    name: 'clean.build',
    text: JSON.stringify({
      name: 'All Hit',
      inventory_slots: [
        {
          inventory_id: 'Weapon1',
          slot_x: 0,
          slot_y: 0,
          additional_text: 'Pyrophyte Staff\n1. 149% increased Spell Damage',
        },
      ],
    }),
  },
  dict,
  { bilingual: false, annotateUniques: true },
)
if (!cleanResult.ok) throw new Error(cleanResult.error)
const allHitFile = cleanResult.file

function showAllHit() {
  return render(
    <Preview
      file={allHitFile}
      fields={buildFieldRows(allHitFile, false)}
      locale="zh-CN"
      bilingual={false}
      onDownload={vi.fn()}
    />,
  )
}

describe('Preview 仅看未命中', () => {
  it('默认不筛选；开关有 aria-pressed 与键位声明', () => {
    show()
    const toggle = screen.getByRole('button', { name: '仅看未命中' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-keyshortcuts')).toBe('f')
    expect(screen.getByText('主手')).toBeDefined()
    // 再点一次关掉，卡片全部回来
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('主手')).toBeDefined()
  })

  it('开启后只留有未命中的卡，其余整块隐藏，空区给一句话', () => {
    const { container } = show()
    const counts = () => [...container.querySelectorAll('.sec__count')].map((n) => n.textContent)
    const before = counts()
    fireEvent.click(screen.getByRole('button', { name: '仅看未命中' }))
    // rich.build 唯一的未命中在「戒指 2」
    expect(screen.getByText('戒指 2')).toBeDefined()
    expect(screen.queryByText('主手')).toBeNull()
    // 宝石与天赋两区一条未命中都没有
    expect(screen.getAllByText('这一区没有未命中').length).toBeGreaterThan(0)
    // 概览卡本身不受筛选影响，覆盖率与清单照旧
    expect(screen.getByText('命中 7 / 8 条编号行')).toBeDefined()
    expect(screen.getByText('戒指 2 · 第 3 行')).toBeDefined()
    // 区块计数读作「这份构筑有几个槽位 / 宝石 / 天赋」，不随筛选变化（口径见 Step 8(e)）
    expect(counts()).toEqual(before)
  })

  it('一条未命中都没有的文件：开关禁用，点不动', () => {
    showAllHit()
    expect((screen.getByRole('button', { name: '仅看未命中' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  // P-1：构筑说明卡此前的显示条件是「没开筛选」，开着筛选时它一律消失。未命中若正好落在
  // 构筑说明里，清单的「定位」、「跳到第一处」与 N 键的目标行就都不在 DOM 里，跳转静默失败。
  it('未命中只在构筑说明里时，筛选仍留着这张卡，不然定位与 N 键都够不着', () => {
    const text = JSON.stringify({
      name: 'Desc Miss',
      description: 'Leveling notes\n1. Utterly Unknown Affix Line',
    })
    const descOnly = translateSource({ id: 'f4', name: 'desc.build', text }, dict, {
      bilingual: false,
      annotateUniques: true,
    })
    if (!descOnly.ok) throw new Error(descOnly.error)
    render(
      <Preview
        file={descOnly.file}
        fields={buildFieldRows(descOnly.file, false)}
        locale="zh-CN"
        bilingual={false}
        onDownload={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '仅看未命中' }))
    expect(screen.getByRole('heading', { level: 3, name: '构筑说明' })).toBeDefined()
    // 槽位 / 宝石 / 天赋三区都空，各说一句「这一区没有未命中」而不是「没有装备槽位」
    expect(screen.getAllByText('这一区没有未命中')).toHaveLength(3)
  })
})

describe('Preview 快捷键', () => {
  it('N 依次跳到每一处未命中，跳完回到第一处', () => {
    const scroll = stubScroll()
    show()
    fireEvent.keyDown(window, { key: 'n' })
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
    // rich.build 只有一处未命中，再按一次还是它（取模回绕，不会卡住）
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement?.id).toBe('line-inventory-slots-3-additional-text-3')
  })

  it('F 切换筛选，与按钮同一个开关', () => {
    show()
    const toggle = screen.getByRole('button', { name: '仅看未命中' })
    fireEvent.keyDown(window, { key: 'f' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(window, { key: 'f' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('全命中的文件按 F 不清空主区：开关本来就是禁用的，快捷键不能绕过它', () => {
    showAllHit()
    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByRole('button', { name: '仅看未命中' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(screen.getByText('主手')).toBeDefined()
  })

  it('键位在界面上写着，不是只有知道的人才会用', () => {
    show()
    expect(screen.getByText('跳下一处未命中')).toBeDefined()
    expect(screen.getByText('仅看未命中', { selector: '.cov__keys span' })).toBeDefined()
    const keys = screen.getAllByText(/^[NF]$/)
    expect(keys.map((node) => node.tagName)).toEqual(['KBD', 'KBD'])
  })

  // 全命中的文件里 N 没有可跳的目标、F 的开关又正是禁用的：两枚键位提示都指向空动作。
  // 与同一张卡上「编号行全部命中」取同一个判据，整条提示随未命中清单一起消失。
  it('一条未命中都没有时，键位提示整条不出现', () => {
    expect(showAllHit().container.querySelector('.cov__keys')).toBeNull()
    cleanup()
    expect(show().container.querySelector('.cov__keys')).not.toBeNull()
  })
})

describe('Preview 筛选归零', () => {
  // useMissFilter 的自动复位住在 useEffect 里，而三区的过滤是渲染期按 filter.only 算的：
  // 筛选开着时换一份全命中的文件，复位 effect 之前有整整一帧「三区全是这一区没有未命中」。
  // 父组件的 useLayoutEffect 恰好排在子组件的 passive effect 之前，用它当探针就看得见那一帧。
  it('换成全命中的文件时不闪一帧空屏', () => {
    const frames: string[] = []
    function Probe({ shown }: { shown: TranslatedFile }) {
      useLayoutEffect(() => {
        frames.push(document.body.textContent ?? '')
      })
      return (
        <Preview
          file={shown}
          fields={buildFieldRows(shown, false)}
          locale="zh-CN"
          bilingual={false}
          onDownload={vi.fn()}
        />
      )
    }
    const { rerender } = render(<Probe shown={file} />)
    fireEvent.click(screen.getByRole('button', { name: '仅看未命中' }))
    frames.length = 0
    rerender(<Probe shown={allHitFile} />)
    expect(frames).not.toHaveLength(0)
    expect(frames.some((text) => text.includes('这一区没有未命中'))).toBe(false)
    expect(screen.getByText('主手')).toBeDefined()
  })
})
