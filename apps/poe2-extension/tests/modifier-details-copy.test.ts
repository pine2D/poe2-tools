import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})

it.each([false, true])(
  '高级词缀标题和标签保留原生复制文本，中文独立显示：%s',
  async (bilingual) => {
    // 自造最小结构；原站 PoB 导出读取 modifierDetails 中的标签。
    document.body.innerHTML =
      '<main><div class="item"><div class="mod"><div class="modifierDetails">Suffix Modifier "of the Panther" (Tier: 4) — <span class="tags">Attribute</span></div></div></div></main>'
    const details = document.querySelector('.modifierDetails') as HTMLElement
    const tags = details.querySelector('.tags') as HTMLElement
    const original = details.textContent
    const lex = createLexicon([])
    const text = attachTextLayer(document, lex, bilingual)
    const stats = attachStatLayer(document, lex)
    stop = () => {
      stats()
      text()
    }
    expect(details.textContent).toBe(original)
    expect(tags.textContent).toBe('Attribute')
    expect(details.querySelector('.tags')).toBe(tags)
    expect(details.nextElementSibling?.shadowRoot?.textContent).toBe(
      '后缀属性 "of the Panther"（等阶：4）— 属性',
    )
    tags.textContent = 'Damage, Fire'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(details.textContent).toBe('Suffix Modifier "of the Panther" (Tier: 4) — Damage, Fire')
    expect(details.nextElementSibling?.shadowRoot?.textContent).toContain('伤害、火焰')
    stop()
    expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
    expect(tags.textContent).toBe('Damage, Fire')
  },
)
