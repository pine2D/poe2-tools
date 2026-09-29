/// <reference types="vitest/config" />

import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 静态站：Cloudflare Pages 根路径部署。词典 JSON 由 scripts/sync-dict.mjs 复制到 public/dict/，
// 作为静态文件随站发布，运行时按 locale 懒加载。
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 字体分片一律按文件输出，不内联进 CSS（spec §7.2）：check-site 按 coverage.json 核对 dist 的 woff2 集合
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        build: fileURLToPath(new URL('./build/index.html', import.meta.url)),
        extension: fileURLToPath(new URL('./extension/index.html', import.meta.url)),
        craft: fileURLToPath(new URL('./craft/index.html', import.meta.url)),
      },
    },
  },
  test: { environment: 'happy-dom' },
})
