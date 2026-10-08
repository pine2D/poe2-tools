import type { GuideBlock, GuideStage, Range } from '@poe2-tools/guide-core'
import { createSink } from '../blocks'

type Json = unknown
const isObj = (v: Json): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// 从 start 处的 { 开始，按括号配对截出 JSON 对象文本（跳过字符串内部）。
export function sliceJsonObject(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

// 隔离世界读不到页面的 window 变量，只能解析 <script> 文本。
export function readPreloadedState(doc: Document): Json {
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const text = script.textContent ?? ''
    const marker = text.indexOf('__PRELOADED_STATE__')
    if (marker < 0) continue
    const json = sliceJsonObject(text, text.indexOf('{', marker))
    if (!json) return null
    try {
      return JSON.parse(json)
    } catch {
      return null
    }
  }
  return null
}

function findKey(value: Json, key: string, depth = 0): Json {
  if (depth > 12) return undefined
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = findKey(v, key, depth + 1)
      if (r !== undefined) return r
    }
  } else if (isObj(value)) {
    if (key in value) return value[key]
    for (const v of Object.values(value)) {
      const r = findKey(v, key, depth + 1)
      if (r !== undefined) return r
    }
  }
  return undefined
}

// 合并空白并去掉首尾空白，实体范围跟着平移；范围两端的空白收进范围外，零长度范围交给 createSink 丢弃。
function squash(text: string, ranges: readonly Range[]): { text: string; ranges: Range[] } {
  let out = ''
  // at[i]：原文第 i 个字符（含末尾位置）在结果里的位置
  const at: number[] = []
  for (const ch of text) {
    for (let k = 0; k < ch.length; k++) at.push(out.length)
    if (/\s/.test(ch)) {
      if (out && !out.endsWith(' ')) out += ' '
    } else out += ch
  }
  at.push(out.length)
  const clean = out.trimEnd()
  const pos = (i: number) => Math.min(at[Math.max(0, Math.min(i, text.length))] ?? 0, clean.length)
  return {
    text: clean,
    ranges: ranges.map(([a, b]): Range => {
      let s = pos(a)
      let e = pos(b)
      while (s < e && clean[s] === ' ') s++
      while (e > s && clean[e - 1] === ' ') e--
      return [s, e]
    }),
  }
}

interface Inline {
  text: string
  entities: Range[]
}

// Lexical 节点 → 文字；内联实体（宝石、天赋等）记录范围，后续按“站点实体”确认术语。
function lexicalText(node: Record<string, Json>, out: Inline) {
  if (node.type === 'text' && typeof node.text === 'string') out.text += node.text
  else if (node.type === 'static-data-widget' || 'groupId' in node) {
    const label = typeof node.label === 'string' ? node.label : ''
    out.entities.push([out.text.length, out.text.length + label.length])
    out.text += label
  } else if (node.type === 'linebreak') out.text += ' '
  else if (Array.isArray(node.children))
    for (const c of node.children) if (isObj(c)) lexicalText(c, out)
}

const LEXICAL_BLOCKS: Readonly<Record<string, 'paragraph' | 'heading' | 'list-item'>> = {
  paragraph: 'paragraph',
  heading: 'heading',
  listitem: 'list-item',
  quote: 'paragraph',
}

function walk(
  value: Json,
  emit: (
    kind: 'paragraph' | 'heading' | 'list-item' | 'modline' | 'item',
    text: string,
    entities: Range[],
  ) => void,
  depth = 0,
) {
  if (depth > 40) return
  if (Array.isArray(value)) {
    for (const v of value) walk(v, emit, depth + 1)
    return
  }
  if (typeof value === 'string') {
    if (value.startsWith('{"root"')) {
      try {
        walk(JSON.parse(value), emit, depth + 1)
      } catch {}
    }
    return
  }
  if (!isObj(value)) return
  const kind = typeof value.type === 'string' ? LEXICAL_BLOCKS[value.type] : undefined
  if (kind && Array.isArray(value.children)) {
    const inline: Inline = { text: '', entities: [] }
    lexicalText(value, inline)
    emit(kind, inline.text, inline.entities)
    return
  }
  const item =
    isObj(value.commonItem) && typeof value.commonItem.name === 'string'
      ? value.commonItem.name
      : null
  if (item) emit('item', item, [[0, item.length]])
  // 实测快照：词缀行在 commonItem 里（equipment.<槽位>.commonItem.explicitDescriptions）
  for (const holder of [value, value.commonItem]) {
    if (!isObj(holder)) continue
    for (const field of ['implicitDescriptions', 'explicitDescriptions']) {
      const list = holder[field]
      if (Array.isArray(list))
        for (const d of list)
          if (isObj(d) && typeof d.description === 'string') emit('modline', d.description, [])
    }
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === 'commonItem' || k === 'implicitDescriptions' || k === 'explicitDescriptions') continue
    walk(v, emit, depth + 1)
  }
}

