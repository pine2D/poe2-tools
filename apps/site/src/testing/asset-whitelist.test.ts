// @vitest-environment node
// 素材白名单的仓库侧检查（spec §8.6）：被跟踪的图像与字体都属于白名单三类之一；
// apps/、packages/ 下的文件不引用本地调研目录与会话临时目录
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  ASSET_EXTENSIONS,
  assertAssets,
  loadWhitelist,
  sha256,
} from '@poe2-tools/ui-theme/compliance'
import { expect, it } from 'vitest'

// 已跟踪与未跟踪（但未被忽略）的文件，提交前新增的文件也在检查范围内
function repoFiles(...paths: string[]): string[] {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...paths],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter((path) => path !== '')
}

const SELF = 'apps/site/src/testing/asset-whitelist.test.ts'

it('仓库里的 png、jpg、webp、gif、svg、woff、woff2、ttf、otf 都在白名单里（repo 模式）', async () => {
  const assets = repoFiles().filter((path) =>
    ASSET_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(`.${ext}`)),
  )
  expect(assets).toContain('apps/site/public/favicon.svg')
  expect(assets.filter((path) => path.endsWith('.woff2')).length).toBeGreaterThan(0)
  const whitelist = await loadWhitelist()
  expect(() =>
    assertAssets(
      assets.map((path) => ({ path, sha256: sha256(readFileSync(path)) })),
      whitelist,
      'repo',
    ),
  ).not.toThrow()
})

it('apps/、packages/ 下的文件不含本地调研目录与会话临时目录的路径', () => {
  const words = ['docs/superpowers/', 'scratchpad']
  const hits = repoFiles('apps', 'packages')
    .filter((path) => path !== SELF)
    .flatMap((path) => {
      const text = readFileSync(path, 'latin1')
      return words.filter((word) => text.includes(word)).map((word) => `${path}: ${word}`)
    })
  expect(hits).toEqual([])
})
