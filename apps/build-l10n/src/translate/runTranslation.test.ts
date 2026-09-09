// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { detectIndent, formatRate, translateSource } from './runTranslation'

const fixtures = fileURLToPath(new URL('../../../../data/fixtures/synthetic/', import.meta.url))
const read = (name: string): string => readFileSync(`${fixtures}${name}`, 'utf8')
const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}
const options = { bilingual: false, annotateUniques: true }

describe('detectIndent', () => {
  it('含换行 → 2，单行 → 0', () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe(2)
    expect(detectIndent('{"a":1}')).toBe(0)
  })
})

describe('translateSource', () => {
  it('rich.build → 输出与期望文件相同，覆盖率与未命中清单正确', () => {
    const result = translateSource(
      { id: 'f1', name: 'rich.build', text: read('rich.build') },
      dict,
      options,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.output).toBe(read('rich.expected.zh-CN.build').trimEnd())
    expect(result.file.rate).toBe(7 / 8)
    expect(result.file.unmatched).toEqual([
      {
        path: 'inventory_slots[3].additional_text',
        line: 3,
        text: '3% increased Attack Speed per 25 Dexterity',
      },
    ])
    expect(result.file.preview.skills[0]?.text).toBe('烈焰冲击')
    expect(result.file.input.inventory_slots).toHaveLength(4)
  })

  it('单行输入 → 单行输出（键序与值不变）', () => {
    const text = read('minimal.build').trimEnd()
    const result = translateSource({ id: 'f2', name: 'minimal.build', text }, dict, options)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.output).toBe(text)
    expect(result.file.rate).toBeNull()
  })

  it('双语选项透传', () => {
    const result = translateSource(
      { id: 'f3', name: 'rich.build', text: read('rich.build') },
      dict,
      { bilingual: true, annotateUniques: true },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 断言未序列化的结构（output 里换行是 JSON 转义的 \n）
    expect(result.file.build.inventory_slots?.[0]?.additional_text).toContain(
      '法术伤害提高 149%\n   149% increased Spell Damage',
    )
  })

  it('不是 JSON → 失败并带文件名', () => {
    expect(
      translateSource({ id: 'f4', name: 'bad.build', text: 'not json' }, dict, options),
    ).toMatchObject({
      ok: false,
      id: 'f4',
      name: 'bad.build',
    })
  })
})

describe('formatRate', () => {
  it('四舍五入到整数百分比，null 显示破折号', () => {
    expect(formatRate(7 / 8)).toBe('88%')
    expect(formatRate(1)).toBe('100%')
    expect(formatRate(null)).toBe('—')
  })
})
