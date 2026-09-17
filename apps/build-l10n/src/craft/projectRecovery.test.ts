import { afterEach, expect, it, vi } from 'vitest'
import { RECOVERY_KEY, readRecovery, sameRecoveryProject, writeRecovery } from './projectRecovery'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'locks')
})
function locks() {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_key: string, action: () => unknown) => action(),
    },
  })
}
it('恢复记录单独保存；相同文本不更新时间，竞争更新不能覆盖', async () => {
  locks()
  localStorage.setItem('poe2-tools:craft-rehearsal:v1', 'manual')
  const first = await writeRecovery(null, 'project A', () => true)
  expect(readRecovery(first)?.text).toBe('project A')
  expect(await writeRecovery(first, 'project A', () => true)).toBe(first)
  const second = await writeRecovery(first, 'project B', () => true)
  await expect(writeRecovery(first, 'stale', () => true)).rejects.toThrow('其他页面')
  expect(localStorage.getItem(RECOVERY_KEY)).toBe(second)
  expect(localStorage.getItem('poe2-tools:craft-rehearsal:v1')).toBe('manual')
})
it('卸载或上下文失效不写入，无锁不降级为不安全写入', async () => {
  locks()
  expect(await writeRecovery(null, 'project', () => false)).toBeNull()
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  Reflect.deleteProperty(navigator, 'locks')
  await expect(writeRecovery(null, 'project', () => true)).rejects.toThrow('存储锁')
})
it('损坏或超限记录保留原文，不伪装成有效恢复记录', () => {
  expect(readRecovery('{broken')).toBeNull()
  expect(readRecovery(JSON.stringify({ version: 1, savedAt: 'bad', text: '{}' }))).toBeNull()
  expect(
    readRecovery(
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        text: 'x'.repeat(2 * 1024 * 1024 + 1),
      }),
    ),
  ).toBeNull()
})

it('恢复后仅对象字段顺序变化仍是同一项目，数组顺序和数值变化不能忽略', () => {
  const first = '{"initialState":{"baseId":"Bow","sockets":[]},"operations":[1,2],"cursor":0}'
  const reordered = '{"cursor":0,"operations":[1,2],"initialState":{"sockets":[],"baseId":"Bow"}}'
  expect(sameRecoveryProject(first, reordered)).toBe(true)
  expect(sameRecoveryProject(first, reordered.replace('[1,2]', '[2,1]'))).toBe(false)
  expect(sameRecoveryProject(first, reordered.replace('"cursor":0', '"cursor":1'))).toBe(false)
  expect(sameRecoveryProject('{broken', reordered)).toBe(false)
  expect(sameRecoveryProject('{"sourceText":1e400}', '{"sourceText":null}')).toBe(false)
})
