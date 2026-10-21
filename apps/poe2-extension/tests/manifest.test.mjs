// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { MANIFEST_KEY, validateManifest } from '../scripts/check.mjs'

const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/icon-${size}.png`]))
const manifest = {
  icons,
  manifest_version: 3,
  version: '0.1.0',
  key: MANIFEST_KEY,
  description: '非官方扩展：为新版 Craft of Exile 的 PoE2 页面提供国服简体术语显示。',
  minimum_chrome_version: '116',
  permissions: ['storage', 'activeTab', 'scripting', 'sidePanel'],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  },
  background: { service_worker: 'background.js' },
  action: { default_popup: 'popup.html', default_icon: icons },
  content_scripts: [
    {
      matches: ['https://beta.craftofexile.com/*'],
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/dictionary.json', 'assets/serif-sc-l1.woff2'],
      matches: ['https://beta.craftofexile.com/*'],
    },
  ],
}
it('仅准许固定域、单个隔离内容入口和 storage', () =>
  expect(() => validateManifest(manifest, '0.1.0')).not.toThrow())
it('禁止增加网络、剪贴板、主世界、后台权限和版本漂移', () => {
  for (const change of [
    { permissions: ['storage', 'clipboardRead'] },
    { host_permissions: ['<all_urls>'] },
    { background: { service_worker: 'worker.js' } },
    { version: '0.2.0' },
    { content_scripts: [{ ...manifest.content_scripts[0], world: 'MAIN' }] },
  ])
    expect(() => validateManifest({ ...manifest, ...change }, '0.1.0')).toThrow()
})

it('拒绝缺失或外部图标路径', () => {
  for (const icons of [undefined, { 128: 'https://example.com/icon.png' }])
    expect(() => validateManifest({ ...manifest, icons }, '0.1.0')).toThrow()
})

it('描述必须以“非官方扩展：”开头', () => {
  for (const description of [
    undefined,
    '为新版 Craft of Exile 提供国服术语。',
    ' 非官方扩展：前置空格',
  ])
    expect(() => validateManifest({ ...manifest, description }, '0.1.0')).toThrow('非官方扩展：')
})

it('权限必须恰为 storage、activeTab、scripting、sidePanel；tabs 与额外权限一律拒绝', () => {
  for (const permissions of [
    ['storage'],
    ['storage', 'activeTab', 'scripting'],
    ['storage', 'activeTab', 'scripting', 'sidePanel', 'tabs'],
    ['storage', 'activeTab', 'scripting', 'sidePanel', 'contextMenus'],
    ['sidePanel', 'scripting', 'activeTab', 'storage'],
  ])
    expect(() => validateManifest({ ...manifest, permissions }, '0.1.0')).toThrow(
      'Manifest 版本或权限不符合约定',
    )
})

it('入库 manifest.json 的 permissions 恰为四项，没有 host 与可选权限', () => {
  const real = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  expect(real.permissions).toEqual(['storage', 'activeTab', 'scripting', 'sidePanel'])
  expect(real.host_permissions).toBeUndefined()
  expect(real.optional_permissions).toBeUndefined()
  expect(real.optional_host_permissions).toBeUndefined()
})

it('后台入口固定，禁止侧边栏全局面板、快捷键与选项页；CSP 与最低版本必须精确', () => {
  for (const field of [
    'side_panel',
    'commands',
    'options_ui',
    'options_page',
    'sandbox',
    'chrome_url_overrides',
  ])
    expect(() => validateManifest({ ...manifest, [field]: {} }, '0.1.0')).toThrow(`不允许 ${field}`)
  expect(() => validateManifest({ ...manifest, minimum_chrome_version: '120' }, '0.1.0')).toThrow(
    '最低 Chrome 版本不符合约定',
  )
  const loose = { extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'" }
  expect(() => validateManifest({ ...manifest, content_security_policy: loose }, '0.1.0')).toThrow(
    '扩展页面 CSP 不符合约定',
  )
})

it('公开资源恰为词典与注入衬线子集，只对 beta 站开放（扩展 0.4.0）', () => {
  const war = (resources, matches = ['https://beta.craftofexile.com/*']) => ({
    ...manifest,
    web_accessible_resources: [{ resources, matches }],
  })
  for (const changed of [
    war(['assets/dictionary.json']),
    war(['assets/dictionary.json', 'assets/serif-sc-l1.woff2', 'assets/popup.css']),
    war(['assets/dictionary.json', 'assets/serif-sc-l1.woff2'], ['<all_urls>']),
    {
      ...manifest,
      web_accessible_resources: [
        ...manifest.web_accessible_resources,
        { resources: ['icons/icon-16.png'], matches: ['https://beta.craftofexile.com/*'] },
      ],
    },
  ])
    expect(() => validateManifest(changed, '0.1.0')).toThrow('扩展入口或公开资源范围发生变化')
})

it('仓库 manifest.json 通过同一套检查', async () => {
  const { readFile } = await import('node:fs/promises')
  const real = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'))
  expect(() => validateManifest(real, real.version)).not.toThrow()
})

it('扩展身份公钥缺失或被替换时拒绝打包', () => {
  for (const key of [undefined, 'MIIB-other'])
    expect(() => validateManifest({ ...manifest, key }, '0.1.0')).toThrow('扩展身份公钥不符合约定')
})

it('入库公钥推导出的 ID 与商店草稿一致', () => {
  const real = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  expect(typeof real.key).toBe('string')
  const id = createHash('sha256')
    .update(Buffer.from(real.key, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
  expect(id).toBe('chcijeghknaadobhcfdbfpdjppfimhkn')
})

it('后台只能使用包内固定入口，不允许静默移除或替换', () => {
  for (const background of [
    undefined,
    {},
    { service_worker: 'worker.js' },
    { scripts: ['background.js'] },
  ])
    expect(() => validateManifest({ ...manifest, background }, '0.1.0')).toThrow('后台入口')
})
