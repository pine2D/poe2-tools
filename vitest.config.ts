import { defineConfig } from 'vitest/config'

// 各包用自己目录下的 vite / vitest 配置（静态站需要 happy-dom 环境）；没有配置的包按默认 node 环境跑
export default defineConfig({
  test: {
    // 历史工坊回放和路线搜索占用 CPU；单 worker 避免并行争用触发原有时间门槛。
    // 保留所有用例、断言与各文件的超时设置。
    maxWorkers: 1,
    projects: ['packages/*', 'apps/*'],
  },
})
