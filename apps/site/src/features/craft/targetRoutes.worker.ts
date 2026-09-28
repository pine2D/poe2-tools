import { planTargetDefinitionRoutes } from '@poe2-tools/item-core'

self.onmessage = (event: MessageEvent<Parameters<typeof planTargetDefinitionRoutes>>) => {
  try {
    self.postMessage(planTargetDefinitionRoutes(...event.data))
  } catch {
    self.postMessage({ ok: false, error: '路线计算失败，请重新生成。' })
  }
}
