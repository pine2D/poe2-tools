import { readStatAnnotations } from './annotations'
import type { CraftCatalog } from './catalog'
import { matchesCatalogLines } from './catalogMatch'
import type { CraftResult } from './rehearsal'
import { scaleStatValueBoundsByEffect, splitStatScalars } from './statScalability'

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const FIXED = new RegExp(`(${NUMBER})\\((${NUMBER})\\)`, 'g')
const TOKEN = new RegExp(
  `[+-]?\\(${NUMBER}[-–—]${NUMBER}\\)|${NUMBER}(?:\\(${NUMBER}(?:[-–—]${NUMBER})?\\))?`,
  'g',
)

/** 仅供导入目录匹配的临时视图；原文的 current 必须随后独立核对。 */
export function normalizeJewelFixedImportLine(line: string): string {
  return line.replace(
    FIXED,
    (_token, current: string, base: string) =>
      `${current.startsWith('+') && Number(base) >= 0 && !base.startsWith('+') ? '+' : ''}${base}(${base})`,
  )
}

/** 固定基础数值与来源精度双重验证；变量范围始终交给目录规则，不反推掷值。 */
export function validateJewelFixedImportLine(
  catalog: CraftCatalog,
  patterns: readonly string[],
  original: string,
  effect: number,
): CraftResult<undefined> {
  const annotated = readStatAnnotations(original)
  const normalized = normalizeJewelFixedImportLine(annotated.text)
  const candidates = patterns.filter((pattern) => matchesCatalogLines([pattern], [normalized]))
  const pattern = candidates[0]
  if (candidates.length !== 1 || pattern === undefined)
    return { ok: false, error: '固定基础数值不能唯一对应目录属性行。' }
  const scalars = splitStatScalars(pattern).tokens
  const tokens = [...annotated.text.matchAll(TOKEN)]
  if (tokens.length !== scalars.length)
    return { ok: false, error: '固定基础数值与目录数字位置不一致。' }
  for (const [index, token] of tokens.entries()) {
    const pair = [...token[0].matchAll(FIXED)][0]
    if (!pair) continue
    const current = Number(pair[1])
    const base = Number(pair[2])
    if (current === base) continue
    const metadata = catalog.scalability?.[pattern]
    const scalar = metadata?.[index]
    if (
      annotated.unscalable ||
      metadata?.length !== scalars.length ||
      !scalar?.scalable ||
      scalars[index]?.text.includes('(')
    )
      return { ok: false, error: '固定当前数值缺少可缩放来源，不能改写基础值。' }
    const scaled = scaleStatValueBoundsByEffect(base, scalar.formats, effect)
    if (!scaled.ok || scaled.value.min !== scaled.value.max || current !== scaled.value.min)
      return { ok: false, error: '固定当前数值与已核对增效或来源内部精度不一致。' }
  }
  return { ok: true, value: undefined }
}
