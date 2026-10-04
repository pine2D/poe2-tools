// @vitest-environment node
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sha256 } from '@poe2-tools/ui-theme/compliance'
import { afterEach, expect, it } from 'vitest'
import { assertL1Font, check } from '../scripts/check.mjs'
import { noticeText } from '../scripts/notice.mjs'
import { verifyZip } from '../scripts/package.mjs'
import { storedZip } from '../scripts/zip.mjs'

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
    'assets/popup-test.css':
      'h1{font-family:x}@font-face{font-family:x;src:url(./serif-sc-popup-test.woff2)}',
    'LICENSE.txt': 'fixture license',
    'NOTICE.txt': noticeText(manifest.version),
    'assets/dictionary.json': JSON.stringify({
      schemaVersion: 1,
      locale: 'zh-CN',
      terms: [
        { id: 'test', en: 'Test', zh: '测试', domain: 'ui', source: 'test', version: 'test' },
      ],
    }),
  }
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(dist, name), value)
  const theme = new URL('../../../packages/ui-theme/', import.meta.url)
  await copyFile(
    new URL('fonts/LICENSES/NotoSerifSC-OFL.txt', theme),
    path.join(dist, 'NotoSerifSC-OFL.txt'),
  )
  await copyFile(
    new URL('fonts/serif-sc-popup.woff2', theme),
    path.join(dist, 'assets/serif-sc-popup-test.woff2'),
  )
  await copyFile(
    new URL('fonts/serif-sc-l1.woff2', theme),
    path.join(dist, 'assets/serif-sc-l1.woff2'),
  )
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
it.each([
  'LICENSE.txt',
  'NOTICE.txt',
  'NotoSerifSC-OFL.txt',
  'assets/serif-sc-popup-test.woff2',
  'assets/serif-sc-l1.woff2',
])('拒绝缺少 %s', async (name) => {
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

it('拒绝 popup 样式没引用的 woff2', async () => {
  const { root, dist } = await fixture()
  await copyFile(
    path.join(dist, 'assets/serif-sc-popup-test.woff2'),
    path.join(dist, 'assets/extra.woff2'),
  )
  await expect(check(root)).rejects.toThrow('意外打包文件：assets/extra.woff2')
})
it('拒绝弹窗引用独立子集以外的字体（如网站 shard0）', async () => {
  const { root, dist } = await fixture()
  await copyFile(
    new URL('../../../packages/ui-theme/fonts/serif-sc-0.woff2', import.meta.url),
    path.join(dist, 'assets/serif-sc-popup-test.woff2'),
  )
  await expect(check(root)).rejects.toThrow('popup 字体必须恰好是 serif-sc-popup.woff2')
})
it('拒绝内容与 coverage.json 登记不符的注入衬线子集（扩展 0.4.0）', async () => {
  const { root, dist } = await fixture()
  await copyFile(
    new URL('../../../packages/ui-theme/fonts/serif-sc-popup.woff2', import.meta.url),
    path.join(dist, 'assets/serif-sc-l1.woff2'),
  )
  await expect(check(root)).rejects.toThrow('注入字体必须恰好是 serif-sc-l1.woff2')
})
it('assertL1Font：哈希一致且不超预算才放行', () => {
  const data = Buffer.from('l1-font')
  const whitelist = {
    fontShards: new Map([['serif-sc-l1.woff2', sha256(data)]]),
    motifSvgs: new Map(),
    registered: new Map(),
  }
  expect(() => assertL1Font(data, whitelist, data.length)).not.toThrow()
  expect(() => assertL1Font(data, whitelist, data.length - 1)).toThrow('超出预算')
  expect(() => assertL1Font(Buffer.from('other'), whitelist, 1_000)).toThrow(
    '注入字体必须恰好是 serif-sc-l1.woff2',
  )
})
it('拒绝 popup 样式里的外链 url() 与包外引用', async () => {
  const { root, dist } = await fixture()
  const css = path.join(dist, 'assets/popup-test.css')
  await writeFile(css, '@font-face{src:url(https://fonts.example.com/a.woff2)}')
  await expect(check(root)).rejects.toThrow('popup 样式含外部引用')
  await writeFile(css, '@font-face{src:url(../icons/icon-16.png)}')
  await expect(check(root)).rejects.toThrow('popup 样式含不允许的引用')
})
it('拒绝缺版权行的字体许可与缺声明的 NOTICE', async () => {
  const { root, dist } = await fixture()
  const ofl = path.join(dist, 'NotoSerifSC-OFL.txt')
  await writeFile(
    ofl,
    (await readFile(ofl, 'utf8')).replaceAll('Copyright 2012 Google Inc. All Rights Reserved.', ''),
  )
  await expect(check(root)).rejects.toThrow('缺少必含行')
  const again = await fixture()
  await writeFile(path.join(again.dist, 'NOTICE.txt'), 'PoE2 中文助手 0.3.0\n')
  await expect(check(again.root)).rejects.toThrow('缺少必含行')
})
it('拒绝白名单外的图像（同名图标换了内容）', async () => {
  const { root, dist } = await fixture()
  const icon = path.join(dist, 'icons/icon-16.png')
  await writeFile(icon, Buffer.concat([await readFile(icon), Buffer.from([0])]))
  await expect(check(root)).rejects.toThrow('素材白名单')
})
it('打包后复核：条目集合必须与 dist 相同，图像过白名单', async () => {
  const { root, dist } = await fixture()
  const { files } = await check(root)
  const entries = await Promise.all(
    files.map(async (name) => ({ name, data: await readFile(path.join(dist, name)) })),
  )
  await expect(verifyZip(storedZip(entries), files)).resolves.toBeUndefined()
  await expect(verifyZip(storedZip(entries.slice(1)), files)).rejects.toThrow(
    'ZIP 条目与 dist 不一致',
  )
  const bad = entries.map((e) =>
    e.name === 'icons/icon-16.png' ? { ...e, data: Buffer.concat([e.data, Buffer.from([0])]) } : e,
  )
  await expect(verifyZip(storedZip(bad), files)).rejects.toThrow('素材白名单')
})
