import { defineConfig } from 'vitest/config'

// 各包用自己目录下的 vite / vitest 配置（静态站需要 happy-dom 环境）；没有配置的包按默认 node 环境跑
export default defineConfig({
  test: {
    // 路线搜索与大目录界面测试占用 CPU；限制并发，避免共享 CI 上资源争用导致超时。
    maxWorkers: 2,
    projects: ['packages/*', 'apps/*'],
  },
})