// 攻略页是 /poe-2/<类型>/<slug>；/poe-2/builds 这类列表页没有 slug（末段只是类型名），返回空字符串
export function documentSlug(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length >= 3 ? (parts[parts.length - 1] ?? '') : ''
}

export function extractMobalytics(
  doc: Document,
  pathname: string,
): { stages: GuideStage[]; blocks: GuideBlock[] } | null {
  const slug = documentSlug(pathname)
  if (!slug) return null
  const state = readPreloadedState(doc)
  const queries = findKey(state, 'queries')
  // 实测快照：页面 slug 只在该查询的 queryKey（第 3 项起，前两项是查询名与类型名）与 data.featured.slug 里；
  // data.typeData.slug 是 'builds'。只认真正带文档数据的那项查询。
  const query = Array.isArray(queries)
    ? queries.find(
        (q) =>
          isObj(q) &&
          Array.isArray(q.queryKey) &&
          q.queryKey.slice(2).includes(slug) &&
          findKey(q, 'userGeneratedDocumentBySlug') !== undefined,
      )
    : undefined
  const wrapper = findKey(query, 'userGeneratedDocumentBySlug')
  const data = isObj(wrapper) ? wrapper.data : undefined
  if (!isObj(data)) return null
  if (isObj(data.featured) && typeof data.featured.slug === 'string' && data.featured.slug !== slug)
    return null

  // 阶段在 data.data.buildVariants
  const body = isObj(data.data) ? data.data : {}
  const variants =
    isObj(body.buildVariants) && Array.isArray(body.buildVariants.values)
      ? body.buildVariants.values.filter(isObj)
      : []
  // 阶段名与各阶段的内容组件：content 里 ContentVariants 组件的 childrenVariants[].title / childrenIds（可多层嵌套）
  const content = Array.isArray(data.content) ? data.content.filter(isObj) : []
  const byId = new Map<string, Record<string, Json>>()
  for (const c of content) if (typeof c.id === 'string') byId.set(c.id, c)
  const titles = new Map<string, string>()
  const stageOf = new Map<string, string>()
  for (const c of content) {
    const list =
      isObj(c.data) && Array.isArray(c.data.childrenVariants) ? c.data.childrenVariants : []
    for (const v of list) {
      if (!isObj(v) || typeof v.id !== 'string') continue
      const stageId = v.id
      if (typeof v.title === 'string' && v.title.trim()) titles.set(stageId, v.title.trim())
      const stack: Json[] = Array.isArray(v.childrenIds) ? [...v.childrenIds] : []
      while (stack.length) {
        const id = stack.pop()
        if (typeof id !== 'string' || stageOf.has(id)) continue
        stageOf.set(id, stageId)
        const child = byId.get(id)
        if (child && isObj(child.data) && Array.isArray(child.data.childrenIds))
          stack.push(...child.data.childrenIds)
      }
    }
  }
  const selected = doc.querySelector('[role="tab"][aria-selected="true"]')?.id ?? ''
  const stages: GuideStage[] = variants.map((v, i) => {
    const id = typeof v.id === 'string' ? v.id : `stage-${i}`
    const name =
      titles.get(id) ??
      [v.title, v.name, v.label].find(
        (x): x is string => typeof x === 'string' && x.trim() !== '',
      ) ??
      `阶段 ${i + 1}`
    return { id, name, current: false }
  })
  const current = stages.find((s) => selected.includes(s.id)) ?? stages[0]
  if (current) current.current = true

  const sink = createSink()
  const emitters = new Map<string, ReturnType<typeof makeEmitter>>()
  const emitter = (stageId?: string) => {
    const key = stageId ?? ''
    const found = emitters.get(key)
    if (found) return found
    const made = makeEmitter(stageId)
    emitters.set(key, made)
    return made
  }
  const makeEmitter = (stageId?: string) => {
    const seen = new Set<string>()
    return (
      kind: 'paragraph' | 'heading' | 'list-item' | 'modline' | 'item',
      text: string,
      entities: Range[],
    ) => {
      const { text: clean, ranges } = squash(text, entities)
      const extra = { ...(stageId ? { stageId } : {}), entities: ranges }
      if (kind === 'item' || kind === 'modline') {
        const key = `${kind}:${clean}`
        if (seen.has(key)) return
        seen.add(key)
      }
      sink.add(kind === 'item' ? 'heading' : kind, clean, extra)
    }
  }
  const known = new Set(stages.map((st) => st.id))
  for (const c of content) {
    const stageId = typeof c.id === 'string' ? stageOf.get(c.id) : undefined
    walk(c, emitter(stageId && known.has(stageId) ? stageId : undefined))
  }
  for (const [i, v] of variants.entries()) walk(v, emitter(stages[i]?.id))
  return { stages, blocks: sink.blocks }
}
