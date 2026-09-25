import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { check } from '../scripts/check.mjs'

const roots = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const term = {
  id: 'res',
  en: '#% Resistance',
  zh: '抗性 #%',
  domain: 'stat',
  source: 'synthetic',
  version: 'test',
}
async function fixture(terms) {
  const root = await mkdtemp(path.join(tmpdir(), 'coe-package-test-'))
  roots.push(root)
  await mkdir(path.join(root, 'dist/assets'), { recursive: true })
  const manifest = JSON.parse(
    await readFile(path.resolve(import.meta.dirname, '../manifest.json'), 'utf8'),
  )
  for (const [file, value] of Object.entries({
    'package.json': JSON.stringify({ version: manifest.version }),
    'dist/manifest.json': JSON.stringify(manifest),
    'dist/content.js': 'void 0;',
    'dist/popup.html': '<html><body>测试</body></html>',
    'dist/assets/dictionary.json': JSON.stringify({ schemaVersion: 1, locale: 'zh-CN', terms }),
  }))
    await writeFile(path.join(root, file), value)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  return root
}
it('包检查拒绝浏览器无法加载的数字模板，不能只检查身份', async () => {
  const root = await fixture([{ ...term, zh: '没有数值' }])
  await expect(check(root)).rejects.toThrow('数字模板不一致')
})
it('包检查拒绝无效的数值重排与缺失来源', async () => {
  for (const change of [{ order: [1] }, { source: '' }]) {
    const root = await fixture([{ ...term, ...change }])
    await expect(check(root)).rejects.toThrow()
  }
})
it('包检查允许实际可加载的词缀及带字面井号的界面文案', async () => {
  const root = await fixture([
    term,
    { ...term, id: 'stored', en: '# Stored', zh: '保存数量', domain: 'ui' },
  ])
  await expect(check(root)).resolves.toMatchObject({ root })
})
