// @vitest-environment node
// 发布流程的接线（扩展发布 spec §4、§5、§7）：verify 的顺序、发版脚本与 CI 的 release-extension job
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const read = (relative) => readFile(new URL(`../../../${relative}`, import.meta.url), 'utf8')

it('pnpm verify 在网站构建之前打包扩展（网站构建要复制扩展 zip）', async () => {
  const { scripts } = JSON.parse(await read('package.json'))
  expect(scripts.verify.split(' && ')).toEqual([
    'pnpm typecheck',
    'pnpm lint',
    'pnpm test',
    'pnpm extension:package',
    'pnpm build',
    'pnpm dict:check',
    'pnpm craft:check',
  ])
})

it('发版脚本：extension:release-check 只核对，extension:release 先打包再改写 release.json', async () => {
  const { scripts } = JSON.parse(await read('package.json'))
  expect(scripts['extension:release-check']).toBe(
    'node apps/poe2-extension/scripts/release.mjs check',
  )
  expect(scripts['extension:release']).toBe(
    'pnpm extension:package && node apps/poe2-extension/scripts/release.mjs write',
  )
})
