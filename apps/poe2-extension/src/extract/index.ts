import { createPageSession, type PageSession } from './session'

// 隔离世界内复用会话；页面只能看见自有译文容器，拿不到扩展凭据。
const state = globalThis as { __poe2GuideSession?: PageSession }
if (state.__poe2GuideSession?.version !== 2) {
  state.__poe2GuideSession?.clear()
  state.__poe2GuideSession = createPageSession(document, location)
}
// 保留读取入口，默认整页；显式范围由侧栏命令调用页面会话。
;(globalThis as { __poe2GuideExtract?: () => unknown }).__poe2GuideExtract = () =>
  state.__poe2GuideSession?.read({ scope: 'full' })
