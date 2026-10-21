import { installSelection } from './bubble'
import { requestSelection } from './client'

const page = globalThis as { __poe2Selection?: { destroy(): void } }
page.__poe2Selection?.destroy()
page.__poe2Selection = installSelection(document, window, requestSelection)
