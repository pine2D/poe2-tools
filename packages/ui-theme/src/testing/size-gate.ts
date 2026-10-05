// 尺寸阶梯门禁的共用检查器（2026-10-03 方案 §3.3）：网站页面层（apps/site/src/testing/scale-tokens.test.ts）
// 与扩展弹窗、L1（extension-sizes.test.ts）共用同一套默认规则；网站对 home、l1-demo、extension 三个页面文件另加严格档（PAGE_STRICT）。只被测试引用，不进网站产物，也不进扩展 zip。
// 只导入同目录的 css.ts，且不写扩展名：apps/site 的测试会跨包相对导入本文件，两套 tsconfig 都要能解析。
import { parseRules } from './css'

/** 受检属性：字号（含 font 简写）、行高、字距、外内边距、间距、定位偏移、滚动边距，以及网站页面层的间距变量 */
export const SIZE_CHECKED =
  /^(font|font-size|line-height|letter-spacing|text-indent|margin(-[a-z]+)*|padding(-[a-z]+)*|gap|row-gap|column-gap|inset(-[a-z]+)*|top|right|bottom|left|scroll-margin(-[a-z]+)*|scroll-padding(-[a-z]+)*|--main-pad-top)$/

/** 字面值正则：含负值与小数；前面紧跟字母、数字、点或连字符的不算（如 --sp-2 里的 2） */
const literalPattern = (units: string): RegExp =>
  new RegExp(`(?<![\\w.-])-?(?:\\d+\\.?\\d*|\\.\\d+)(?:${units})\\b`, 'g')

/** px / rem 字面值 */
export const SIZE_LITERAL = literalPattern('px|rem')
const SIZE_LITERAL_EM = literalPattern('px|rem|em')

/**
 * 取出声明值里的 px/rem 字面值（em 为 true 时 em 也算）：env() 的回退值不算；
 * 紧跟间距令牌的 “+ 1px” 是 1px 边框补偿（几何），不算
 */
export function sizeLiterals(value: string, em = false): string[] {
  const cleaned = value
    .replace(/env\([^)]*\)/g, '')
    .replace(/(var\(--sp-\d\))\s*\+\s*1px(?![\w.])/g, '$1')
  return (cleaned.match(em ? SIZE_LITERAL_EM : SIZE_LITERAL) ?? []).filter(
    (hit) => Number.parseFloat(hit) !== 0,
  )
}

export interface SizeGateOptions {
  /** 整值必须是单个 var(--fs-*) 的属性（比较前规整空白）；不经 ALLOW 放行 */
  tokenOnly?: RegExp
  /** 这些属性里 em 也算字面值（仍可经 ALLOW 逐值放行） */
  emChecked?: RegExp
}

/** 页面层严格档：字号只用 --fs-* 令牌；间距属性不写 px、rem、em */
export const PAGE_STRICT: SizeGateOptions = {
  tokenOnly: /^font-size$/,
  emChecked: /^(margin|padding|gap|row-gap|column-gap)(-|$)/,
}

const FS_TOKEN = /^var\(--fs-[a-z-]+\)$/

/** 几何尺寸允许清单：键为“文件|选择器|属性”，值为该声明里允许出现的字面值（逐值比对，不用通配） */
export type SizeAllow = Readonly<Record<string, readonly string[]>>

export interface SizeScan {
  /** 未被 ALLOW 放行的声明，格式“文件 [@media …] 选择器 { 属性: 值 }” */
  violations: string[]
  /** 本文件里所有带字面值的受检声明的键（无论是否放行），供“ALLOW 没有失效条目”检查 */
  used: Set<string>
}

/** 扫描一份 CSS：受检属性里出现非零 px/rem 字面值，且不全在 allow[文件|选择器|属性] 之内，即为违规 */
export function scanSizes(
  file: string,
  css: string,
  allow: SizeAllow,
  options: SizeGateOptions = {},
): SizeScan {
  const violations: string[] = []
  const used = new Set<string>()
  for (const rule of parseRules(css)) {
    for (const [prop, value] of rule.declarations) {
      if (!SIZE_CHECKED.test(prop)) continue
      const notToken =
        options.tokenOnly?.test(prop) === true && !FS_TOKEN.test(value.replace(/\s+/g, ' ').trim())
      const found = sizeLiterals(value, options.emChecked?.test(prop) ?? false)
      if (found.length === 0 && !notToken) continue
      const media = rule.atRules.length === 0 ? '' : `${rule.atRules.join(' ')} `
      for (const selector of rule.selectors) {
        const key = `${file}|${selector}|${prop}`
        used.add(key)
        if (notToken || !found.every((hit) => (allow[key] ?? []).includes(hit)))
          violations.push(`${file} ${media}${selector} { ${prop}: ${value} }`)
      }
    }
  }
  return { violations, used }
}
