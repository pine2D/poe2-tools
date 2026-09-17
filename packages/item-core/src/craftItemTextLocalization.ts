import { createCatalogTranslator } from './catalogTranslation'
import type { ItemDictionary } from './export'
import { resolveGrantedSkill, translateGrantedSkill } from './grantedSkills'
import { isItemStructureLine } from './parse'
import { createStatResolver, resolveBase, type StatTemplate } from './resolve'
import type { ItemLocale } from './types'

const EMPTY_ENTRIES: readonly StatTemplate[] = []
const indexes = new WeakMap<
  readonly StatTemplate[],
  {
    translate: ReturnType<typeof createCatalogTranslator>
    resolve: ReturnType<typeof createStatResolver>
  }
>()
const normalize = (line: string) => line.replace(/\s+/g, '').toLowerCase()
const unsafe = (line: string) => !line.trim() || /[\r\n\u2028\u2029{}]/u.test(line)

/** 只采用安全且经独立逆查唯一还原的译文，未译行与原因完整保留。 */
export function createItemTextLocalization(
  locale: ItemLocale,
  dictionary: ItemDictionary | undefined,
  warnings: string[],
) {
  const entries = dictionary?.stats?.entries ?? EMPTY_ENTRIES
  let index = indexes.get(entries)
  if (locale !== 'en' && !index) {
    index = { translate: createCatalogTranslator(entries), resolve: createStatResolver(entries) }
    indexes.set(entries, index)
  }
  const fallback = (line: string, reason: string) => {
    warnings.push(`${reason}，保留英文：${line}`)
    return line
  }
  return {
    base(name: string, rarity: string): string {
      if (locale === 'en') return name
      const bases = dictionary?.items?.bases ?? {}
      const translated = bases[name]
      if (!translated) return fallback(name, '基底缺少当前语言译名')
      if (unsafe(translated) || /["“”]/u.test(translated) || isItemStructureLine(translated))
        return fallback(name, '基底译名包含不支持的文本结构')
      return resolveBase([translated], rarity, bases).english === name
        ? translated
        : fallback(name, '基底译名不能唯一反查')
    },
    line(line: string, hashes?: readonly string[], multiline = false): string {
      if (locale === 'en') return line
      const translated = index?.translate(line, hashes)
      if (translated == null) return fallback(line, '属性缺少译文或存在多义译文')
      if (
        multiline
          ? translated.split(/\r?\n/).some((part) => unsafe(part) || isItemStructureLine(part))
          : unsafe(translated) || isItemStructureLine(translated)
      )
        return fallback(line, '属性译文包含不支持的文本结构')
      const reversed = index?.resolve(translated).english
      return reversed != null && normalize(reversed) === normalize(line)
        ? translated
        : fallback(line, '属性译文不能唯一还原原始数值或语义')
    },
    skill(line: string): string {
      if (locale === 'en') return line
      const readback =
        resolveGrantedSkill(line, [], 'en').resolution.english !== null
          ? '回读须与基底完整核对'
          : '当前语言回读仍受限制'
      const translated = translateGrantedSkill(line, entries, locale)
      if (translated == null) return fallback(line, `技能缺少可逆的官方整行模板，${readback}`)
      if (unsafe(translated)) return fallback(line, `技能译文包含不支持的文本结构，${readback}`)
      const reversed = resolveGrantedSkill(translated, entries, locale).resolution.english
      return reversed !== null && normalize(reversed) === normalize(line)
        ? translated
        : fallback(line, `技能译文不能唯一反查，${readback}`)
    },
  }
}
