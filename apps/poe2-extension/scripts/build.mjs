import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { buildDictionary } from './build-dictionary.mjs'

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
await writeFile(
  path.join(root, 'dist/NOTICE.txt'),
  `PoE2 中文助手 ${manifest.version} 开发预览版
这是非官方扩展，与 Craft of Exile、Grinding Gear Games、腾讯无隶属关系。
MIT 仅覆盖自有代码；游戏文本权利归相应权利人。
术语来源、快照版本与哈希见 assets/dictionary.json 的 sources。
数据来源登记：https://github.com/pine2D/poe2-tools/blob/feat/coe-chrome-extension/docs/data-sources.md
安装说明：https://github.com/pine2D/poe2-tools/blob/feat/coe-chrome-extension/docs/chrome-extension/install.md
仅保存本机开关，不保存装备全文或搜索记录；不读取剪贴板、不向第三方请求词典。
Chrome 管理页禁用/卸载后，请刷新已有 CoE 标签页。
`,
)
