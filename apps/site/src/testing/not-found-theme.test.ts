// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const html = readFileSync('apps/site/public/404.html', 'utf8')
it.each([
  ['dark', true, 'dark'],
  ['light', false, 'light'],
  [null, true, 'light'],
  ['invalid', false, 'dark'],
  ['blocked', true, 'light'],
])('404 主题：保存 %s，系统浅色 %s → %s', (saved, light, expected) => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  expect(script).toBeDefined()
  let theme: string | undefined
  runInNewContext(script ?? '', {
    localStorage: {
      getItem: () => {
        if (saved === 'blocked') throw new Error('storage blocked')
        return saved
      },
    },
    window: { matchMedia: () => ({ matches: light }) },
    document: {
      documentElement: {
        setAttribute: (_name: string, value: string) => {
          theme = value
        },
      },
    },
  })
  expect(theme).toBe(expected)
})
