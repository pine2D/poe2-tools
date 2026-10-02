// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FULL_DISCLAIMER,
  LICENSE_REQUIRED_LINES,
  SITE_NOTICE_REQUIRED_LINES,
  sha256,
} from '@poe2-tools/ui-theme/compliance'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error 构建脚本直接由 Node 执行，不进入浏览器包。
import { checkSite } from '../../scripts/check-site.mjs'

const PAGES = ['index.html', 'build/index.html', 'extension/index.html', 'craft/index.html']
const SHARD = new Uint8Array([119, 79, 70, 50, 1, 2, 3, 4])
const ZIP = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0])
const RELEASE = {
  version: '9.9.9',
  file: 'poe2-extension-9.9.9.zip',
  bytes: ZIP.length,
  sha256: sha256(ZIP),
  date: '2026-10-02',
}

let dir: string
let coveragePath: string

async function put(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(join(dir, path, '..'), { recursive: true })
  await writeFile(join(dir, path), content)
}

// 一份能通过全部检查的最小产物：五个页面、脚本、字体分片与样式、三份许可文件、NOTICE.txt 和扩展发布包
async function completeSite(): Promise<void> {
  for (const page of PAGES) {
    await put(
      page,
      '<html><head><title>页面</title><script src="/assets/main.js"></script><link rel="stylesheet" href="/assets/site.css"></head></html>',
    )
  }
  await put('404.html', '<html>404</html>')
  await put('assets/main.js', 'export {}')
  await put('assets/serif-sc-0-Ab12.woff2', SHARD)
  await put(`downloads/${RELEASE.file}`, ZIP)
  await put(
    'assets/site.css',
    '@font-face{src:url(/assets/serif-sc-0-Ab12.woff2) format("woff2")}a{background:url("data:image/svg+xml,%3Csvg%2F%3E")}',
  )
  for (const [name, lines] of Object.entries(LICENSE_REQUIRED_LINES)) {
    await put(`fonts/${name}`, `${lines.join('\n')}\n`)
  }
  await put('NOTICE.txt', `${SITE_NOTICE_REQUIRED_LINES.join('\n')}\n`)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'poe2-site-output-'))
  coveragePath = join(dir, '..', `${dir.split('/').pop()}-coverage.json`)
  await writeFile(
    coveragePath,
    JSON.stringify({ shards: [{ file: 'serif-sc-0.woff2', sha256: sha256(SHARD) }] }),
  )
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(coveragePath, { force: true })
})

describe('checkSite（spec §8.6、§8.7）', () => {
  it('拒绝缺失 404 或局部资源的产物，完整产物才能交付部署', async () => {
    await completeSite()
    await rm(join(dir, '404.html'))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow('404.html')
    await put('404.html', '<html>404</html>')
    await rm(join(dir, 'assets/main.js'))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'assets/main.js',
    )
    await put('assets/main.js', 'export {}')
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).resolves.toBeUndefined()
    expect(FULL_DISCLAIMER).toBe(SITE_NOTICE_REQUIRED_LINES[0])
  })

  it('缺许可文件时拒绝', async () => {
    await completeSite()
    await rm(join(dir, 'fonts/Cinzel-OFL.txt'))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'Cinzel-OFL.txt',
    )
  })

  it('许可文件缺版权行时拒绝', async () => {
    await completeSite()
    await put('fonts/NotoSerifTC-OFL.txt', 'SIL OPEN FONT LICENSE Version 1.1\n')
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      '(c) 2017-2024 Adobe',
    )
  })

  it('缺 NOTICE.txt 时拒绝', async () => {
    await completeSite()
    await rm(join(dir, 'NOTICE.txt'))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      `缺少许可文件：${join(dir, 'NOTICE.txt')}`,
    )
  })

  it('NOTICE.txt 缺完整声明时拒绝，并报出缺的那一行', async () => {
    await completeSite()
    await put('NOTICE.txt', `${SITE_NOTICE_REQUIRED_LINES.slice(1).join('\n')}\n`)
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      `NOTICE.txt 缺少必含行：\n  ${FULL_DISCLAIMER}`,
    )
  })

  it('CSS 的 url() 是外链时拒绝', async () => {
    await completeSite()
    await put('assets/extra.css', 'a{background:url(https://cdn.example.test/x.woff2)}')
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow('外链')
  })

  it('CSS 的 url() 目标不存在时拒绝', async () => {
    await completeSite()
    await put('assets/extra.css', 'a{background:url(./missing.woff2)}')
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'missing.woff2',
    )
  })

  it('白名单外的图像文件拒绝', async () => {
    await completeSite()
    await put('images/og.png', new Uint8Array([137, 80, 78, 71]))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'images/og.png',
    )
  })

  it('dist 的 woff2 与 coverage.json 不一致时拒绝', async () => {
    await completeSite()
    await rm(join(dir, 'assets/serif-sc-0-Ab12.woff2'))
    await put('assets/site.css', 'a{color:red}')
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'dist 的 woff2 与 coverage.json 不一致',
    )
  })

  it('downloads/ 缺包、多出文件或与 release.json 不一致时拒绝', async () => {
    await completeSite()
    await put('downloads/poe2-extension-0.0.1.zip', ZIP)
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      'downloads/ 应只有 poe2-extension-9.9.9.zip',
    )
    await rm(join(dir, 'downloads/poe2-extension-0.0.1.zip'))
    await put(`downloads/${RELEASE.file}`, new Uint8Array([80, 75, 5, 6, 0, 0, 0, 1]))
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow(
      '字节数或 SHA-256 不一致',
    )
    await rm(join(dir, 'downloads'), { recursive: true })
    await expect(checkSite(dir, { coveragePath, release: RELEASE })).rejects.toThrow('（空）')
  })
})
