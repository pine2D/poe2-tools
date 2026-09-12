import { sha256 } from '../util/json'

/** 仅隔离已经人工核对的上游坏记录；匹配名称与完整声明哈希后才处理。 */
export function excludeDeclaration(source: string, name: string, expectedHash: string): string {
  const marker = `itemBases["${name}"] = {`
  const start = source.indexOf(marker)
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0)
    throw new Error(`异常记录定位失败：${name}`)
  const next = source.indexOf('\nitemBases[', start + marker.length)
  const end = next < 0 ? source.search(/\n\s*end\s*$/) : next + 1
  if (end < start || sha256(source.slice(start, end)) !== expectedHash)
    throw new Error(`异常记录内容已改变，请重新复核：${name}`)
  return source.slice(0, start) + source.slice(end)
}
