// 扩展尺寸阶梯门禁（2026-10-03 方案 §3.3、第三期）：扩展设置弹窗（apps/poe2-extension/src/popup/popup.css，
// 经 tokens.css 的 :root 取阶梯）与 CoE 注入界面（l1.css，在 :host 声明阶梯子集）的字号与间距只取 --fs-* / --sp-*，
// 不写 px/rem 字面值。检查器与网站页面层门禁共用（testing/size-gate.ts），默认规则相同（网站对三个页面文件另加严格档）。
// 偏离阶梯的值逐条登记在 ALLOW 并写明理由，恰好四条（第三期计划裁定 12）；新增例外先改计划与 DESIGN.md。
// 几何尺寸（宽高、圆角、边框、outline、下划线偏移、logo 的 --ptm-*）不在受检属性里，门禁不看。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type SizeAllow, scanSizes } from './testing/size-gate'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const FILES: Readonly<Record<string, string>> = {
  'l1.css': read('./l1.css'),
  'popup.css': read('../../../apps/poe2-extension/src/popup/popup.css'),
}

const ALLOW: SizeAllow = {
  // 品牌标题与网站 pt-frame 标题栏（components/frame.css 的 .pt-titlebar__title）同为 19px：网站与扩展的标题必须同值
  'popup.css|.titlebar__title|font': ['19px'],
  // 短署名与网站 pt-provenance（components/provenance.css）同为 12.5px
  'l1.css|.by|font-size': ['12.5px'],
  // 由 sticky 署名高度推出：1 + 8 + 12×1.6 + 8 = 36.2px，再给 2px 焦点环与 2px 外偏移留位，取 42px（l1.test.ts 断言下限）
  'l1.css|:host([data-poe2-l10n="search"])|scroll-padding-block': ['42px'],
  // 候选按钮上下各 2px：改成 --sp-1 会让候选变疏，不在本期
  'l1.css|::slotted(button)|margin': ['2px'],
}

describe('扩展尺寸阶梯门禁（方案 §3.3）', () => {
  const results = Object.entries(FILES).map(([file, css]) => scanSizes(file, css, ALLOW))
  const used = new Set(results.flatMap((result) => [...result.used]))

  it('弹窗与 L1 的字号与间距不写 px/rem 字面值（例外见 ALLOW）', () => {
    expect(results.flatMap((result) => result.violations)).toEqual([])
  })

  it('ALLOW 恰好四条，且每一条都还能在对应文件里命中', () => {
    expect(Object.keys(ALLOW)).toHaveLength(4)
    expect(Object.keys(ALLOW).filter((key) => !used.has(key))).toEqual([])
  })
})
