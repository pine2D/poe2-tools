// 构建门禁（spec §8.6、§8.7）：多页面与 404 齐全，HTML 引用的本地资源存在；字体许可文件与 NOTICE
// 含必含行；CSS 的 url() 没有外链、目标存在；图像与字体都在素材白名单里，woff2 集合与 coverage.json 相同；
// 扩展发布包（扩展发布 spec §6）与 release.json 一致，介绍页脚本里有它的下载地址。
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_EXTENSIONS,
  assertAssets,
  assertFontSetEquals,
  checkLicenseFile,
  cssUrlTargets,
  externalUrls,
  LICENSE_FILES,
  LICENSE_REQUIRED_LINES,
  loadWhitelist,
  SITE_NOTICE_REQUIRED_LINES,
  sha256,
} from '@poe2-tools/ui-theme/compliance'

// 介绍页正文里不该出现的开发向字样（扩展发布 spec §9、§11）
export const EXTENSION_PAGE_FORBIDDEN = [
  'pnpm',
  'Node',
  '构建',
  '源码 ZIP',
  'apps/poe2-extension',
  'dist/',
  '开发预览',
]

const PAGES = [
  'index.html',
  'build/index.html',
  'extension/index.html',
  'craft/index.html',
  '404.html',
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

export async function checkSite(root, options = {}) {
  // ① 五个页面
  for (const page of PAGES) {
    if (!(await exists(resolve(root, page)))) throw new Error(`缺少页面：${page}`)
  }
  // ② HTML 引用的本地资源
  for (const page of PAGES) {
    const html = await readFile(resolve(root, page), 'utf8')
    for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#?]*)[^" ]*"/g)) {
      if (path.startsWith('//')) continue
      const resource = path.endsWith('/') ? `${path}index.html` : path
      if (!(await exists(resolve(root, `.${resource}`)))) {
        throw new Error(`${page} 引用缺失资源：${resource}`)
      }
    }
  }
  // ③ 字体许可文件与 NOTICE.txt
  for (const name of LICENSE_FILES) {
    await checkLicenseFile(resolve(root, 'fonts', name), LICENSE_REQUIRED_LINES[name])
  }
  await checkLicenseFile(resolve(root, 'NOTICE.txt'), SITE_NOTICE_REQUIRED_LINES)
  // ④ CSS 的 url()：data: 跳过；外链即失败；/ 开头按 dist 根解析，其余按 CSS 所在目录解析，目标必须存在
  const assetsDir = resolve(root, 'assets')
  const assetFiles = (await exists(assetsDir)) ? await filesUnder(assetsDir) : []
  for (const cssPath of assetFiles.filter((path) => path.endsWith('.css'))) {
    const css = await readFile(cssPath, 'utf8')
    const external = externalUrls(css)
    if (external.length > 0)
      throw new Error(`${relative(root, cssPath)} 有外链 url()：${external.join(' ')}`)
    for (const target of cssUrlTargets(css)) {
      if (target.startsWith('data:')) continue
      const clean = target.replace(/[?#].*$/, '')
      const file = clean.startsWith('/') ? join(root, clean) : resolve(dirname(cssPath), clean)
      if (!(await exists(file))) {
        throw new Error(`${relative(root, cssPath)} 的 url() 目标不存在：${target}`)
      }
    }
  }
  // ⑤ dist 里的图像与字体按 dist 模式做白名单判定
  const whitelist = await loadWhitelist({
    coveragePath: options.coveragePath,
    dataSourcesPath: options.dataSourcesPath,
  })
  const assets = []
  for (const path of await filesUnder(root)) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (!ASSET_EXTENSIONS.includes(ext)) continue
    assets.push({
      path: relative(root, path).split(sep).join('/'),
      sha256: sha256(await readFile(path)),
    })
  }
  assertAssets(assets, whitelist, 'dist')
  // ⑥ dist/assets/*.woff2 与 coverage.json 完全相同（扩展的弹窗子集与注入衬线子集除外，见 assertFontSetEquals）
  const woff2 = []
  for (const path of assetFiles.filter((file) => file.endsWith('.woff2'))) {
    woff2.push(sha256(await readFile(path)))
  }
  assertFontSetEquals(woff2, whitelist)
  // ⑦ 扩展发布包
  const release =
    options.release ??
    JSON.parse(
      await readFile(new URL('../../poe2-extension/release.json', import.meta.url), 'utf8'),
    )
  await checkExtensionDownload(root, release)
}

// dist/downloads/ 恰好一个 zip，文件名、字节数、SHA-256 与 release.json 一致；介绍页 HTML 不含开发向字样，
// 介绍页由脚本渲染，下载地址在入口脚本及其预加载的 chunk 里
export async function checkExtensionDownload(root, release) {
  const dir = resolve(root, 'downloads')
  const names = (await exists(dir))
    ? (await filesUnder(dir)).map((path) => relative(dir, path).split(sep).join('/'))
    : []
  if (names.length !== 1 || names[0] !== release.file) {
    throw new Error(`downloads/ 应只有 ${release.file}，实际：${names.join('、') || '（空）'}`)
  }
  const zip = await readFile(join(dir, release.file))
  if (zip.length !== release.bytes || sha256(zip) !== release.sha256) {
    throw new Error(`downloads/${release.file} 与 release.json 的字节数或 SHA-256 不一致`)
  }
  const html = await readFile(resolve(root, 'extension/index.html'), 'utf8')
  // 只查用户可见的文字（title、meta 的 content、noscript）：先去掉 src/href 的属性值，哈希文件名里的字母组合不算
  const visible = html.replace(/\s(?:src|href)="[^"]*"/g, '')
  for (const word of EXTENSION_PAGE_FORBIDDEN) {
    if (visible.includes(word)) throw new Error(`extension/index.html 含开发向字样：${word}`)
  }
  let code = ''
  for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.js)"/g)) {
    code += await readFile(resolve(root, `.${path}`), 'utf8')
  }
  if (!code.includes('/downloads/') || !code.includes(release.file)) {
    throw new Error(`扩展介绍页的脚本里没有 /downloads/${release.file} 的下载地址`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkSite(fileURLToPath(new URL('../dist/', import.meta.url)))
  console.log('网站入口、404、静态资源引用、字体许可、素材白名单与扩展发布包检查通过')
}
