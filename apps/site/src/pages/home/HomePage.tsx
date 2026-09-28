import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { useTheme } from '../../shared/theme/useTheme'

export function HomePage() {
  const theme = useTheme()
  return (
    <div className="portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="home" mode={theme.mode} onMode={theme.setMode} />
      <main id="main" tabIndex={-1} className="portal-main">
        <section className="home-intro">
          <h1>
            少查译名，
            <br className="mobile-break" />
            <span>多研究构筑。</span>
          </h1>
          <p>给《流放之路 2》中文玩家用的构筑汉化工具和浏览器扩展。</p>
        </section>
        <div className="tool-pair">
          <article className="tool-entry build-entry">
            <div className="tool-heading">
              <h2>构筑汉化</h2>
              <span className="tool-kind">网页工具</span>
            </div>
            <p className="tool-question">拿到一份英文 .build？</p>
            <p className="tool-description">
              导入英文构筑，查看装备名和词缀的中文对照，核对后下载。
            </p>
            <figure className="translation-demo">
              <figcaption>词缀对照示例</figcaption>
              <div className="affix-line" lang="en">
                +175 to maximum Life
              </div>
              <div className="affix-rule" aria-hidden="true">
                <span>↓</span>
              </div>
              <div className="affix-line translated">+175 生命上限</div>
              <div className="demo-foot">数值保留 · 术语对照</div>
            </figure>
            <div className="tool-meta">
              <span>国服简体 / 台服繁体</span>
              <span>文件在本机处理</span>
            </div>
            <a className="site-button" href="/build/">
              打开构筑汉化 <span aria-hidden="true">→</span>
            </a>
          </article>
          <article className="tool-entry extension-entry">
            <div className="tool-heading">
              <h2>PoE2 中文助手</h2>
              <span className="tool-kind">Chrome 扩展</span>
            </div>
            <p className="tool-question">在 Craft of Exile 里研究装备？</p>
            <p className="tool-description">用国服术语查词缀、搜基底，在英文工具里核对装备文本。</p>
            <figure className="search-demo">
              <figcaption>中文搜索流程示意</figcaption>
              <div className="search-query">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="6" />
                  <path d="m15 15 5 5" />
                </svg>
                水晶法器<span className="search-key">中文输入</span>
              </div>
              <div className="search-result">
                <strong>水晶法器</strong>
                <span lang="en">Crystal Focus</span>
              </div>
              <div className="demo-foot">选中英文候选 → 在原站搜索</div>
            </figure>
            <div className="tool-meta">
              <span>CoE Beta · PoE2 · English</span>
              <span>开发预览</span>
            </div>
            <a className="site-button site-button-secondary" href="/extension/">
              查看扩展与安装方式 <span aria-hidden="true">→</span>
            </a>
          </article>
        </div>
        <section className="home-notes" aria-labelledby="notes-title">
          <div>
            <h2 id="notes-title">按自己的节奏，研究下一件装备。</h2>
            <p>先找到需要的工具，再回到你的构筑。</p>
          </div>
          <div className="recent-note">
            <h3>本次站点更新</h3>
            <p>
              首页现在可以打开两个工具。构筑汉化保留独立入口；扩展页面介绍中文助手的安装方法和支持范围。
            </p>
            <a href="/build/">
              收藏构筑工作台 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
