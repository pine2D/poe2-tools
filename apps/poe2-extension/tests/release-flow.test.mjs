// @vitest-environment node
// 发布流程的接线（扩展发布 spec §4、§5、§7）：verify 的顺序、发版脚本、CI 的 verify 守卫与 release-extension job
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const read = (relative) => readFile(new URL(`../../../${relative}`, import.meta.url), 'utf8')

it('pnpm verify 先打包扩展并过发布闸门，再构建网站（网站构建要复制扩展 zip）', async () => {
  const { scripts } = JSON.parse(await read('package.json'))
  expect(scripts.verify.split(' && ')).toEqual([
    'pnpm typecheck',
    'pnpm lint',
    'pnpm test',
    'pnpm extension:package',
    'pnpm extension:release-check',
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

it('verify job：pnpm verify 之后守住已发布版本不换内容，失败时上传扩展产物，成功才上传网站产物', async () => {
  const ci = await read('.github/workflows/ci.yml')
  const verify = ci.slice(ci.indexOf('\n  verify:\n'), ci.indexOf('\n  deploy:\n'))
  const order = [
    verify.indexOf('\n      - run: pnpm verify\n'),
    verify.indexOf('\n        run: node apps/poe2-extension/scripts/github-release.mjs guard\n'),
    verify.indexOf('\n        if: failure()\n'),
    verify.search(/\n {10}name: site-\$\{\{ github\.sha \}\}\n/),
  ]
  expect(order.every((index) => index > 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect(verify).toMatch(/\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/)
  expect(verify).toContain(
    '\n            apps/poe2-extension/dist\n            apps/poe2-extension/artifacts\n',
  )
  expect(verify).toContain('\n          retention-days: 3\n')
  expect(verify).not.toContain('contents: write')
})

it('release-extension 只在 push main 且部署成功后运行，只有它拿 contents: write，由 github-release.mjs 创建或核对 Release', async () => {
  const ci = await read('.github/workflows/ci.yml')
  expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m)
  const job = ci.slice(ci.indexOf('\n  release-extension:\n'))
  expect(job).toContain('\n    needs: [verify, deploy]\n')
  expect(job).toContain(
    "\n    if: github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.deploy.result == 'success'\n",
  )
  expect(job).toContain('\n    permissions:\n      contents: write\n')
  expect(job).toMatch(/\n {10}name: site-\$\{\{ github\.sha \}\}\n/)
  expect(job).toMatch(
    /\n {10}ASSET: site-dist\/downloads\/\$\{\{ steps\.plan\.outputs\.file \}\}\n/,
  )
  expect(job).toContain(
    '\n        run: node apps/poe2-extension/scripts/github-release.mjs publish "$ASSET" "$RUNNER_TEMP/release-notes.md" "$TARGET"\n',
  )
  expect(job).not.toContain('gh release create')
  expect(ci.match(/contents: write/g)).toHaveLength(1)
})
