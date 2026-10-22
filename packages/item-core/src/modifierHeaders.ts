import { HEADER_STATE, readHeaderStates } from './annotations'
import type { ItemMod } from './types'

const KINDS = [
  ['prefix', 'Prefix Modifier', /^(?:前缀(?:属性|词缀)|前綴(?:屬性|詞綴)|Prefix Modifier)/i],
  ['suffix', 'Suffix Modifier', /^(?:后缀(?:属性|词缀)|後綴(?:屬性|詞綴)|Suffix Modifier)/i],
  ['implicit', 'Implicit Modifier', /^(?:基底(?:属性|词缀|屬性|詞綴)|Implicit Modifier)/i],
  ['unique', 'Unique Modifier', /^(?:传奇(?:属性|词缀)|傳奇(?:屬性|詞綴)|Unique Modifier)/i],
  [
    'enchant',
    'Corrupted Enhancement',
    /^(?:腐化强化(?:词缀)?|腐化強化(?:詞綴)?|Corrupted Enhancement)/i,
  ],
  ['enchant', 'Enchant Modifier', /^(?:强化|強化|附魔(?:属性|词缀|屬性|詞綴)|Enchant Modifier)/i],
] as const

type ModifierHeader = Pick<ItemMod, 'kind' | 'name' | 'tier' | 'tags' | 'states' | 'magnitude'> & {
  englishKind: string
}

/** 严格消费整个标题。名字、等阶、标签和增效有独立边界，未知片段不作标签吞掉。 */
export function readModifierHeader(raw: string): ModifierHeader | null {
  const outer = /^\s*\{\s*([^{}\r\n]*)\s*\}\s*$/.exec(raw)
  if (!outer) return null
  const states = readHeaderStates(raw)
  let rest = (outer[1] ?? '').trim()
  if (states.length) rest = rest.replace(HEADER_STATE, '').trim()
  const entry = KINDS.find(([, , pattern]) => pattern.test(rest))
  if (!entry) return null
  const [kind, englishKind, pattern] = entry
  rest = rest.replace(pattern, '').trim()
  if (states.length && kind !== 'prefix' && kind !== 'suffix') return null
  let name: string | null = null
  let tier: number | null = null
  if (kind === 'prefix' || kind === 'suffix') {
    const named = /^(?:"([^"{}\r\n]+)"|“([^”{}\r\n]+)”)\s*/.exec(rest)
    if (!named) return null
    name = named[1] ?? named[2] ?? null
    rest = rest.slice(named[0].length)
    const ranked = /^\((?:等阶|等階|阶级|階級|Tier)\s*[:：]\s*(\d+)\)\s*/i.exec(rest)
    if (ranked) {
      tier = Number(ranked[1])
      if (!Number.isSafeInteger(tier)) return null
      rest = rest.slice(ranked[0].length)
    }
  }
  let magnitude: number | undefined
  let tags: string[] = []
  if (rest) {
    if (!/^[—–]{1,2}\s*\S/.test(rest)) return null
    rest = rest.replace(/^[—–]{1,2}\s*/, '')
    const scaled =
      /(?:^|[—–]{1,2}\s*)(?:(\d+(?:\.\d+)?)%\s+(Increased|Reduced)|(提高|降低|增加|減少)\s*(\d+(?:\.\d+)?)%)\s*$/i.exec(
        rest,
      )
    if (scaled) {
      const direction = scaled[2] ?? scaled[3] ?? ''
      magnitude =
        Number(scaled[1] ?? scaled[4]) * (/^(?:Reduced|降低|減少)$/i.test(direction) ? -1 : 1)
      if (!Number.isFinite(magnitude)) return null
      rest = rest.slice(0, scaled.index).trim()
    }
    if (rest) {
      if (/[—–%]/.test(rest)) return null
      tags = rest.split(/[,，]/).map((tag) => tag.trim())
      if (tags.some((tag) => !tag)) return null
    } else if (!scaled) return null
  }
  return {
    kind,
    englishKind,
    name,
    tier,
    tags,
    ...(states.length ? { states } : {}),
    ...(magnitude === undefined ? {} : { magnitude }),
  }
}

export function knownModifierHeader(raw: string): boolean {
  return readModifierHeader(raw) !== null
}
