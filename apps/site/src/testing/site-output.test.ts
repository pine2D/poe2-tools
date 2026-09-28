// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// @ts-expect-error 构建脚本直接由 Node 执行，不进入浏览器包。
import { checkSite } from '../../scripts/check-site.mjs'

it('拒绝缺失 404 或局部资源的产物，完整多入口才能交付部署', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'poe2-site-output-'))
  try {
    for (const page of [
      'index.html',
      'build/index.html',
      'extension/index.html',
      'craft/index.html',
    ]) {
      await mkdir(join(dir, page, '..'), { recursive: true })
      await writeFile(
        join(dir, page),
        '<html><head><title>页面</title><script src="/assets/main.js"></script></head></html>',
      )
    }
    await expect(checkSite(dir)).rejects.toThrow('404.html')
    await writeFile(join(dir, '404.html'), '<html>404</html>')
    await expect(checkSite(dir)).rejects.toThrow('assets/main.js')
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets/main.js'), 'export {}')
    await expect(checkSite(dir)).resolves.toBeUndefined()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
