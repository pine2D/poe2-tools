import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { splitMarkupLines } from './markup'
import { PairTable, pairCaption } from './PairTable'
import type { PairRow } from './rows'

afterEach(() => {
  cleanup()
})

function spans(raw: string) {
  const [line = []] = splitMarkupLines(raw)
  return line
}

const row = (over: Partial<PairRow>): PairRow => ({
  index: 0,
  marker: null,
  kind: 'mod',
  status: 'translated',
  base: false,
  en: spans('en'),
  zh: spans('中'),
  kept: [],
  ...over,
})

const common = {
  path: 'inventory_slots[3].additional_text',
  locale: 'zh-CN' as const,
  bilingual: false,
}

describe('PairTable（spec §5.11）', () => {
  it('一条编号行是一个 li：编号 / 原文 / 中文三格，数值带 pt-num', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        rows={[
          row({
            index: 1,
            marker: '1',
            en: spans('+10 to maximum Life'),
            zh: spans('+10 生命上限'),
          }),
        ]}
      />,
    )
    expect(container.querySelector('ol')?.className).toBe('pt-pairs')
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(1)
    expect(items[0]?.className).toBe('pt-pair')
    expect([...(items[0]?.children ?? [])].map((cell) => cell.className)).toEqual([
      'pt-pair__no',
      'pt-pair__en',
      'pt-pair__zh',
    ])
    expect(screen.getAllByText('1')).toHaveLength(1)
    expect(container.querySelector('.pt-pair__en')?.textContent).toBe('+10 to maximum Life')
    expect(container.querySelector('.pt-pair__zh')?.textContent).toBe('+10 生命上限')
    expect(container.querySelector('.pt-pair__zh .pt-num')?.textContent).toBe('+10')
    expect(screen.queryByLabelText('未命中')).toBeNull()
    expect(screen.queryByText('原样')).toBeNull()
  })

  it('中英对照视图的锚点挂在编号格上（契约 C12），不挂在 li 上', () => {
    const { container } = render(
      <PairTable {...common} baseName rows={[row({ index: 2, marker: '2' })]} />,
    )
    const anchor = document.getElementById('line-inventory-slots-3-additional-text-2')
    expect(anchor?.className).toBe('pt-pair__no')
    expect(anchor?.getAttribute('tabindex')).toBe('-1')
    expect(container.querySelector('li')?.hasAttribute('id')).toBe(false)
  })

  it('不渲染字段首行的基底名行与传奇名注入行（已移进名称牌，spec §6.4.3）', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        rows={[
          row({
            index: 0,
            kind: 'name',
            base: true,
            en: spans('Pyrophyte Staff'),
            zh: spans('耐火长杖'),
          }),
          row({ index: 1, marker: '1' }),
        ]}
      />,
    )
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(screen.queryByText('Pyrophyte Staff')).toBeNull()
    expect(screen.queryByText('耐火长杖')).toBeNull()
    expect(screen.queryByText('传奇名注入')).toBeNull()
    expect(document.getElementById('line-inventory-slots-3-additional-text-0')).toBeNull()
  })

  it('只有基底名行时什么都不渲染', () => {
    const { container } = render(
      <PairTable {...common} baseName rows={[row({ index: 0, kind: 'name', base: true })]} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('未命中：底色行、编号换“!”、右栏原文后接“未命中 · 保留原文”，两处 role=note', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        rows={[
          row({
            index: 3,
            marker: '3',
            status: 'untranslated',
            en: spans('3% increased Attack Speed per 25 Dexterity'),
            zh: spans('3% increased Attack Speed per 25 Dexterity'),
          }),
        ]}
      />,
    )
    expect(container.querySelector('li')?.className).toBe('pt-pair pt-pair--miss')
    expect(screen.getAllByText('!')).toHaveLength(1)
    expect(screen.getAllByLabelText('未命中')).toHaveLength(2)
    expect(screen.getByText('未命中 · 保留原文').className).toBe('pt-tag-miss')
    expect(screen.getByText('未命中 · 保留原文').querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('未命中 · 保留英文')).toBeNull()
    expect(container.querySelector('.pt-pair__zh')?.getAttribute('lang')).toBe('en')
    expect(container.querySelector('.pt-pair__kept')?.textContent).toBe(
      '3% increased Attack Speed per 25 Dexterity',
    )
    expect(document.getElementById('line-inventory-slots-3-additional-text-3')?.textContent).toBe(
      '!',
    )
  })

  it('混合字段里非首行的原样行标“原样”，不算未命中', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        rows={[
          row({ index: 1, marker: '1' }),
          row({
            index: 2,
            kind: 'name',
            status: 'kept',
            en: spans('Stat Priority'),
            zh: spans('Stat Priority'),
          }),
        ]}
      />,
    )
    expect(screen.getByText('原样').className).toBe('pt-pair-tag')
    expect(screen.queryByLabelText('未命中')).toBeNull()
    const kept = container.querySelectorAll('.pt-pair__kept')
    expect(kept).toHaveLength(1)
    expect(kept[0]?.parentElement?.className).toBe('pt-pair__zh')
  })

  // 整段原样的构筑说明：baseName=false，首行不当基底名，正是退化分支的靶子
  const notes: PairRow[] = [
    row({
      index: 0,
      kind: 'name',
      status: 'kept',
      base: true,
      en: spans('Leveling notes'),
      zh: spans('Leveling notes'),
    }),
    row({
      index: 1,
      kind: 'name',
      status: 'kept',
      en: spans('Use any staff until Act 3.'),
      zh: spans('Use any staff until Act 3.'),
    }),
  ]

  it('整段都是原样时退化成单栏 solo：不留编号列、原文只出现一次、锚点挂在文本格', () => {
    const { container } = render(
      <PairTable {...common} path="description" baseName={false} rows={notes} />,
    )
    expect(container.querySelectorAll('.pt-pair--solo')).toHaveLength(2)
    expect(container.querySelectorAll('.pt-pair__no')).toHaveLength(0)
    expect(container.querySelectorAll('.pt-pair__zh')).toHaveLength(0)
    expect(screen.getAllByText('Leveling notes')).toHaveLength(1)
    expect(screen.getAllByText('原样')).toHaveLength(1)
    const anchor = document.getElementById('line-description-1')
    expect(anchor?.className).toBe('pt-pair__text')
    expect(anchor?.getAttribute('tabindex')).toBe('-1')
    expect(anchor?.getAttribute('lang')).toBe('en')
    expect(container.querySelector('.pt-pair-tag')?.getAttribute('lang')).toBe('zh-CN')
  })

  it('双语模式不退化，保留的英文原行挂在同一行里并标“原文”', () => {
    const { container } = render(
      <PairTable
        {...common}
        bilingual
        baseName
        rows={[row({ index: 1, marker: '1', kept: [spans('+10 to maximum Life')] })]}
      />,
    )
    expect(container.querySelector('.pt-pair--solo')).toBeNull()
    expect(container.querySelectorAll('li')).toHaveLength(1)
    const orig = container.querySelectorAll('.app__pair-orig')
    expect(orig).toHaveLength(1)
    expect(orig[0]?.textContent).toBe('+10 to maximum Life原文')
    expect(orig[0]?.getAttribute('lang')).toBe('en')
  })

  it('译文视图只隐藏原文列：锚点挂在中文格，编号格 aria-hidden 且不可聚焦', () => {
    const { container } = render(
      <PairTable {...common} baseName view="translated" rows={[row({ index: 1, marker: '1' })]} />,
    )
    expect(container.querySelector('ol')?.className).toBe('pt-pairs pt-pairs--translated')
    expect(container.querySelector('.pt-pair__en')).toBeNull()
    const anchor = document.getElementById('line-inventory-slots-3-additional-text-1')
    expect(anchor?.className).toBe('pt-pair__zh')
    expect(anchor?.getAttribute('tabindex')).toBe('-1')
    for (const cell of container.querySelectorAll('[aria-hidden="true"]')) {
      expect(cell.getAttribute('tabindex')).toBeNull()
    }
  })

  it('繁体目标语言时中文格标 lang=zh-TW', () => {
    const { container } = render(
      <PairTable {...common} locale="zh-TW" baseName rows={[row({ index: 1, marker: '1' })]} />,
    )
    expect(container.querySelector('.pt-pair__zh')?.getAttribute('lang')).toBe('zh-TW')
  })

  it('id 与 hidden 落在 ol 上（collapsed 折叠用）', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        id="slot-rows-2"
        hidden
        rows={[row({ index: 1, marker: '1' })]}
      />,
    )
    const list = container.querySelector('ol')
    expect(list?.id).toBe('slot-rows-2')
    expect(list?.hidden).toBe(true)
  })

  it('视觉隐藏的列说明随视图与语言变化', () => {
    expect(pairCaption('compare', 'zh-CN')).toBe(
      '对照分两栏：左栏原文（英文），右栏译文（简体中文）',
    )
    expect(pairCaption('compare', 'zh-TW')).toBe(
      '对照分两栏：左栏原文（英文），右栏译文（繁体中文）',
    )
    expect(pairCaption('translated', 'zh-CN')).toBe('仅显示译文（简体中文）')
  })
})
