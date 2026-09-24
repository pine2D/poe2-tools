import { expect, it } from 'vitest'
import { boundaryChanged } from '../src/adapters/coe-beta/boundaries'

it('普通选中/悬停类变化不要求重扫，区域边界类变化才重扫', () => {
  const element = document.createElement('div')
  const observer = new MutationObserver(() => {})
  observer.observe(element, { attributes: true, attributeOldValue: true })
  element.className = 'selected hover'
  expect(observer.takeRecords().some(boundaryChanged)).toBe(false)
  element.classList.add('hidden')
  expect(observer.takeRecords().some(boundaryChanged)).toBe(true)
  element.classList.remove('hidden')
  expect(observer.takeRecords().some(boundaryChanged)).toBe(true)
  observer.disconnect()
})
