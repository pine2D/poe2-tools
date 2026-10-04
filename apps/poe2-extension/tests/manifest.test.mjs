// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { validateManifest } from '../scripts/check.mjs'

const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/icon-${size}.png`]))
const manifest = {
  icons,
  manifest_version: 3,
  version: '0.1.0',
  description: '非官方扩展：为新版 Craft of Exile 的 PoE2 页面提供国服简体术语显示。',
  permissions: ['storage'],
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

it('弹窗读当前页状态与刷新不加权限：tabs、activeTab、scripting 一律拒绝（第三期）', () => {
  for (const permissions of [
    ['storage', 'tabs'],
    ['storage', 'activeTab'],
    ['storage', 'scripting'],
    ['tabs'],
  ])
    expect(() => validateManifest({ ...manifest, permissions }, '0.1.0')).toThrow(
      'Manifest 版本或权限不符合约定',
    )
})

it('入库 manifest.json 的 permissions 恰为 ["storage"]，没有 host 与可选权限', () => {
  const real = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  expect(real.permissions).toEqual(['storage'])
  expect(real.host_permissions).toBeUndefined()
  expect(real.optional_permissions).toBeUndefined()
  expect(real.optional_host_permissions).toBeUndefined()
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
