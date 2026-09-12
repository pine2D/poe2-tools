import type { CatalogBase } from './catalog'
import { matchesCatalogLines } from './catalogMatch'
import type { CraftResult } from './rehearsal'
import type { Resolution, StatTemplate, TranslationCandidate } from './resolve'
import type { ItemLocale } from './types'

export interface BaseGrantedSkill {
  lineIndex: number
  name: string
  minLevel: number
  maxLevel: number
}

export interface InitialSkillDeclaration {
  lineIndex: number
  displayedLevel: number
}

export interface ResolvedGrantedSkill {
  unlevelled?: true
  displayedLevel: number | null
  maxLevel: number | null
  resolution: Resolution
}

const BASE_SKILL = /^Grants Skill: Level \((\d+)-(\d+)\) (\S(?:.*\S)?)$/
const SOURCE_SKILL = {
  en: /^Grants Skill: Level (\d+) (\S(?:.*?\S)?)(?: \(Max Level (\d+)\))?$/,
  'zh-CN': /^获得技能\s*[:：]\s*等级 (\d+) (\S(?:.*?\S)?)(?:（最高等级 (\d+)）)?$/,
  'zh-TW': /^賦予技能\s*[:：]\s*等級 (\d+) (\S(?:.*?\S)?)(?:（最高等級 (\d+)）)?$/,
} satisfies Record<ItemLocale, RegExp>

const STATIC_SKILL = {
  en: /^Grants Skill: (\S(?:.*\S)?)$/,
  'zh-CN': /^获得技能[:：] (\S(?:.*\S)?)$/,
  'zh-TW': /^賦予技能[:：] (\S(?:.*\S)?)$/,
} satisfies Record<ItemLocale, RegExp>

// 等级关键字、数字和注释符号不能作为未知技能名称吞入。
function validSkillName(name: string): boolean {
  return !/[\d#()（）{}\r\n]/u.test(name) && !/\b(?:Level|Max Level)\b|等级|等級/i.test(name)
}

export function readUnlevelledSkillName(raw: string, locale: ItemLocale): string | null {
  const lineLocale = raw.trim().startsWith('Grants Skill:') ? 'en' : locale
  const name = STATIC_SKILL[lineLocale].exec(raw.trim())?.[1]
  return name && validSkillName(name) ? name : null
}

function uniqueResolution(candidates: TranslationCandidate[]): Resolution {
  const unique = [...new Map(candidates.map((entry) => [JSON.stringify(entry), entry])).values()]
  const english = new Set(unique.map((entry) => entry.english))
  return { english: english.size === 1 ? (unique[0]?.english ?? null) : null, candidates: unique }
}

function readTemplate(entry: StatTemplate, locale: ItemLocale) {
  if (!entry.id.startsWith('skill.')) return null
  const source = locale === 'en' ? entry.en : entry.text
  if (source.split('#').length !== 2 || entry.en.split('#').length !== 2) return null
  const pattern = SOURCE_SKILL[locale]
  const marker = '246813579'
  const parsed = pattern.exec(source.replace('#', marker))
  const english = SOURCE_SKILL.en.exec(entry.en.replace('#', marker))
  if (
    !parsed ||
    !english ||
    parsed[1] !== marker ||
    english[1] !== marker ||
    parsed[3] !== undefined ||
    english[3] !== undefined ||
    !validSkillName(parsed[2] ?? '') ||
    !validSkillName(english[2] ?? '')
  )
    return null
  return { localizedName: parsed[2] ?? '', englishName: english[2] ?? '' }
}

/** 技能区块只接受官方 skill.* 整行模板与规范的可选最高等级尾注。 */
export function resolveGrantedSkill(
  raw: string,
  entries: readonly StatTemplate[],
  locale: ItemLocale,
): ResolvedGrantedSkill {
  // 整件语言不覆盖明确的英文技能语法；仍使用同一套英文名称/等级安全检查。
  if (locale !== 'en' && raw.trim().startsWith('Grants Skill:'))
    return resolveGrantedSkill(raw, entries, 'en')
  const match = SOURCE_SKILL[locale].exec(raw.trim())
  if (!match) {
    const name = readUnlevelledSkillName(raw, locale)
    if (name === null)
      return { displayedLevel: null, maxLevel: null, resolution: uniqueResolution([]) }
    const candidates = entries.flatMap((entry) => {
      const template = readTemplate(entry, locale)
      return template?.localizedName === name
        ? [{ id: entry.id, english: `Grants Skill: ${template.englishName}` }]
        : []
    })
    if (locale === 'en' && candidates.length === 0)
      candidates.push({ id: `skill.english:${name}`, english: `Grants Skill: ${name}` })
    return {
      unlevelled: true,
      displayedLevel: null,
      maxLevel: null,
      resolution: uniqueResolution(candidates),
    }
  }
  const displayedLevel = Number(match[1])
  const maxLevel = match[3] === undefined ? null : Number(match[3])
  const name = match[2] ?? ''
  if (
    !validSkillName(name) ||
    !Number.isSafeInteger(displayedLevel) ||
    (maxLevel !== null && (!Number.isSafeInteger(maxLevel) || maxLevel < displayedLevel))
  )
    return { displayedLevel: null, maxLevel: null, resolution: uniqueResolution([]) }
  let candidates = entries.flatMap((entry) => {
    const template = readTemplate(entry, locale)
    if (!template || template.localizedName !== name) return []
    const suffix = maxLevel === null ? '' : ` (Max Level ${maxLevel})`
    return [
      {
        id: entry.id,
        english: `Grants Skill: Level ${displayedLevel} ${template.englishName}${suffix}`,
      },
    ]
  })
  if (locale === 'en' && candidates.length === 0) {
    candidates = [{ id: `skill.english:${name}`, english: raw.trim() }]
  }
  return { displayedLevel, maxLevel, resolution: uniqueResolution(candidates) }
}

/** 与回读共用完整模板证据；不同中文译名不自动择一。 */
export function translateUnlevelledSkill(
  raw: string,
  entries: readonly StatTemplate[],
): string | null {
  const name = readUnlevelledSkillName(raw, 'en')
  if (name === null) return null
  const translated = new Set(
    entries.flatMap((entry) => {
      const locale = entry.text.startsWith('获得技能') ? 'zh-CN' : 'zh-TW'
      const template = readTemplate(entry, locale)
      if (template?.englishName !== name) return []
      return [`${locale === 'zh-CN' ? '获得技能' : '賦予技能'}: ${template.localizedName}`]
    }),
  )
  return translated.size === 1 ? ([...translated][0] ?? null) : null
}

/** 从同一套官方整行模板生成目标语言，等级与最高等级使用已解析的独立字段。 */
export function translateGrantedSkill(
  raw: string,
  entries: readonly StatTemplate[],
  locale: Exclude<ItemLocale, 'en'>,
): string | null {
  const parsed = SOURCE_SKILL.en.exec(raw.trim())
  const name = parsed?.[2] ?? readUnlevelledSkillName(raw, 'en')
  if (name === null || name === undefined) return null
  const candidates = new Set(
    entries.flatMap((entry) => {
      const template = readTemplate(entry, locale)
      if (template?.englishName !== name) return []
      if (!parsed)
        return [`${locale === 'zh-CN' ? '获得技能' : '賦予技能'}: ${template.localizedName}`]
      const suffix =
        parsed[3] === undefined
          ? ''
          : `（${locale === 'zh-CN' ? '最高等级' : '最高等級'} ${parsed[3]}）`
      return [entry.text.replace('#', parsed[1] ?? '') + suffix]
    }),
  )
  return candidates.size === 1 ? ([...candidates][0] ?? null) : null
}

export function readBaseGrantedSkills(base: CatalogBase): BaseGrantedSkill[] {
  return (base.implicit?.split('\n') ?? []).flatMap((line, lineIndex) => {
    const match = BASE_SKILL.exec(line.trim())
    if (!match) return []
    const minLevel = Number(match[1])
    const maxLevel = Number(match[2])
    if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel) || minLevel > maxLevel) return []
    return [{ lineIndex, name: match[3] ?? '', minLevel, maxLevel }]
  })
}

