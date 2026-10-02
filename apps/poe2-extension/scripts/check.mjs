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

// 弹窗里唯一允许的外链：“检查更新”打开网站介绍页（只是导航，扩展不发请求）
export const POPUP_LINKS = ['https://poe2-tools.pine2d.com/extension/']
// 下面识别引用属性的口径一致：属性名前只要不是字母、数字、_、-（空白、引号、/、: 都算），等号两侧可有空白，
// 这样 src = "…"、id="x"href="…"、<a/href="…">、xlink:href="…" 都会被识别。
// src/href 以外能让页面发请求的属性，弹窗里一律不允许
const OTHER_REFERENCE_ATTRS =
  /(?<![\w-])(srcset|imagesrcset|poster|action|formaction|ping|data|background|http-equiv)\s*=/i

/** popup.html 的资源与链接：script/link 只能引用包内 ./assets/，a 只能指向 POPUP_LINKS；返回包内资源路径 */
export function popupReferences(html) {
  const other = html.match(OTHER_REFERENCE_ATTRS)
  if (other) throw new Error(`popup 含不允许的引用属性：${other[1]}`)
  if (/url\(|@import|image-set\(/i.test(html)) throw new Error('popup 含内联样式引用')
  const total = [...html.matchAll(/(?<![\w-])(?:src|href)\s*=/gi)].length
  const resources = []
  let seen = 0
  for (const [, tag, value] of html.matchAll(
    /<([a-z]+)\b[^>]*?(?<![\w-])(?:src|href)\s*=\s*"([^"]*)"/gi,
  )) {
    seen += 1
    if (tag.toLowerCase() === 'a') {
      if (!POPUP_LINKS.includes(value)) throw new Error(`popup 含未登记的链接：${value}`)
      continue
    }
    if (
      !['script', 'link'].includes(tag.toLowerCase()) ||
      !value.startsWith('./assets/') ||
      value.includes('..', 2)
    )
      throw new Error('popup 含外部资源')
    resources.push(value.slice(2))
  }
  if (seen !== total) throw new Error('popup 含无法识别的资源引用')
  return resources
}

/** 弹窗样式里的 @import、外部 url() 与引号内的外部地址（如 image-set("https://…" 1x)；http:、https:、协议相对 //）；返回命中的片段 */
export function popupStyleExternal(css) {
  return [
    ...css.matchAll(
      /@import\b[^;]*|url\(\s*['"]?(?:https?:|\/\/)[^)]*\)|(['"])\s*(?:https?:|\/\/)[^'"]*\1/gi,
    ),
  ].map((match) => match[0])
}

export function validateManifest(m, version) {
  if (m.manifest_version !== 3 || m.version !== version || !same(m.permissions, ['storage']))
    throw new Error('Manifest 版本或权限不符合约定')
  if (typeof m.description !== 'string' || !m.description.startsWith('非官方扩展：'))
    throw new Error('Manifest 描述必须以“非官方扩展：”开头')
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
  const popupResources = popupReferences(popup)
  for (const file of popupResources) {
    const content = await readFile(path.join(dist, file), 'utf8')
    const external = file.endsWith('.css') ? popupStyleExternal(content) : []
    if (external.length > 0) throw new Error(`popup 样式含外部引用：${external.join(' ')}`)
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
  // 文件集合按实际入口核对；合法扩展名不意味着文件应随扩展发布。
  if (
    popupResources.length !== 2 ||
    popupResources.filter((file) => /^assets\/popup-[\w-]+\.js$/.test(file)).length !== 1 ||
    popupResources.filter((file) => /^assets\/popup-[\w-]+\.css$/.test(file)).length !== 1
  )
    throw new Error('popup 构建资源集合不符合约定')
  const requiredFiles = new Set([
    'manifest.json',
    'content.js',
    'popup.html',
    'LICENSE.txt',
    'NOTICE.txt',
    'assets/dictionary.json',
    ...Object.values(m.icons),
    ...popupResources,
  ])
  const files = await readdir(dist, { recursive: true, withFileTypes: true })
  for (const entry of files) {
    const file = path
      .relative(dist, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join('/')
    if (entry.isSymbolicLink()) throw new Error(`不允许打包符号链接：${file}`)
    if (entry.isDirectory() && ['assets', 'icons'].includes(file)) continue
    if (!entry.isFile() || !requiredFiles.delete(file)) throw new Error(`意外打包文件：${file}`)
  }
  if (requiredFiles.size) throw new Error(`缺少打包文件：${[...requiredFiles].join('、')}`)
  console.log(`扩展检查通过：${m.version}，${dict.terms.length} 条词条，仅 storage 权限`)
  return { root, dist, version: m.version }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await check()
