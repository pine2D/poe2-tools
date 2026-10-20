import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readStoredZip } from './zip.mjs'

// 对照本地未发布 0.4.4；只接受经摘要和原因登记的精确差异。
const FILES = ['content.js', 'assets/dictionary.json', 'assets/serif-sc-l1.woff2']
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const referencePath = new URL('../coe-reference.json', import.meta.url)

export async function coeUnchanged(root, baseZip, reference) {
  const ref = reference ?? JSON.parse(await readFile(referencePath, 'utf8'))
  if (
    ref.version !== '0.4.4' ||
    ref.status !== 'local-unpublished' ||
    JSON.stringify(Object.keys(ref.files).sort()) !== JSON.stringify([...FILES].sort())
  )
    throw new Error('CoE 基线身份或文件范围不合法')
  const zip = await readFile(baseZip)
  if (sha(zip) !== ref.zipSha256) throw new Error('CoE 基线包摘要不一致')
  const base = new Map(readStoredZip(zip).map((e) => [e.name, sha(e.data)]))
  const result = []
  for (const file of FILES) {
    const expected = ref.files[file]
    if (
      base.get(file) !== expected.baselineSha256 ||
      !/^[a-f0-9]{64}$/.test(expected.expectedSha256)
    )
      throw new Error(`CoE 基线文件摘要无效：${file}`)
    if (expected.expectedSha256 !== expected.baselineSha256 && !expected.reason?.trim())
      throw new Error(`CoE 预期差异缺少原因：${file}`)
    const actual = sha(await readFile(path.join(root, 'dist', file)))
    result.push({
      file,
      same: actual === base.get(file),
      approved: actual === expected.expectedSha256,
      reason: expected.reason ?? null,
    })
  }
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const base = process.argv[2] ?? path.join(root, 'artifacts/baseline/poe2-extension-0.4.4.zip')
  const result = await coeUnchanged(root, base)
  for (const e of result)
    console.log(
      `${e.approved ? (e.same ? '相同' : '已登记差异') : '未登记差异'}  ${e.file}${e.reason ? `：${e.reason}` : ''}`,
    )
  if (result.some((e) => !e.approved)) process.exitCode = 1
}
