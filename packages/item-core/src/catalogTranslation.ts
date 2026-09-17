import { readUnlevelledSkillName, translateUnlevelledSkill } from './grantedSkills'
import {
  canonicalStatTemplates,
  createStatResolver,
  reducedStatFallbacks,
  type StatTemplate,
} from './resolve'

export function createCatalogTranslator(
  entries: readonly StatTemplate[],
): (text: string, statHashes?: readonly string[]) => string | null {
  entries = canonicalStatTemplates(entries)
  const reverse = (source: readonly StatTemplate[]) =>
    source.flatMap((entry) => {
      if (
        entry.order !== undefined &&
        (new Set(entry.order).size !== entry.order.length ||
          entry.order.some(
            (value) => !Number.isInteger(value) || value < 0 || value >= (entry.order?.length ?? 0),
          ))
      )
        return []
      const inverse = entry.order?.map((_, index) => entry.order?.indexOf(index) ?? -1)
      return [
        {
          id: entry.id,
          text: entry.en,
          en: entry.text,
          ...(inverse === undefined ? {} : { order: inverse }),
        },
      ]
    })
  // 在交换翻译方向前派生相同的安全配对，并继续作为低优先级回退。
  const resolverFor = (source: readonly StatTemplate[]) =>
    createStatResolver(reverse(source), reverse(reducedStatFallbacks(source)))
  const translate = resolverFor(entries)
  const contextual = new Map<string, ReturnType<typeof createStatResolver> | null>()
  return (text, statHashes) => {
    if (readUnlevelledSkillName(text, 'en') !== null) return translateUnlevelledSkill(text, entries)
    if (!statHashes?.length) return translate(text).english
    const hashes = [...new Set(statHashes)].sort()
    const key = hashes.join('\u0000')
    if (!contextual.has(key)) {
      const selected = entries.filter((entry) =>
        hashes.some((hash) => entry.id.endsWith(`stat_${hash}`)),
      )
      contextual.set(key, selected.length === 0 ? null : resolverFor(selected))
    }
    const resolver = contextual.get(key)
    // 没有任何词典身份命中时沿用通用翻译；身份已命中则不得混入其他命名空间。
    return resolver === null || resolver === undefined
      ? translate(text).english
      : resolver(text).english
  }
}
