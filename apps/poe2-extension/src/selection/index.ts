import { installSelection } from './bubble'
import { requestSelection } from './client'

declare const chrome: {
  runtime: {
    id: string
    onMessage: {
      addListener(callback: (message: unknown, sender: { id?: string; url?: string }) => void): void
      removeListener(
        callback: (message: unknown, sender: { id?: string; url?: string }) => void,
      ): void
    }
  }
}
const page = globalThis as { __poe2Selection?: { destroy(): void } }
page.__poe2Selection?.destroy()
const selection = installSelection(document, window, requestSelection)
const deactivate = (message: unknown, sender: { id?: string }) => {
  if (
    sender.id === chrome.runtime.id &&
    (message as { type?: string })?.type === 'selection-deactivate'
  )
    page.__poe2Selection?.destroy()
}
chrome.runtime.onMessage.addListener(deactivate)
page.__poe2Selection = {
  destroy() {
    selection.destroy()
    chrome.runtime.onMessage.removeListener(deactivate)
    delete page.__poe2Selection
  },
}
