import type { BuildFile } from './types'

export interface SerializeOptions {
  indent?: number
}

// JSON.stringify 保留对象键的插入顺序，因此键序与输入一致。
export function serializeBuildFile(build: BuildFile, options: SerializeOptions = {}): string {
  return JSON.stringify(build, null, options.indent ?? 2)
}
