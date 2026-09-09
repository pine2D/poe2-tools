/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 静态站：Cloudflare Pages 根路径部署。词典 JSON 由 scripts/sync-dict.mjs 复制到 public/dict/，
// 作为静态文件随站发布，运行时按 locale 懒加载。
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'happy-dom' },
})
