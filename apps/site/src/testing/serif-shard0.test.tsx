// 衬线归片（spec §7.3）：页面上用衬线显示的固定文案，字符都必须在 SC shard0 里——首页只下载这一片。
// 用户文件与词典名称（带 data-user-text）不计。
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { SERIF_SELECTORS } from '@poe2-tools/ui-theme/selectors'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { miniBundle } from '../../../../packages/build-core/src/testing/miniDict'
import { App } from '../features/build-l10n/App'
import { ExtensionPage } from '../pages/extension/ExtensionPage'
import { HomePage } from '../pages/home/HomePage'
import { fakeDictFetch } from '../shared/testing/fakeDictFetch'
import { fsPathFromMetaUrl } from '../shared/testing/fsPath'

const here = dirname(fsPathFromMetaUrl(import.meta.url))
const coverage = JSON.parse(
  readFileSync(resolve(here, '../../../../packages/ui-theme/fonts/coverage.json'), 'utf8'),
) as { shards: { file: string; chars: string }[] }
const shard0 = new Set(
  coverage.shards.find((shard) => shard.file === 'serif-sc-0.woff2')?.chars ?? '',
)
const rich = readFileSync(resolve(here, '../../../../data/fixtures/synthetic/rich.build'), 'utf8')

// 本里程碑页面上必须至少命中一次的衬线选择器
const MUST_HIT = ['.pt-nav a', '.pt-titlebar__title', '.pt-forge-btn', '.pt-hero-title']

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

// happy-dom 不支持的伪类（如 :lang()）去掉再查；名称元素都带 data-user-text，结果不变
function querySelector(selector: string): string {
  return selector.replace(/:lang\([^)]*\)/g, '')
}

// 收集当前文档里衬线元素的文字：跳过自身或祖先带 data-user-text 的元素，以及其中带该属性的后代
function collect(hits: Map<string, number>): string {
  let text = ''
  for (const selector of SERIF_SELECTORS) {
    for (const el of document.querySelectorAll(querySelector(selector))) {
      if (el.closest('[data-user-text]') !== null) continue
      hits.set(selector, (hits.get(selector) ?? 0) + 1)
      const copy = el.cloneNode(true) as Element
      for (const user of copy.querySelectorAll('[data-user-text]')) user.remove()
      text += copy.textContent ?? ''
    }
  }
  return text
}

describe('衬线文字只用 shard0 的字（spec §7.3、§8.5）', () => {
  it('首页、扩展介绍页、构筑空态与构筑导入后', async () => {
    const hits = new Map<string, number>()
    let text = ''
    render(<HomePage />)
    text += collect(hits)
    cleanup()
    render(<ExtensionPage />)
    text += collect(hits)
    cleanup()
    render(<App fetchImpl={fakeDictFetch(miniBundle)} />)
    await screen.findByText('词典就绪')
    text += collect(hits)
    fireEvent.change(screen.getByLabelText('选择 .build 文件'), {
      target: { files: [new File([rich], 'rich.build', { type: 'application/json' })] },
    })
    await screen.findByRole('button', { name: 'rich.build' })
    text += collect(hits)

    const missing = [...new Set(text)].filter((ch) => !/\s/.test(ch) && !shard0.has(ch))
    expect(
      missing.join(''),
      '把缺的字补进 packages/ui-theme/scripts/shard0-text.txt，再运行 pnpm ui-theme:fonts',
    ).toBe('')
    for (const selector of MUST_HIT) expect(hits.get(selector) ?? 0, selector).toBeGreaterThan(0)
  })
})
