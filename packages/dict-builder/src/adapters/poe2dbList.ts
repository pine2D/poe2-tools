// poe2db 列表页（/{us,cn,tw}/Gem、/Unique_item、装备分类页）解析：slug → 显示名。
// 只解析锚点，不碰详情页；三语页面 slug 相同，us 页给英文名（校验锚点），cn / tw 页给译名。

export type ListKind = 'gem' | 'unique' | 'base'

export interface ListParse {
  names: Map<string, string>
  // 同一 slug 出现了不同文本的 slug（保留先出现的文本）
  conflicts: string[]
}

export interface JoinAudit {
  candidates: number
  joined: number
  missingInEn: number
  enMismatch: string[]
  missingInTarget: number
  sameAsEn: number
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
}

export function unescapeHtml(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|#039|apos);/g, (entity) => NAMED_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (entity, code: string) => {
      const point = Number(code)
      return point <= 0x10ffff ? String.fromCodePoint(point) : entity
    })
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) => {
      const point = Number.parseInt(code, 16)
      return point <= 0x10ffff ? String.fromCodePoint(point) : entity
    })
}

// 站内 slug 规则（实测）：撇号删除，逗号保留（href 里 percent 编码为 %2C），空白折成下划线，
// 其余字符（含 é / ö）原样保留
export function slugOf(name: string): string {
  return name.replace(/['’]/g, '').trim().replace(/\s+/g, '_')
}

// 三种页面的条目锚点；图标锚点没有文本（<img>），自然匹配不上
const ANCHORS: Record<ListKind, RegExp> = {
  gem: /<a class="(?:gem_[a-z]+|gemitem)"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
  unique: /<a class="UniqueItem"[^>]*href="([^"]+)"><span class="uniqueName">([^<]+)<\/span>/g,
  base: /<a class="whiteitem[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
}

// href 形态：分类页是相对路径 "Cryptic_Crown"，传奇 / 宝石页是 "/cn/Beiras_Anguish"；非 ASCII slug 已 percent 编码
function slugFromHref(href: string): string {
  const path = href.replace(/^\/?(?:us|cn|tw)\//, '')
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function parseListPage(html: string, kind: ListKind): ListParse {
  const names = new Map<string, string>()
  const conflicts: string[] = []
  for (const match of html.matchAll(ANCHORS[kind])) {
    const slug = slugFromHref(match[1] ?? '')
    const text = unescapeHtml((match[2] ?? '').trim())
    if (slug === '' || text === '') continue
    const existing = names.get(slug)
    if (existing === undefined) names.set(slug, text)
    else if (existing !== text && !conflicts.includes(slug)) conflicts.push(slug)
  }
  return { names, conflicts }
}

// 多个分类页合并；跨页同 slug 不同文本也算冲突
export function mergeLists(pages: readonly ListParse[]): ListParse {
  const merged: ListParse = { names: new Map(), conflicts: [] }
  for (const page of pages) {
    for (const slug of page.conflicts) {
      if (!merged.conflicts.includes(slug)) merged.conflicts.push(slug)
    }
    for (const [slug, text] of page.names) {
      const existing = merged.names.get(slug)
      if (existing === undefined) merged.names.set(slug, text)
      else if (existing !== text && !merged.conflicts.includes(slug)) merged.conflicts.push(slug)
    }
  }
  return merged
}

export function newJoinAudit(): JoinAudit {
  return {
    candidates: 0,
    joined: 0,
    missingInEn: 0,
    enMismatch: [],
    missingInTarget: 0,
    sameAsEn: 0,
  }
}

// 英文规范名 → 目标语言名：us 页同 slug 的英文名必须与规范名逐字符相等（防撞页 / 改名），cn / tw 页必须有非空文本
export function lookupName(
  name: string,
  en: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>,
  audit: JoinAudit,
): string | null {
  audit.candidates += 1
  const slug = slugOf(name)
  const enName = en.get(slug)
  if (enName === undefined) {
    audit.missingInEn += 1
    return null
  }
  if (enName !== name) {
    audit.enMismatch.push(`${slug}: ${name} ≠ ${enName}`)
    return null
  }
  const text = target.get(slug)
  if (text === undefined || text === '') {
    audit.missingInTarget += 1
    return null
  }
  if (text === name) audit.sameAsEn += 1
  audit.joined += 1
  return text
}
