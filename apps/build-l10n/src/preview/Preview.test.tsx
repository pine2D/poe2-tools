import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { translateSource } from '../translate/runTranslation'
import { fieldReport, missedLines, splitLines } from './lines'
import { Preview } from './Preview'

afterEach(() => {
  cleanup()
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

describe('lines 工具', () => {
  it('按路径取字段报告、未命中行号、分行', () => {
    const field = fieldReport(file.report, 'inventory_slots[3].additional_text')
    expect(field?.lines.length).toBe(4)
    expect([...missedLines(field)]).toEqual([3])
    expect(missedLines(undefined).size).toBe(0)
    expect(splitLines('a\nb')).toEqual(['a', 'b'])
    expect(splitLines(null)).toEqual([])
    expect(splitLines('')).toEqual([])
  })
})

describe('Preview', () => {
  it('概览：构筑名、升华、覆盖率、未命中清单', () => {
    render(<Preview file={file} />)
    expect(screen.getByText('Synthetic Rich - 0.5.5')).toBeDefined()
    expect(screen.getByText('魔巫 · 瓦拉煞的门徒')).toBeDefined()
    expect(screen.getByText('命中 7 / 8 条编号行（88%）')).toBeDefined()
    expect(screen.getByText('未命中（1）')).toBeDefined()
    expect(
      screen.getAllByText('3% increased Attack Speed per 25 Dexterity').length,
    ).toBeGreaterThan(0)
  })

  it('槽位：左英右中，未命中行高亮，传奇名注入', () => {
    render(<Preview file={file} />)
    expect(screen.getByText('主手')).toBeDefined()
    expect(screen.getAllByText('稳步印记').length).toBeGreaterThan(0)
    const missed = screen.getAllByLabelText('未命中')
    expect(missed).toHaveLength(1)
    expect(missed[0]?.textContent).toContain('per 25 Dexterity')
    expect(screen.getAllByText(/法术伤害提高 149%/).length).toBeGreaterThan(0)
  })

  it('宝石与天赋：命中显示中文，未命中显示 id', () => {
    render(<Preview file={file} />)
    expect(screen.getByText('烈焰冲击')).toBeDefined()
    expect(screen.getByText('深思施法')).toBeDefined()
    expect(screen.getByText('Metadata/Items/Gems/SupportGemSearingFlameTwo')).toBeDefined()
    expect(screen.getByText('力量')).toBeDefined()
    // 未命中的天赋左右两列都显示 id，恰好 2 处
    expect(screen.getAllByText('attributes30_')).toHaveLength(2)
  })
})
