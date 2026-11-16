import type { BuildFile } from './types'

export type ParseResult = { ok: true; build: BuildFile } | { ok: false; error: string }

// 宽松校验：只拒绝非 JSON 与非对象根；其余字段形态在使用处按需判断。
export function parseBuildFile(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `不是合法 JSON：${message}` }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: '文件内容不是有效的构筑对象' }
  }
  return { ok: true, build: data as BuildFile }
}
