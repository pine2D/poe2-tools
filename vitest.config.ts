import { defineConfig } from 'vitest/config'

// 各包用自己目录下的 vite / vitest 配置（静态站需要 happy-dom 环境）；没有配置的包按默认 node 环境跑
export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
})
