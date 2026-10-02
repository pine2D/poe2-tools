import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
it.each(['calculator', 'simulator'])('条件空结果动态显示、恢复与区域隔离：%s', async (kind) => {
  const start =
    kind === 'calculator'
      ? '<div id="calculatorZone"><div class="requirements">'
      : '<div id="simulatorConditionRequirements"><div>'
  document.body.innerHTML = `<main>${start}<div class="dropdown"><input value="no-such-condition"><ul><li value="x" search="original">Original option</li><li class="no_result hidden">No results for this search</li></ul></div></div></div><p>No results for this search</p></main>`
  const row = document.querySelector('.no_result') as HTMLElement
  stop = attachTextLayer(document, createLexicon([]), true)
  expect(row.textContent).toBe('No results for this search')
  row.classList.remove('hidden')
  await settle()
  expect(row.textContent).toBe('没有符合当前搜索的条件。 · No results for this search')
  expect(document.querySelector('input')?.value).toBe('no-such-condition')
  expect(document.querySelector('[value="x"]')?.getAttribute('search')).toBe('original')
  expect(document.querySelector('p')?.textContent).toBe('No results for this search')
  row.classList.remove('no_result')
  await settle()
  expect(row.textContent).toBe('No results for this search')
  row.classList.add('no_result')
  await settle()
  expect(row.textContent).toContain('没有符合当前搜索的条件')
  stop()
  expect(row.textContent).toBe('No results for this search')
})
