import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readStoredZip } from './zip.mjs'

// 攻略功能发版前核对 CoE 的三个产物；基线必须是已发布的 0.4.1 包。
const FILES = ['content.js', 'assets/dictionary.json', 'assets/serif-sc-l1.woff2']
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const BASE_SHA256 = 'bd7237918778dba09243572fce2038a1b8b7949ceb5fe6f9942c13a666b3cc52'

export async function coeUnchanged(root, baseZip) {
  const zip = await readFile(baseZip)
  if (sha(zip) !== BASE_SHA256) throw new Error(`基线不是已发布的 0.4.1 包：${baseZip}`)
  const base = new Map(readStoredZip(zip).map((entry) => [entry.name, sha(entry.data)]))
  const result = []
  for (const file of FILES)
    result.push({
      file,
      same: base.get(file) === sha(await readFile(path.join(root, 'dist', file))),
    })
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const base = process.argv[2] ?? path.join(root, 'artifacts/baseline/poe2-extension-0.4.1.zip')
  const result = await coeUnchanged(root, base)
  for (const entry of result) console.log(`${entry.same ? '相同' : '不同'}  ${entry.file}`)
  if (result.some((entry) => !entry.same)) process.exitCode = 1
}
