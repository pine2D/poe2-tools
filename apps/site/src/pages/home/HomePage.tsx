// 首页（spec §6.2、§6.7）：一扇没有标题栏的 pt-frame--hero，里面是 hero 与两张入口卡；
// 金属主按钮只有构筑卡的“打开构筑汉化”（spec §4.2 白名单）
import { PtDivider } from '../../shared/components/PtDivider'
import { PtForgeButton } from '../../shared/components/PtForgeButton'
import { PtFrame } from '../../shared/components/PtFrame'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'

export function HomePage() {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="home" />
      <main id="main" tabIndex={-1} className="portal-main home-main">
        <PtFrame as="div" variant="hero">
          <section className="home-intro">
            <h1 className="pt-hero-title">
              少查译名，
              <br className="mobile-break" />
              <span className="pt-hero-title__gold">多研究构筑。</span>
            </h1>
            <p>给《流放之路 2》中文玩家用的构筑汉化工具和浏览器扩展。</p>
            <PtDivider variant="hero" />
          </section>
          <nav className="home-shortcuts" aria-label="快速打开工具">
            <a className="pt-btn" href="/build/">
              构筑汉化 <span aria-hidden="true">→</span>
            </a>
            <a className="pt-btn pt-btn--quiet" href="/extension/">
              中文助手 <span aria-hidden="true">→</span>
            </a>
          </nav>
          <div className="tool-pair">
            <PtPanel
              as="article"
              variant="card"
              className="tool-entry"
              titlebar={{ title: '构筑汉化', large: true, chip: '网页工具' }}
            >
              <p className="tool-question">拿到一份英文 .build？</p>
              <p className="tool-description">
                导入英文构筑，查看装备名和词缀的<span className="nw">中文对照</span>，核对后下载。
              </p>
              <PtPanel as="figure" variant="inset" className="tool-demo">
                <figcaption>词缀对照示例</figcaption>
                <div className="affix-line">
                  <span className="affix-lab" aria-hidden="true">
                    EN
                  </span>
                  <span className="affix-en" lang="en">
                    <span className="pt-num">+175</span> to maximum Life
                  </span>
                </div>
                <PtDivider variant="indent" />
                <div className="affix-line">
                  <span className="affix-lab" aria-hidden="true">
                    中
                  </span>
                  <span className="affix-zh">
                    <b className="pt-num">+175</b> 生命上限
                  </span>
                </div>
                <div className="demo-foot">数值保留 · 术语对照</div>
              </PtPanel>
              <div className="tool-meta">
                <span>国服简体 / 台服繁体</span>
                <span>文件在本机处理</span>
              </div>
              <PtForgeButton as="a" href="/build/" wide>
                打开构筑汉化
              </PtForgeButton>
            </PtPanel>
            <PtPanel
              as="article"
              variant="card"
              className="tool-entry"
              titlebar={{ title: 'PoE2 中文助手', large: true, chip: 'Chrome 扩展' }}
            >
              <p className="tool-question">在 Craft of Exile 里研究装备？</p>
              <p className="tool-description">
                用国服术语查词缀、搜基底，在英文工具里核对装备文本。
              </p>
              <PtPanel as="figure" variant="inset" className="tool-demo">
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
                    focusable="false"
                  >
                    <circle cx="10" cy="10" r="6" />
                    <path d="m15 15 5 5" />
                  </svg>
                  水晶法器
                  <span className="search-caret" aria-hidden="true" />
                  <span className="search-key">中文输入</span>
                </div>
                <div className="search-result">
                  <strong>水晶法器</strong>
                  <span lang="en">Crystal Focus</span>
                </div>
                <div className="demo-foot">选中英文候选 → 在原站搜索</div>
              </PtPanel>
              <div className="tool-meta">
                <span lang="en">CoE Beta · PoE2 · English</span>
                <span>可直接下载 · 电脑版 Chrome</span>
              </div>
              <a className="pt-btn pt-btn--wide" href="/extension/">
                <span>查看扩展与安装方式</span>
                <span aria-hidden="true">→</span>
              </a>
            </PtPanel>
          </div>
        </PtFrame>
        <section className="home-notes" aria-labelledby="notes-title">
          <PtDivider />
          <div className="home-notes__body">
            <div>
              <h2 id="notes-title">本次站点更新</h2>
              <p>构筑汉化与中文助手现已集中在首页，扩展安装方法和支持范围可在介绍页查看。</p>
            </div>
            <a className="text-link" href="/build/">
              打开构筑汉化 <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
