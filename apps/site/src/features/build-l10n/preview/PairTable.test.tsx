import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { splitMarkupLines } from './markup'
import { PairTable } from './PairTable'
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
  injected: null,
  locale: 'zh-CN' as const,
  bilingual: false,
}

describe('PairTable', () => {
  it('每条编号行一行，序号 / 原文 / 中文各占一格，命中行安静', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
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
    // 左右两个序号格都写标号，所以是 2 个而不是 1 个
    expect(screen.getAllByText('1')).toHaveLength(2)
    // 一条编号行恰好填满四列：序号 / 原文 / 序号 / 译文，多一格少一格都会让整张卡错位
    expect(container.querySelectorAll('.tip__n, .tip__t')).toHaveLength(4)
    // MarkupText 会把 "+10" 单独包成 <span class="num">，正文因此不再是一个整体文本节点，
    // getByText 的 getNodeText() 只看直接子文本节点，这里必须用 textContent 比对
    expect(container.textContent).toContain('+10 to maximum Life')
    expect(container.textContent).toContain('+10 生命上限')
    expect(container.querySelectorAll('.num').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('未命中')).toBeNull()
    expect(screen.queryByText('原样')).toBeNull()
  })

  it('基底名行只占「两个跨列单元」，没有序号格，四列网格不错位', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
        rows={[
          row({
            index: 0,
            kind: 'name',
            base: true,
            en: spans('Pyrophyte Staff'),
            zh: spans('炎种长杖'),
          }),
          row({ index: 1, marker: '1' }),
        ]}
      />,
    )
    // 只有第 2 行（编号行）产生序号格，基底名那行一个都没有
    expect(container.querySelectorAll('.tip__n')).toHaveLength(2)
    expect(container.querySelectorAll('.tip__base')).toHaveLength(2)
    expect(screen.getByText('Pyrophyte Staff')).toBeDefined()
    expect(screen.getByText('炎种长杖')).toBeDefined()
  })

  it('未命中：左右两列都标出来，序号变叹号，行尾有文字签，带可跳转的 DOM id', () => {
    render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
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
    expect(screen.getAllByLabelText('未命中')).toHaveLength(2)
    expect(screen.getAllByText('!')).toHaveLength(2)
    expect(screen.getByText('未命中 · 保留英文')).toBeDefined()
    expect(document.getElementById('line-inventory-slots-3-additional-text-3')).not.toBeNull()
  })

  it('混合字段里，非首行的 kept 标"原样"，不算未命中', () => {
    render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
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
    expect(screen.getByText('原样')).toBeDefined()
    expect(screen.queryByLabelText('未命中')).toBeNull()
    expect(document.querySelector('.tip__t--zh')).not.toBeNull()
  })

  it('基底名没命中词典时算未命中，不许伪装成"原样"', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
        rows={[
          row({
            index: 0,
            kind: 'name',
            status: 'kept',
            base: true,
            en: spans('Weird Base'),
            zh: spans('Weird Base'),
          }),
        ]}
      />,
    )
    // I-1：基底名未收录与编号行真未命中的文案与 aria-label 分开措辞，不能混用「未命中」
    expect(screen.getAllByLabelText('基底名未收录')).toHaveLength(2)
    expect(screen.getByText('基底名未收录')).toBeDefined()
    expect(screen.queryByLabelText('未命中')).toBeNull()
    expect(container.querySelector('.tip--solo')).toBeNull()
  })

  // 整段 kept 的构筑说明：两条都不是编号行、都没未命中，正是退化分支的靶子
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

  it('整段都是原样时退化成单列：没有列头、没有序号格、没有右列重复（I-2）', () => {
    const { container } = render(
      <PairTable
        {...common}
        path="description"
        baseName={false}
        emptyText="没有构筑说明"
        rows={notes}
      />,
    )
    expect(container.querySelector('.tip--solo')).not.toBeNull()
    // 一行一格，没有序号格、没有列头、没有译文格
    expect(container.querySelectorAll('.tip__t--solo')).toHaveLength(2)
    expect(container.querySelectorAll('.tip__n')).toHaveLength(0)
    expect(container.querySelectorAll('.tip__lab')).toHaveLength(0)
    expect(container.querySelectorAll('.tip__t--zh')).toHaveLength(0)
    // 原文只出现一次，不再左右逐字重复
    expect(screen.getAllByText('Leveling notes')).toHaveLength(1)
    // 状态仍然可见，且整块只挂一枚标签（挂在最后一行行尾）
    expect(screen.getAllByText('原样')).toHaveLength(1)
    // 行 id 照旧，且带 tabIndex={-1}：跳转靠它转移焦点，光有 id 只能滚动
    expect(document.getElementById('line-description-1')?.getAttribute('tabindex')).toBe('-1')
    // 整行 lang="en" 是给英文原文用的，"原样"标签是中文，不能被外层语言标注带偏（M-4）
    expect(document.getElementById('line-description-1')?.getAttribute('lang')).toBe('en')
    expect(container.querySelector('.tip__tag--keep')?.getAttribute('lang')).toBe('zh-CN')
  })

  it('双语模式不退化：右列挂着保留的英文原行，不是逐字重复', () => {
    const { container } = render(
      <PairTable
        {...common}
        bilingual
        path="description"
        baseName={false}
        emptyText="没有构筑说明"
        rows={notes}
      />,
    )
    expect(container.querySelector('.tip--solo')).toBeNull()
    expect(document.querySelector('.tip__t--zh')).not.toBeNull()
  })

  it('双语保留的英文原行挂在同一行里，行数不多一行', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
        rows={[row({ index: 1, marker: '1', kept: [spans('+10 to maximum Life')] })]}
      />,
    )
    expect(container.querySelectorAll('.tip__n')).toHaveLength(2) // 左右各一个序号格
    expect(screen.getByText('原文')).toBeDefined()
    expect(container.querySelectorAll('.tip__keep')).toHaveLength(1)
    expect(container.querySelector('.tip__keep')?.textContent).toContain('+10 to maximum Life')
  })

  it('只有传奇名注入时紧凑显示导出备注，无空原文列', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
        injected={spans('稳步印记')}
        rows={[]}
      />,
    )
    expect(screen.getByText('稳步印记')).toBeDefined()
    expect(screen.getByText('传奇名注入')).toBeDefined()
    expect(container.querySelector('.tip--injected')?.getAttribute('lang')).toBe('zh-CN')
    expect(screen.getByText('导出备注')).toBeDefined()
    expect(container.querySelectorAll('.tip__base')).toHaveLength(0)
    expect(container.querySelectorAll('.tip__n, .tip__t')).toHaveLength(0)
  })

  it('一行都没有时给一句人话，不是一张空面板', () => {
    render(<PairTable {...common} baseName emptyText="这个槽位没有备注" rows={[]} />)
    expect(screen.getByText('这个槽位没有备注')).toBeDefined()
  })

  it('原样的英文格不挂零样式的 keep 类，命中行的序号格不进焦点（M-3 / M-4）', () => {
    const { container } = render(
      <PairTable
        {...common}
        baseName
        emptyText="这个槽位没有备注"
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
    const keeps = [...container.querySelectorAll('.tip__t--keep')]
    expect(keeps).toHaveLength(1)
    expect(keeps[0]?.classList.contains('tip__t--zh')).toBe(true)
    // 命中行的序号格是 aria-hidden 的装饰，不该同时可聚焦
    for (const cell of container.querySelectorAll('[aria-hidden="true"]')) {
      expect(cell.getAttribute('tabindex')).toBeNull()
    }
  })

  it('繁体目标语言时译文列标 lang=zh-TW，列头也跟着变', () => {
    const { container } = render(
      <PairTable
        {...common}
        locale="zh-TW"
        baseName
        emptyText="這個槽位沒有備註"
        rows={[row({ index: 1, marker: '1', zh: spans('生命上限') })]}
      />,
    )
    expect(container.querySelector('.tip__lab')).toBeNull()
    expect(container.querySelector('.tip__t--zh')?.getAttribute('lang')).toBe('zh-TW')
  })
})
