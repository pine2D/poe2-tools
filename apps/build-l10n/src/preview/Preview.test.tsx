import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { translateSource } from '../translate/runTranslation'
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
    expect(screen.getAllByText('attributes30_')).toHaveLength(2)
    expect(container.querySelector('.mk-red .num')?.textContent).toBe('+5')
    expect(container.querySelectorAll('.passives > li')).toHaveLength(3)
  })

  it('传奇名称头部与注入行保留，编号词缀仍逐行对齐', () => {
    const { container } = show()
    expect(screen.getByText('Surefooted Sigil')).toBeDefined()
    expect(screen.getAllByText('稳步印记')).toHaveLength(2)
    expect(screen.getByText('传奇名注入')).toBeDefined()
    expect(screen.getByText('2 / 3')).toBeDefined()
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
    expect(document.activeElement?.className).toContain('tip__t--zh')
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
    expect(container.querySelectorAll('.tip--translated').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '下载 rich.build' }))
    expect(onDownload).toHaveBeenCalledOnce()
    expect(file.output).toBe(output)
    fireEvent.click(screen.getByRole('radio', { name: '中英对照' }))
    expect(container.querySelectorAll('.tip--translated')).toHaveLength(0)
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
