// @vitest-environment node
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { check } from '../scripts/check.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'coe-package-test-'))
  roots.push(root)
  const dist = path.join(root, 'dist')
  await mkdir(path.join(dist, 'assets'), { recursive: true })
  await mkdir(path.join(dist, 'icons'))
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: manifest.version }))
  const files = {
    'manifest.json': JSON.stringify(manifest),
    'popup.html':
      '<script src="./assets/popup-test.js"></script><link href="./assets/popup-test.css">',
    'content.js': 'void 0;',
    'assets/popup-test.js': 'void 0;',
    'assets/popup-test.css': '',
    'LICENSE.txt': 'fixture license',
    'NOTICE.txt': 'fixture notice',
    'assets/dictionary.json': JSON.stringify({
      schemaVersion: 1,
      locale: 'zh-CN',
      terms: [
        { id: 'test', en: 'Test', zh: '测试', domain: 'ui', source: 'test', version: 'test' },
      ],
    }),
  }
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(dist, name), value)
  for (const icon of Object.values(manifest.icons))
    await copyFile(new URL(`../public/${icon}`, import.meta.url), path.join(dist, icon))
  return { root, dist }
}
it('接受完整入口、双popup资源和许可说明', async () => {
  const { root } = await fixture()
  await expect(check(root)).resolves.toMatchObject({ root })
})
it.each(['debug.js', 'private.json', 'notes.txt', 'assets/popup-old.js'])(
  '拒绝额外产物 %s',
  async (name) => {
    const { root, dist } = await fixture()
    await writeFile(path.join(dist, name), 'test-only')
    await expect(check(root)).rejects.toThrow('意外打包文件')
  },
)
it.each(['LICENSE.txt', 'NOTICE.txt'])('拒绝缺少 %s', async (name) => {
  const { root, dist } = await fixture()
  await rm(path.join(dist, name))
  await expect(check(root)).rejects.toThrow('缺少打包文件')
})
it('拒绝伪装为必需文件的符号链接', async () => {
  const { root, dist } = await fixture()
  await rm(path.join(dist, 'NOTICE.txt'))
  await symlink(path.join(dist, 'LICENSE.txt'), path.join(dist, 'NOTICE.txt'))
  await expect(check(root)).rejects.toThrow('不允许打包符号链接')
})

it('拒绝额外目录链接与popup多余引用', async () => {
  const { root, dist } = await fixture()
  await symlink(path.join(dist, 'icons'), path.join(dist, 'linked-icons'))
  await expect(check(root)).rejects.toThrow('不允许打包符号链接')
  await rm(path.join(dist, 'linked-icons'))
  const popup = path.join(dist, 'popup.html')
  await writeFile(
    popup,
    `${await readFile(popup, 'utf8')}<script src="./assets/popup-extra.js"></script>`,
  )
  await writeFile(path.join(dist, 'assets/popup-extra.js'), 'void 0;')
  await expect(check(root)).rejects.toThrow('popup 构建资源集合不符合约定')
})
