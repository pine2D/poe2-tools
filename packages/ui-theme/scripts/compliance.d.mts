// compliance.mjs 的类型声明（手写，与实现逐项对应；契约 §3.6）
export declare const REPO_ROOT: string
export declare const FULL_DISCLAIMER: '非官方工具，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。'
export declare const LICENSE_FILES: readonly [
  'NotoSerifSC-OFL.txt',
  'NotoSerifTC-OFL.txt',
  'Cinzel-OFL.txt',
]
export type LicenseFile = 'NotoSerifSC-OFL.txt' | 'NotoSerifTC-OFL.txt' | 'Cinzel-OFL.txt'
/** spec §8.6 的必含行，逐字、按子串判定 */
export declare const LICENSE_REQUIRED_LINES: Readonly<Record<LicenseFile, readonly string[]>>
/** 网站 NOTICE.txt 必含：FULL_DISCLAIMER、'/fonts/NotoSerifSC-OFL.txt'、'/fonts/NotoSerifTC-OFL.txt'、'/fonts/Cinzel-OFL.txt' */
export declare const SITE_NOTICE_REQUIRED_LINES: readonly string[]
export declare const ASSET_EXTENSIONS: readonly [
  'png',
  'jpg',
  'webp',
  'gif',
  'svg',
  'woff',
  'woff2',
  'ttf',
  'otf',
]
/** 扩展弹窗专用字体分片：只由 fonts/popup.css 引用，不进 fonts.css；assertFontSetEquals 不把它计入网站产物 */
export declare const POPUP_FONT_FILE: 'serif-sc-popup.woff2'
/** CoE 注入界面的中文衬线子集：内容脚本以 FontFace 注册，不进 fonts.css；assertFontSetEquals 不把它计入网站产物 */
export declare const L1_FONT_FILE: 'serif-sc-l1.woff2'
/** 内容脚本注册 L1 子集时用的 family 名 */
export declare const L1_FONT_FAMILY: 'PoE2 Serif SC L1'
/** L1 子集体积上限（字节）：build-fonts.mjs 退出码 4，扩展 check.mjs 复查 */
export declare const L1_FONT_BUDGET: 131072
/** 只属于扩展的字体分片 */
export declare const EXTENSION_FONT_FILES: readonly ['serif-sc-popup.woff2', 'serif-sc-l1.woff2']
/** spec §8.5 的检测正则 /url\(\s*['"]?\s*(?:https?:)?\/\//i */
export declare const EXTERNAL_URL_RE: RegExp
export declare function sha256(data: Uint8Array | string): string
export declare function missingLines(text: string, required: readonly string[]): string[]
/** 缺行时抛 Error，消息列出 name 与缺失的每一行 */
export declare function assertLicenseText(
  name: string,
  text: string,
  required: readonly string[],
): void
/** 文件缺失或缺行时抛 Error */
export declare function checkLicenseFile(path: string, required: readonly string[]): Promise<void>
/** CSS 中全部 url() 目标（去引号与首尾空白，保持出现顺序） */
export declare function cssUrlTargets(css: string): string[]
/** 命中 EXTERNAL_URL_RE 的 url() 片段；data:image/svg+xml 内部的 xmlns 不算 */
export declare function externalUrls(css: string): string[]

export interface FontSources {
  commit: string
  files: ReadonlyMap<string, string>
}
export declare function parseFontSources(dataSourcesMd: string): FontSources
/** 一级字表登记：'packages/ui-theme/scripts/tongyong-level1.txt' 的 SHA-256 */
export declare function parseLevel1Registration(dataSourcesMd: string): string
/** 第 3 类白名单：路径 → SHA-256（一期为空表） */
export declare function parseRegisteredAssets(dataSourcesMd: string): ReadonlyMap<string, string>

export interface Whitelist {
  /** 第 1 类：coverage.json 的分片文件名 → SHA-256 */
  fontShards: ReadonlyMap<string, string>
  /** 第 2 类：仓库路径 → SHA-256（generated/*.svg 与 apps/site/public/favicon.svg） */
  motifSvgs: ReadonlyMap<string, string>
  /** 第 3 类：仓库路径 → SHA-256 */
  registered: ReadonlyMap<string, string>
}
export interface WhitelistPaths {
  repoRoot?: string
  coveragePath?: string
  dataSourcesPath?: string
}
export declare function loadWhitelist(paths?: WhitelistPaths): Promise<Whitelist>
export type AssetMode = 'repo' | 'dist'
/** repo 模式 path 相对仓库根 */
export interface AssetEntry {
  path: string
  sha256: string
}
/** repo 模式：第 1 类还要求路径在 packages/ui-theme/fonts/ 下且文件名匹配；第 2 类要求路径即登记的生成物；第 3 类路径与哈希同时匹配。dist 模式只比 SHA-256。woff/ttf/otf 恒为 null */
export declare function classifyAsset(
  entry: AssetEntry,
  whitelist: Whitelist,
  mode: AssetMode,
): 1 | 2 | 3 | null
/** 任一为 null 即抛 Error，列出路径与 SHA-256 */
export declare function assertAssets(
  entries: readonly AssetEntry[],
  whitelist: Whitelist,
  mode: AssetMode,
): void
/** 网站 dist：dist/assets/*.woff2 的 SHA-256 集合必须与 coverage.json 完全相同；扩展的两片（EXTENSION_FONT_FILES）不计入 */
export declare function assertFontSetEquals(
  distWoff2Shas: readonly string[],
  whitelist: Whitelist,
): void
