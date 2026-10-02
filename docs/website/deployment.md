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
`sync-dict.mjs` 仅同步汉化词典，`sync-craft.mjs` 仅同步旧工坊数据，`sync-fonts.mjs` 复制字体许可文件与根目录 `NOTICE`，`sync-extension.mjs` 按 `apps/poe2-extension/release.json` 把扩展 zip 从 `apps/poe2-extension/artifacts/` 复制到 `public/downloads/`（缺包或字节数、SHA-256 不符即失败；`pnpm dev` 带 `--allow-missing`，只警告）；`sync-data` 在 build 前依次调用四者，dev 前调用同样的四个脚本。因此新克隆单独运行网站构建（或根目录 `pnpm build`）前要先 `pnpm extension:package`（`pnpm verify` 已按此顺序）。根 `build` 是 `pnpm -r --if-present run build`，会把扩展再构建一次，所以 `pnpm verify` 里扩展构建两次，属预期：网站只读 `artifacts/` 里的 zip，不读扩展 `dist/`。
输出 `apps/site/dist`，包括根级 `404.html`、词典和工坊目录、字体分片（`assets/*.woff2`）、`fonts/*-OFL.txt`、`NOTICE.txt` 与 `downloads/<扩展 zip>`。首页及扩展介绍不请求词典和工坊数据。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
```

构建末尾自动运行 `check-site.mjs`，检查四个页面、404、HTML 引用的站内资源，以及字体许可文件与 `NOTICE.txt` 的必含行、CSS `url()` 无外链且目标存在、素材白名单与字体分片集合（判定逻辑在 `packages/ui-theme/scripts/compliance.mjs`）；另查 `downloads/` 恰好一个扩展 zip 且与 `release.json` 一致、介绍页脚本含它的下载地址、介绍页 HTML 不含开发向字样。

## CI 与发布

- 回归使用单 worker：避免历史工坊重计算用例争用 CPU；不修改断言或时间门槛。
- PR、main 推送、手动触发由 `ci.yml` 执行一次 `pnpm verify`（先 `extension:package` 与 `extension:release-check`，再构建网站），再由 `github-release.mjs guard` 比对 GitHub 上已发布的同版本扩展附件（内容不同即失败，已发布的版本只能升版本），并保存 `site-<commit>` 产物（含 `downloads/` 里的扩展 zip）。verify 失败时另存 `extension-debug-<commit>`（扩展 `dist/` 与 `artifacts/`，保留 3 天），供与本机逐文件比对。
- 同分支较新的生产工作流会取消旧生产工作流，预览使用独立并发组。
- main 推送通过验证后调用 `deploy.yml`；部署任务下载同一份产物，不重新安装项目依赖或构建。
- `deploy.yml` 是可复用工作流，不再独立监听 push，避免双重验证。
- 手动运行 CI 时可选择 `none`（默认）、`preview`、`production`；production 仅允许 main。
- preview 使用 `preview-<来源分支>`，与 production 的并发组隔离；即使从 main 发起预览，也不会传 `--branch=main`。
- 使用固定 Wrangler 4.40.2；升级时需独立验证部署命令和输出地址提取。
- 部署后从 Wrangler 日志提取本次不可变 `pages.dev` 地址，检查页面、资源、字体许可文件、`NOTICE.txt`、CSS 引用的字体分片、扩展下载（返回 200，字节数与 SHA-256 与 `release.json` 一致）和真实 404。失败时工作流失败，但不会自动回滚。
- 扩展随网站同一条 CI 发布：扩展版本独立，`release.json` 是发布闸门（产物变化而未发版时 `verify` 失败，不会部署）；部署成功后 `release-extension` job（整个工作流唯一有 `contents: write` 的 job）用同一次运行的网站产物里的 zip 创建 tag `ext-v<版本>` 与 GitHub Release（不标为 Latest）；已有一致的 Release 即跳过，缺附件补传，草稿或内容不一致即失败。工作流级 `cancel-in-progress` 可能在新推送时中途取消发布，留下的草稿需要人工检查删除后重跑。发版步骤见 `docs/chrome-extension/README.md`。

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
