import { expect, it } from 'vitest'
import { validateManifest } from '../scripts/check.mjs'

const manifest = {
  manifest_version: 3,
  version: '0.1.0',
  permissions: ['storage'],
  action: { default_popup: 'popup.html' },
  content_scripts: [
    {
      matches: ['https://beta.craftofexile.com/*'],
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  web_accessible_resources: [
    { resources: ['assets/dictionary.json'], matches: ['https://beta.craftofexile.com/*'] },
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
