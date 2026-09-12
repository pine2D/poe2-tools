import { planCraftTargetRoutes } from '@poe2-tools/item-core'

self.onmessage = (event: MessageEvent<Parameters<typeof planCraftTargetRoutes>>) => {
  try {
    self.postMessage(planCraftTargetRoutes(...event.data))
  } catch {
    self.postMessage({ ok: false, error: '路线计算失败，请重新生成。' })
  }
}
