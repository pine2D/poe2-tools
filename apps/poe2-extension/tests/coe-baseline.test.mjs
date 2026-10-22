// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { coeUnchanged } from '../scripts/coe-unchanged.mjs'
import { storedZip } from '../scripts/zip.mjs'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'coe-baseline-'))
  roots.push(root)
  await mkdir(path.join(root, 'dist/assets'), { recursive: true })
  const names = ['content.js', 'assets/dictionary.json', 'assets/serif-sc-l1.woff2']
  const entries = names.map((name) => ({ name, data: Buffer.from(name) }))
  const zip = storedZip(entries)
  const base = path.join(root, 'base.zip')
  await writeFile(base, zip)
  const reference = {
    version: '0.4.4',
    status: 'local-unpublished',
    zipSha256: sha(zip),
    files: {},
  }
  for (const e of entries) {
    await writeFile(path.join(root, 'dist', e.name), e.data)
    reference.files[e.name] = { baselineSha256: sha(e.data), expectedSha256: sha(e.data) }
  }
  return { root, base, reference }
}
it('有摘要的本地参考可核对，但来源包被替换时拒绝', async () => {
  const { root, base, reference } = await fixture()
  const result = await coeUnchanged(root, base, reference)
  expect(result.every((e) => e.same && e.approved)).toBe(true)
  await writeFile(base, 'different')
  await expect(coeUnchanged(root, base, reference)).rejects.toThrow('基线')
})
it('只批准有理由且字节完全相符的已登记差异', async () => {
  const { root, base, reference } = await fixture()
  const file = 'assets/dictionary.json'
  await writeFile(path.join(root, 'dist', file), 'new provenance')
  let result = await coeUnchanged(root, base, reference)
  expect(result.find((e) => e.file === file).approved).toBe(false)
  reference.files[file].expectedSha256 = sha('new provenance')
  await expect(coeUnchanged(root, base, reference)).rejects.toThrow('原因')
  reference.files[file].reason = '新增来源裁决签名；词条语义逐项不变'
  result = await coeUnchanged(root, base, reference)
  expect(result.find((e) => e.file === file)).toMatchObject({ same: false, approved: true })
  await writeFile(path.join(root, 'dist', file), 'unexpected other change')
  expect((await coeUnchanged(root, base, reference)).find((e) => e.file === file).approved).toBe(
    false,
  )
})
