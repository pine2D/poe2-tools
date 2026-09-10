import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { translateSource } from '../translate/runTranslation'
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
  return render(<Preview file={file} locale="zh-CN" bilingual={false} onDownload={vi.fn()} />)
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
    render(<Preview file={file} locale="zh-CN" bilingual={false} onDownload={onDownload} />)
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
      <Preview file={missResult.file} locale="zh-CN" bilingual={false} onDownload={vi.fn()} />,
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
    // passives[1] 是 `<m>{<red>{Strength +5 is needed here}}`，状态 kept、译文与原文一字不差，
    // 所以原文格与译文格**各渲染一个** .mk-m.mk-red，一共 2 个
    expect(container.querySelectorAll('.mk-red')).toHaveLength(2)
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

  it('区块眉标与中文标题成对出现', () => {
    show()
    expect(screen.getByText('Overview')).toBeDefined()
    expect(screen.getByText('Gear')).toBeDefined()
    expect(screen.getByText('Gems')).toBeDefined()
    expect(screen.getByText('Passives')).toBeDefined()
    expect(screen.getByRole('heading', { level: 2, name: '槽位' })).toBeDefined()
  })
})
