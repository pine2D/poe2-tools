import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { L1_FONT_FILE } from '@poe2-tools/ui-theme/compliance'
import { build } from 'vite'
import { buildDictionary } from './build-dictionary.mjs'
import { noticeText } from './notice.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
await rm(path.join(root, 'dist'), { recursive: true, force: true })
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: path.join(root, 'src/content/index.ts'),
      name: 'Poe2Chinese',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
})
await build({
  configFile: false,
  root,
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    assetsInlineLimit: 0,
    rollupOptions: { input: path.join(root, 'popup.html') },
  },
})
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (manifest.version !== pkg.version) throw new Error('扩展版本不一致')
await writeFile(path.join(root, 'dist/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await buildDictionary(path.resolve(root, '../..'), path.join(root, 'dist/assets/dictionary.json'), {
  allowGray: !process.argv.includes('--no-gray'),
})

await copyFile(path.resolve(root, '../../LICENSE'), path.join(root, 'dist/LICENSE.txt'))
// 弹窗字体的许可文件随包发布（spec §7.6）
await copyFile(
  path.resolve(root, '../../packages/ui-theme/fonts/LICENSES/NotoSerifSC-OFL.txt'),
  path.join(root, 'dist/NotoSerifSC-OFL.txt'),
)
// CoE 注入界面的中文衬线子集（扩展 0.4.0）：固定路径、不带哈希，由 manifest 的 web_accessible_resources 开放给内容脚本 fetch；
// 不经 Vite（lib 模式会把导入的字体内联成 base64 打进 content.js）。与弹窗子集同属 Noto Serif SC，许可文件共用上面这一份
await copyFile(
  path.resolve(root, '../../packages/ui-theme/fonts', L1_FONT_FILE),
  path.join(root, 'dist/assets', L1_FONT_FILE),
)
await writeFile(path.join(root, 'dist/NOTICE.txt'), noticeText(manifest.version))

await mkdir(path.join(root, 'dist/icons'), { recursive: true })
for (const file of Object.values(manifest.icons))
  await copyFile(path.join(root, 'public', file), path.join(root, 'dist', file))
