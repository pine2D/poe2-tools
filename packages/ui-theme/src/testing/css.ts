// 测试用的最小 CSS 解析：只认规则、@media / @container / @supports 嵌套与声明，够门禁测试用。
// 不导入任何本地模块（apps/site 的测试会跨包相对导入本文件）。

export interface CssRule {
  selectors: string[]
  declarations: Map<string, string>
  atRules: string[]
}

const NESTING_AT_RULE = /^@(media|container|supports|layer)\b/

// 按分隔符切开，跳过括号与引号内部（:is(a, b)、url("…;…") 不会被切断）
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''
  for (const ch of text) {
    if (quote !== null) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      depth -= 1
    } else if (ch === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const chunk of splitTopLevel(body, ';')) {
    const colon = chunk.indexOf(':')
    if (colon < 0) continue
    const name = chunk.slice(0, colon).trim().toLowerCase()
    const value = chunk
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ')
    if (name !== '') declarations.set(name, value)
  }
  return declarations
}

/** 去注释后解析为规则列表（atRules 为外层 @media/@container 条件，由外到内） */
export function parseRules(css: string): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let i = 0
  const walk = (atRules: readonly string[]): void => {
    let prelude = ''
    while (i < src.length) {
      const ch = src[i]
      i += 1
      if (ch === ';') {
        prelude = ''
        continue
      }
      if (ch === '}') return
      if (ch !== '{') {
        prelude += ch
        continue
      }
      const head = prelude.trim().replace(/\s+/g, ' ')
      prelude = ''
      if (NESTING_AT_RULE.test(head)) {
        walk([...atRules, head])
        continue
      }
      const start = i
      let depth = 1
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1
        else if (src[i] === '}') depth -= 1
        i += 1
      }
      rules.push({
        selectors: splitTopLevel(head, ',').map((s) => s.trim().replace(/\s+/g, ' ')),
        declarations: parseDeclarations(src.slice(start, i - 1)),
        atRules: [...atRules],
      })
    }
  }
  walk([])
  return rules
}

/** 返回 css 中全部 :root 块合并后的 --* 声明；同时返回 :root 块个数 */
export function rootTokens(css: string): { count: number; tokens: Map<string, string> } {
  const tokens = new Map<string, string>()
  let count = 0
  for (const rule of parseRules(css)) {
    if (!rule.selectors.includes(':root')) continue
    count += 1
    for (const [name, value] of rule.declarations) {
      if (name.startsWith('--')) tokens.set(name, value)
    }
  }
  return { count, tokens }
}
