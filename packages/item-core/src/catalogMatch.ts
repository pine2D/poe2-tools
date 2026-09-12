import { readStatAnnotations, UNSCALABLE_SUFFIX } from './annotations'
import { type CatalogBase, type CatalogMod, inspectModPool } from './catalog'
import type { InspectedMod } from './export'

export interface CatalogModMatch {
  sourceIndex: number
  status: 'matched' | 'ambiguous' | 'unmatched' | 'untranslated' | 'unsupported'
  candidates: CatalogMod[]
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const RANGE = new RegExp(`\\((${NUMBER})[-–—](${NUMBER})\\)`, 'g')
const ROLL = `(${NUMBER})(?:\\((${NUMBER})[-–—](${NUMBER})\\))?`
function compact(text: string) {
  return text.replace(UNSCALABLE_SUFFIX, '').trim().replace(/\s+/g, '').toLowerCase()
}
function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 只替换目录的范围，固定数字仍是字面量；不从一次roll猜tier。 */
function compileLine(line: string): (text: string) => (number | null)[] | null {
  const source = compact(line)
  const ranges: [number, number][] = []
  let expression = '^'
  let offset = 0
  for (const match of source.matchAll(RANGE)) {
    let literal = source.slice(offset, match.index)
    const sign = literal.endsWith('-') ? -1 : 1
    const prefix = /[+-]$/.test(literal) ? literal.slice(-1) : ''
    if (/[+-]$/.test(literal)) literal = literal.slice(0, -1)
    expression += `${escapeRegex(literal)}(?:${ROLL}|(${escapeRegex(prefix + match[0])}))`
    ranges.push([sign * Number(match[1]), sign * Number(match[2])])
    offset = match.index + match[0].length
  }
  const regex = new RegExp(`${expression}${escapeRegex(source.slice(offset))}$`)
  return (text) => {
    if (text.length > 2000) return null
    const matched = regex.exec(compact(text))
    if (!matched) return null
    const values: (number | null)[] = []
    for (const [index, [a, b]] of ranges.entries()) {
      // 未掷的目录范围也参与整组对应，但不假造一个实际值。
      if (matched[index * 4 + 4] !== undefined) {
        values.push(null)
        continue
      }
      const value = Number(matched[index * 4 + 1])
      const low = Math.min(a, b)
      const high = Math.max(a, b)
      if (!Number.isFinite(value) || value < low || value > high) return null
      const first = matched[index * 4 + 2]
      const last = matched[index * 4 + 3]
      if (
        first !== undefined &&
        (Math.min(Number(first), Number(last)) !== low ||
          Math.max(Number(first), Number(last)) !== high)
      )
        return null
      values.push(value)
    }
    return values
  }
}

// 显示顺序可能变化；要求整组一一对应，不能用重复的一行冒充两条属性。
function sameGroup(
  patterns: ReturnType<typeof compileLine>[],
  lines: readonly string[],
): (number | null)[][] | null {
  if (patterns.length !== lines.length) return null
  const used = new Set<number>()
  const values: (number | null)[][] = []
  function match(index: number): boolean {
    if (index === patterns.length) return true
    return lines.some((line, lineIndex) => {
      if (used.has(lineIndex)) return false
      const parsed = patterns[index]?.(line)
      if (parsed === undefined || parsed === null) return false
      values[index] = parsed
      used.add(lineIndex)
      if (match(index + 1)) return true
      used.delete(lineIndex)
      return false
    })
  }
  return match(0) ? values : null
}

/** 返回目录顺序的每行实际值；固定数字不占位置，未掷范围为 null。 */
export function readCatalogLineValues(
  patterns: readonly string[],
  lines: readonly string[],
): (number | null)[][] | null {
  return sameGroup(patterns.map(compileLine), lines)
}

/** 固有属性与常规词缀共用范围和整组核对规则。 */
export function matchesCatalogLines(
  patterns: readonly string[],
  lines: readonly string[],
): boolean {
  return readCatalogLineValues(patterns, lines) !== null
}

/** 对应当前快照常规词缀，不代表已验证该装备的所有制作状态。 */
export function matchCatalogMods(
  base: CatalogBase,
  modifiers: readonly CatalogMod[],
  imported: readonly InspectedMod[],
  addedTags: readonly string[] = [],
): CatalogModMatch[] {
  // 已存在的词缀不因当前物等排除；高阶通货与历史状态需由操作规则另行核对。
  const pools = new Map<
    'ordinary' | 'desecrated',
    { mod: CatalogMod; patterns: ReturnType<typeof compileLine>[] }[]
  >()
  function candidatesFor(source: 'ordinary' | 'desecrated') {
    let candidates = pools.get(source)
    if (!candidates) {
      candidates = inspectModPool(base, modifiers, 100, [], addedTags, source).map(({ mod }) => ({
        mod,
        patterns: mod.lines.map(compileLine),
      }))
      pools.set(source, candidates)
    }
    return candidates
  }
  return imported.map(({ mod, stats }, sourceIndex) => {
    if (mod.kind !== 'prefix' && mod.kind !== 'suffix')
      return { sourceIndex, status: 'unsupported', candidates: [] }
    // 英文原文可直接与目录核对，不要求先命中交易词典。
    const untranslated = stats.some((stat) => stat.resolution.english === null)
    const lines = stats.map(
      (stat) => readStatAnnotations(stat.resolution.english ?? stat.source.raw).text,
    )
    const matches = candidatesFor(mod.states?.includes('desecrated') ? 'desecrated' : 'ordinary')
      .filter(
        (candidate) =>
          candidate.mod.kind === mod.kind && sameGroup(candidate.patterns, lines) !== null,
      )
      .map((candidate) => candidate.mod)
    return {
      sourceIndex,
      status:
        matches.length === 1
          ? 'matched'
          : matches.length > 1
            ? 'ambiguous'
            : untranslated
              ? 'untranslated'
              : 'unmatched',
      candidates: matches,
    }
  })
}
