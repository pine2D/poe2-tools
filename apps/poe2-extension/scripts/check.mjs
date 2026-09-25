import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { build } from 'vite'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// 使用与浏览器相同的核心校验；仅在 Node 检查进程内编译，不写入扩展产物。
let lexiconModule
async function loadLexiconModule() {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve(import.meta.dirname, '../../../packages/l10n-core/src/index.ts'),
        formats: ['es'],
      },
    },
  })
  const output = Array.isArray(result) ? result[0] : result
  const entry = output.output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
  if (!entry) throw new Error('无法加载词典核心校验')
  return import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`)
}

export function validateManifest(m, version) {
  if (m.manifest_version !== 3 || m.version !== version || !same(m.permissions, ['storage']))
    throw new Error('Manifest 版本或权限不符合约定')
  for (const field of [
    'host_permissions',
    'optional_permissions',
    'optional_host_permissions',
    'background',
    'externally_connectable',
    'devtools_page',
  ])
    if (m[field]) throw new Error(`不允许 ${field}`)
  const icons = Object.fromEntries(
    [16, 32, 48, 128].map((size) => [size, `icons/icon-${size}.png`]),
  )
  if (!same(m.icons, icons) || !same(m.action?.default_icon, icons))
    throw new Error('扩展图标路径不符合约定')
  const scripts = m.content_scripts
  if (
    scripts?.length !== 1 ||
    !same(scripts[0].matches, ['https://beta.craftofexile.com/*']) ||
    !same(scripts[0].js, ['content.js']) ||
    scripts[0].all_frames !== false ||
    scripts[0].run_at !== 'document_idle' ||
    (scripts[0].world && scripts[0].world !== 'ISOLATED') ||
    scripts[0].match_about_blank ||
    scripts[0].match_origin_as_fallback
  )
    throw new Error('内容脚本范围发生变化')
  if (
    m.action?.default_popup !== 'popup.html' ||
    !same(m.web_accessible_resources, [
      { resources: ['assets/dictionary.json'], matches: ['https://beta.craftofexile.com/*'] },
    ])
  )
    throw new Error('扩展入口或公开资源范围发生变化')
}
export async function check(root = fileURLToPath(new URL('../', import.meta.url))) {
  const dist = path.join(root, 'dist')
  const m = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  validateManifest(m, pkg.version)
  for (const [size, file] of Object.entries(m.icons)) {
    const png = await readFile(path.join(dist, file))
    if (
      png.length < 33 ||
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(8) !== 13 ||
      png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== Number(size) ||
      png.readUInt32BE(20) !== Number(size)
    )
      throw new Error(`图标 PNG 头或尺寸错误：${file}`)
  }
  const content = await readFile(path.join(dist, 'content.js'), 'utf8')
  new vm.Script(content)
  if (/^\s*(?:import|export)\s/m.test(content)) throw new Error('内容脚本必须独立执行')
  const popup = await readFile(path.join(dist, 'popup.html'), 'utf8')
  for (const match of popup.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!match[1].startsWith('./assets/') || match[1].includes('..', 2))
      throw new Error('popup 含外部资源')
    await readFile(path.join(dist, match[1]))
  }
  const dict = JSON.parse(await readFile(path.join(dist, 'assets/dictionary.json'), 'utf8'))
  if (
    dict.schemaVersion !== 1 ||
    dict.locale !== 'zh-CN' ||
    !Array.isArray(dict.terms) ||
    !dict.terms.length ||
    new Set(dict.terms.map((t) => t.id)).size !== dict.terms.length
  )
    throw new Error('词典格式或身份不合法')
  lexiconModule ??= loadLexiconModule()
  const { createLexicon } = await lexiconModule
  createLexicon(dict.terms)
  const files = await readdir(dist, { recursive: true, withFileTypes: true })
  for (const entry of files)
    if (entry.isFile() && !/\.(?:json|js|css|html|txt|png)$/.test(entry.name))
      throw new Error(`意外打包文件：${entry.name}`)
  console.log(`扩展检查通过：${m.version}，${dict.terms.length} 条词条，仅 storage 权限`)
  return { root, dist, version: m.version }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await check()
