import type { BuildFile } from './types'

export interface SerializeOptions {
  indent?: number
}

// JSON.stringify 保留对象键的插入顺序，因此键序与输入一致。
// 「无损」是 JSON 值级等价，不是字节级：数值的字面写法会归一（如 1.0 归一为 1），字符串里
// 非必需的转义序列也会归一（如反斜杠加斜杠归一为斜杠本身），这些变化不改变 JSON 值本身，
// 游戏按值读取不受影响。
export function serializeBuildFile(build: BuildFile, options: SerializeOptions = {}): string {
  return JSON.stringify(build, null, options.indent ?? 2)
}
