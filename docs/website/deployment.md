# 网站构建与 Cloudflare Pages 部署

## 目录与产物

网站源码为 `apps/site`，包名 `@poe2-tools/site`。使用 Vite 多入口：

| 地址 | HTML 入口 | 页面源码 |
| --- | --- | --- |
| `/` | `index.html` | `src/pages/home/` |
| `/build/` | `build/index.html` | `src/features/build-l10n/` |
| `/extension/` | `extension/index.html` | `src/pages/extension/` |
| `/craft/` | `craft/index.html` | `src/features/craft/` |

词典加载、页面样式及共享控件位于 `src/shared/`；令牌、组件样式、母题与字体分片来自 `packages/ui-theme`（历史工坊不接入）。翻译与制作算法留在现有 packages。
`sync-dict.mjs` 仅同步汉化词典，`sync-craft.mjs` 仅同步旧工坊数据，`sync-fonts.mjs` 复制字体许可文件与根目录 `NOTICE`；`sync-data` 在 dev/build 前依次调用三者。
输出 `apps/site/dist`，包括根级 `404.html`、词典和工坊目录、字体分片（`assets/*.woff2`）、`fonts/*-OFL.txt` 与 `NOTICE.txt`。首页及扩展介绍不请求词典和工坊数据。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
```

构建末尾自动运行 `check-site.mjs`，检查四个页面、404、HTML 引用的站内资源，以及字体许可文件与 `NOTICE.txt` 的必含行、CSS `url()` 无外链且目标存在、素材白名单与字体分片集合（判定逻辑在 `packages/ui-theme/scripts/compliance.mjs`）。

## CI 与发布

- 回归使用单 worker：避免历史工坊重计算用例争用 CPU；不修改断言或时间门槛。
- PR、main 推送、手动触发由 `ci.yml` 执行一次 `pnpm verify`，并保存 `site-<commit>` 产物。
- 同分支较新的生产工作流会取消旧生产工作流，预览使用独立并发组。
- main 推送通过验证后调用 `deploy.yml`；部署任务下载同一份产物，不重新安装项目依赖或构建。
- `deploy.yml` 是可复用工作流，不再独立监听 push，避免双重验证。
- 手动运行 CI 时可选择 `none`（默认）、`preview`、`production`；production 仅允许 main。
- preview 使用 `preview-<来源分支>`，与 production 的并发组隔离；即使从 main 发起预览，也不会传 `--branch=main`。
- 使用固定 Wrangler 4.40.2；升级时需独立验证部署命令和输出地址提取。
- 部署后从 Wrangler 日志提取本次不可变 `pages.dev` 地址，检查页面、资源、字体许可文件、`NOTICE.txt`、CSS 引用的字体分片和真实 404。失败时工作流失败，但不会自动回滚。
- 扩展有独立源码与发行流程；网站构建不会打包或发布扩展。

沿用已有变量 `CF_PAGES_PROJECT` 和 secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。项目变量未配置时不部署；凭据缺失会明确失败，不伪装成功。

## 首次发布前的控制台核对

本轮只修改仓库流程，未读取或变更 Cloudflare 控制台。发布前应确认：

1. Pages 项目生产分支是 main，现有自定义域名仍绑定该项目。
2. 若控制台另有 Git 自动构建，与 GitHub Actions 直传只保留一个发布源，避免重复部署。变更控制台配置须先确认现状。
3. 若保留控制台构建，其命令与输出目录需对应新结构；本方案以 Actions 直传为准。
4. 自定义域名没有将 HTML 或固定路径词典长期缓存的额外规则。优先沿用 Pages 默认缓存。
5. 先手动部署 preview，检查 `/`、`/build/`、`/extension/`、旧 `/craft/`、不存在路径，以及子页刷新。
6. 发布后再检查生产自定义域名；不可变预览地址通过不等于 DNS/域名缓存已验证。

回退时在 Cloudflare Pages 的部署历史中选择已知正常的生产部署，执行回滚，并重新检查域名。回滚属于线上操作，本轮未执行。

参考：[路径、404 与缓存](https://developers.cloudflare.com/pages/configuration/serving-pages/)、[预览部署](https://developers.cloudflare.com/pages/configuration/preview-deployments/)。
