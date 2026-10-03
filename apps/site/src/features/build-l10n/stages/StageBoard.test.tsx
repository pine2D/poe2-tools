import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../../../shared/dict/loadDict'
import { EXAMPLE_SERIES } from '../example'
import { buildFieldRows } from '../preview/fields'
import { type TranslatedFile, translateSource } from '../translate/runTranslation'
import { StageBoard } from './StageBoard'
import { groupSeries, type Series } from './stages'

const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}
const files: TranslatedFile[] = EXAMPLE_SERIES.map((item, i) => {
  const result = translateSource({ id: `e${i}`, name: item.name, text: item.text }, dict, {
    bilingual: false,
    annotateUniques: true,
  })
  if (!result.ok) throw new Error(result.error)
  return result.file
})
const fieldsById = new Map(files.map((file) => [file.id, buildFieldRows(file, false)] as const))

beforeAll(() => {
  // happy-dom 没有 scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function show(
  list: readonly Series[] = groupSeries(files),
  handlers = { onSeries: vi.fn(), onDownload: vi.fn(), onReview: vi.fn() },
) {
  const series = list[0]
  if (series === undefined) throw new Error('no series')
  render(
    <StageBoard
      series={series}
      allSeries={list}
      fieldsById={fieldsById}
      locale="zh-CN"
      bilingual={false}
      {...handlers}
    />,
  )
  return handlers
}
const cell = (name: RegExp) => screen.getByRole('button', { name })

describe('StageBoard', () => {
  it('一扇主区框、一个金属主按钮；标题是构筑名，三列按阶段排开', () => {
    show()
    expect(document.querySelectorAll('.pt-frame')).toHaveLength(1)
    expect(document.querySelectorAll('.pt-forge-btn')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '示例构筑（自造）' })).toBeDefined()
    const heads = screen
      .getAllByRole('columnheader')
      .map((th) => th.querySelector('.stageboard__stage-name')?.textContent)
    expect(heads).toEqual(['1–30 级', '31–60 级', '终局'])
    expect(screen.getByRole('button', { name: '打包下载 3 个阶段' })).toBeDefined()
  })

  it('换装标记：腰带第二阶段“新”，戒指 2 终局“换”，主手第二阶段“改”，第一阶段腰带为空', () => {
    show()
    expect(cell(/^31–60 级 · 腰带：稳步印记（本阶段新增）/).textContent).toContain('新')
    expect(cell(/^终局 · 戒指 2：Sapphire Ring（换了另一件），有待核对$/).className).toContain(
      'stageboard__cell--miss',
    )
    expect(
      cell(/^31–60 级 · 主手：炎种长杖（词缀有变化）$/).querySelector('.stageboard__mark'),
    ).toBeNull()
    expect(cell(/^31–60 级 · 主手/).closest('td')?.dataset.change).toBe('modded')
    const belt = screen.getByRole('rowheader', { name: '腰带' }).closest('tr') as HTMLElement
    expect(within(belt).getAllByRole('cell')[0]?.textContent).toBe('—本阶段无')
  })

  it('列头给出天赋点数与待核对数，并能进入逐项核对', () => {
    const handlers = show()
    const last = document.querySelectorAll('.stageboard__stage-info')[2] as HTMLElement
    expect(last.textContent).toContain('天赋 5 点')
    expect(last.textContent).toContain('待核对')
    fireEvent.click(within(last).getByRole('button', { name: '逐项核对 终局' }))
    expect(handlers.onReview).toHaveBeenCalledWith('e2')
    expect(screen.getAllByRole('columnheader')[2]?.textContent).toBe('终局')
  })

  it('天赋按名称合并计数', () => {
    show()
    const row = screen.getByRole('rowheader', { name: '构成' }).closest('tr') as HTMLElement
    expect(within(row).getAllByRole('cell')[2]?.textContent).toContain('力量×3')
  })

  it('点格子在该行下方展开名称牌与对照，标题获得焦点；收起后焦点回到格子', () => {
    show()
    const button = cell(/^31–60 级 · 主手：炎种长杖/)
    fireEvent.click(button)
    const detail = document.getElementById('stage-detail') as HTMLElement
    expect(detail).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(detail.closest('tr')?.previousElementSibling?.contains(button)).toBe(true)
    const title = within(detail).getByRole('heading', { level: 3, name: '31–60 级 · 主手' })
    expect(document.activeElement).toBe(title)
    expect(detail.querySelector('.pt-nameplate')).not.toBeNull()
    fireEvent.click(within(detail).getByRole('button', { name: '收起详情' }))
    expect(document.getElementById('stage-detail')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('宝石格子展开技能卡', () => {
    show()
    fireEvent.click(cell(/^31–60 级 · 烈焰冲击：辅助 1/))
    expect(document.getElementById('stage-detail')?.textContent).toContain('深思施法')
  })

  it('只有一个构筑时不显示切换；多个构筑时可切换', () => {
    show()
    expect(screen.queryByRole('radiogroup', { name: '切换构筑' })).toBeNull()
    cleanup()
    const other = translateSource(
      {
        id: 'o',
        name: 'o.build',
        text: JSON.stringify({ name: 'Solo - Other', link: 'https://example.invalid/o' }),
      },
      dict,
      { bilingual: false, annotateUniques: true },
    )
    if (!other.ok) throw new Error(other.error)
    fieldsById.set('o', buildFieldRows(other.file, false))
    const handlers = show(groupSeries([...files, other.file]))
    const group = screen.getByRole('radiogroup', { name: '切换构筑' })
    fireEvent.click(within(group).getByLabelText('Solo - Other'))
    expect(handlers.onSeries).toHaveBeenCalledWith('link:https://example.invalid/o')
  })

  it('单阶段时下载按钮写文件名', () => {
    const [series] = groupSeries([files[0] as TranslatedFile])
    if (series === undefined) throw new Error('no series')
    show([series])
    expect(screen.getByRole('button', { name: '下载 example-1.build' })).toBeDefined()
  })
})
