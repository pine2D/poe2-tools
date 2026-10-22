// 只声明本包用到、浏览器与 Node 24 都内置的全局对象，避免整体引入 DOM 类型。
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } }
declare const crypto: {
  subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> }
}
