import { extractPage } from './run'

// 侧边栏先注入本文件，再用第二次 executeScript 调用这个函数取回结果（文件注入拿不到 IIFE 的返回值）。
;(globalThis as { __poe2GuideExtract?: () => unknown }).__poe2GuideExtract = () => {
  const selection = window.getSelection()
  return extractPage(
    document,
    location,
    String(selection ?? ''),
    new Date().toISOString(),
    selection?.rangeCount ? selection.getRangeAt(0) : undefined,
  )
}
