import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { translateSource } from '../translate/runTranslation'
import { fieldReport } from './lines'
import { spanText } from './markup'
import { buildRows } from './rows'

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/fixtures/synthetic')}/`
const raw = readFileSync(`${fixtures}rich.build`, 'utf8')
const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}

function translate(bilingual: boolean) {
  const result = translateSource({ id: 'f1', name: 'rich.build', text: raw }, dict, {
    bilingual,
    annotateUniques: true,
  })
  if (!result.ok) throw new Error(result.error)
  return result.file
}

// 从原始 / 译文 JSON 里取某个槽位的 additional_text
function slotText(build: unknown, i: number): string | null {
  const slots = (build as { inventory_slots?: unknown }).inventory_slots
  if (!Array.isArray(slots)) return null
  const entry: unknown = slots[i]
  if (entry === null || typeof entry !== 'object') return null
  const text = (entry as { additional_text?: unknown }).additional_text
  return typeof text === 'string' ? text : null
}

describe('buildRows', () => {
  it('普通槽位：基底名行 + 三条编号行，左右一一对齐', () => {
    const file = translate(false)
    const { injected, rows } = buildRows({
      original: slotText(file.input, 0),
      translated: slotText(file.build, 0),
      field: fieldReport(file.report, 'inventory_slots[0].additional_text'),
      bilingual: false,
      uniqueText: null,
    })
    expect(injected).toBeNull()
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      index: 0,
      marker: null,
      kind: 'name',
      base: true,
      status: 'translated',
    })
    expect(spanText(rows[0]?.en ?? [])).toBe('Pyrophyte Staff')
    expect(spanText(rows[0]?.zh ?? [])).toBe('炎种长杖')
    expect(rows.map((row) => row.marker)).toEqual([null, '1', '2', '3'])
    expect(spanText(rows[1]?.en ?? [])).toBe('149% increased Spell Damage')
    expect(spanText(rows[1]?.zh ?? [])).toBe('法术伤害提高 149%')
    expect(rows.every((row) => row.kept.length === 0)).toBe(true)
  })

  it('未命中行：状态是 untranslated，译文格里还是英文原文', () => {
    const file = translate(false)
    const { rows } = buildRows({
      original: slotText(file.input, 3),
      translated: slotText(file.build, 3),
      field: fieldReport(file.report, 'inventory_slots[3].additional_text'),
      bilingual: false,
      uniqueText: null,
    })
    const miss = rows.filter((row) => row.status === 'untranslated')
    expect(miss).toHaveLength(1)
    expect(miss[0]?.index).toBe(3)
    expect(miss[0]?.marker).toBe('3')
    expect(spanText(miss[0]?.en ?? [])).toBe('3% increased Attack Speed per 25 Dexterity')
    expect(spanText(miss[0]?.zh ?? [])).toBe('3% increased Attack Speed per 25 Dexterity')
  })

  it('跨行标记与空行：空行不占一行，标记跨行不破坏对齐', () => {
    const file = translate(false)
    const { rows } = buildRows({
      original: slotText(file.input, 2),
      translated: slotText(file.build, 2),
      field: fieldReport(file.report, 'inventory_slots[2].additional_text'),
      bilingual: false,
      uniqueText: null,
    })
    // 源行 1 是空行，被滤掉；其余五行保留原始行号
    expect(rows.map((row) => row.index)).toEqual([0, 2, 3, 4, 5])
    expect(rows.map((row) => row.status)).toEqual([
      'translated',
      'kept',
      'kept',
      'translated',
      'translated',
    ])
    expect(spanText(rows[0]?.zh ?? [])).toBe('任意魔符')
    expect(spanText(rows[3]?.en ?? [])).toBe('+10 to maximum Life')
    expect(spanText(rows[3]?.zh ?? [])).toBe('+10 最大生命')
    // <grey> 横跨第 2–5 行，每一行都还带着这个标记
    expect(rows[1]?.en[0]?.tags).toEqual(['grey'])
    expect(rows[4]?.en[0]?.tags).toEqual(['grey'])
  })

  it('传奇名注入：译文首行是凭空多出来的，单独拿出来不参与逐行对齐', () => {
    const file = translate(false)
    const { injected, rows } = buildRows({
      original: slotText(file.input, 1),
      translated: slotText(file.build, 1),
      field: fieldReport(file.report, 'inventory_slots[1].additional_text'),
      bilingual: false,
      uniqueText: '稳步印记',
    })
    expect(spanText(injected ?? [])).toBe('稳步印记')
    expect(injected?.[0]?.tags).toEqual(['unique'])
    expect(rows).toHaveLength(0)
  })

  it('双语模式：保留的英文原行归属到本行，行数不错位', () => {
    const file = translate(true)
    const { rows } = buildRows({
      original: slotText(file.input, 0),
      translated: slotText(file.build, 0),
      field: fieldReport(file.report, 'inventory_slots[0].additional_text'),
      bilingual: true,
      uniqueText: null,
    })
    expect(rows).toHaveLength(4)
    expect(spanText(rows[0]?.zh ?? [])).toBe('炎种长杖')
    expect(rows[0]?.kept.map(spanText)).toEqual(['Pyrophyte Staff'])
    expect(spanText(rows[1]?.zh ?? [])).toBe('法术伤害提高 149%')
    expect(rows[1]?.kept.map(spanText)).toEqual(['149% increased Spell Damage'])
  })

  it('一行被标记切成多段时按行聚合：三条报告只产出一行', () => {
    const file = translate(false)
    const skills = (file.input as { skills?: unknown }).skills
    const built = (file.build as { skills?: unknown }).skills
    const at = (list: unknown, i: number, j: number): string | null => {
      const outer = Array.isArray(list)
        ? (list[i] as { support_skills?: unknown } | undefined)
        : undefined
      const inner = Array.isArray(outer?.support_skills) ? outer.support_skills[j] : undefined
      const text = (inner as { additional_text?: unknown } | undefined)?.additional_text
      return typeof text === 'string' ? text : null
    }
    const path = 'skills[0].support_skills[1].additional_text'
    expect(fieldReport(file.report, path)?.lines).toHaveLength(3)
    const { rows } = buildRows({
      original: at(skills, 0, 1),
      translated: at(built, 0, 1),
      field: fieldReport(file.report, path),
      bilingual: false,
      uniqueText: null,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('kept')
    expect(spanText(rows[0]?.en ?? [])).toBe('Take BEFORE the totem')
  })

  it('没有任何文本时给空结果，不抛异常', () => {
    expect(
      buildRows({
        original: null,
        translated: null,
        field: undefined,
        bilingual: false,
        uniqueText: null,
      }),
    ).toEqual({ injected: null, rows: [] })
  })
})