export function buildInitialSkillLines(
  base: CatalogBase,
  declarations: readonly InitialSkillDeclaration[] = [],
): CraftResult<string[] | undefined> {
  const patterns = base.implicit?.split('\n')
  if (patterns === undefined) {
    return declarations.length === 0
      ? { ok: true, value: undefined }
      : { ok: false, error: '该基底没有可声明的授予技能。' }
  }
  const skills = new Map(readBaseGrantedSkills(base).map((skill) => [skill.lineIndex, skill]))
  if (new Set(declarations.map((entry) => entry.lineIndex)).size !== declarations.length)
    return { ok: false, error: '起点技能等级声明不能重复。' }
  const values = new Map<number, number>()
  for (const declaration of declarations) {
    const skill = skills.get(declaration.lineIndex)
    if (
      !skill ||
      !Number.isInteger(declaration.displayedLevel) ||
      declaration.displayedLevel < skill.minLevel ||
      declaration.displayedLevel > skill.maxLevel
    )
      return { ok: false, error: '起点技能等级必须是目录范围内的整数。' }
    values.set(declaration.lineIndex, declaration.displayedLevel)
  }
  return {
    ok: true,
    value: patterns.map((line, lineIndex) => {
      const skill = skills.get(lineIndex)
      const level = values.get(lineIndex)
      return skill && level !== undefined ? `Grants Skill: Level ${level} ${skill.name}` : line
    }),
  }
}

function matchSkill(pattern: string, actual: string): boolean {
  if (pattern.trim() === actual.trim()) return true
  const catalog = BASE_SKILL.exec(pattern.trim())
  if (!catalog) return false
  const line = SOURCE_SKILL.en.exec(actual.trim())
  if (!line || line[2] !== catalog[3]) return false
  const level = Number(line[1])
  const maximum = line[3] === undefined ? null : Number(line[3])
  const low = Number(catalog[1])
  const high = Number(catalog[2])
  return (
    Number.isInteger(level) &&
    level >= low &&
    level <= high &&
    (maximum === null || (Number.isInteger(maximum) && maximum >= level && maximum <= high))
  )
}

/** 技能范围是目录约束；其具体等级和最高等级不进入通用数值匹配。 */
export function matchesGrantedSkillImplicitLines(
  patterns: readonly string[],
  lines: readonly string[],
): boolean {
  if (patterns.length !== lines.length) return false
  const used = new Set<number>()
  function visit(index: number): boolean {
    if (index === patterns.length) return true
    const pattern = patterns[index]
    if (pattern === undefined) return false
    return lines.some((line, lineIndex) => {
      if (used.has(lineIndex)) return false
      const matches = /^Grants Skill:/.test(pattern.trim())
        ? matchSkill(pattern, line)
        : matchesCatalogLines([pattern], [line])
      if (!matches) return false
      used.add(lineIndex)
      if (visit(index + 1)) return true
      used.delete(lineIndex)
      return false
    })
  }
  return visit(0)
}
