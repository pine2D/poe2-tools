import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// 生成物统一格式：两空格缩进、末尾换行，保证重复构建 diff 干净
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, stableJson(value), 'utf8')
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export function countPlaceholders(text: string): number {
  return (text.match(/#/g) ?? []).length
}
