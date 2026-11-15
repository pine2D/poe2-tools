import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'

const css = [
  '../../../packages/ui-theme/src/tokens.css',
  '../../../packages/ui-theme/src/components/btn.css',
  '../src/guide/guide.css',
]
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n')

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

it('侧栏禁用主操作使用中性底和边，横幅按钮也保持相同规则', () => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  document.body.innerHTML = `<main class="guide">
    <button class="pt-btn guide-begin" disabled>先重新读取</button>
    <div class="guide-banner"><button class="pt-btn" disabled>配置翻译服务</button></div>
  </main>`
  for (const button of document.querySelectorAll('button')) {
    const computed = getComputedStyle(button)
    expect(computed.backgroundColor).toBe('#1e2124')
    expect(computed.borderTopColor).toBe('#2c333b')
    expect(computed.boxShadow).toBe('none')
  }
})

it('首末段禁用导航与可用图标操作颜色不同，不被图标强选择器覆盖', () => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  document.body.innerHTML = `<main class="guide">
    <button class="pt-btn pt-btn--quiet icon-button" disabled>上一段</button>
    <button class="pt-btn pt-btn--quiet icon-button">下一段</button>
  </main>`
  const [disabled, enabled] = [...document.querySelectorAll('button')]
  expect(disabled && getComputedStyle(disabled).color).not.toBe(
    enabled && getComputedStyle(enabled).color,
  )
})
