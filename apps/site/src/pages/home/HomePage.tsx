// 首页“对照长带”（2026-10-03 设计系统提升方案 §3.2 按场景分流；样稿 2026-10-03-home-b，本地留存）：
// 一扇无标题栏的 pt-frame--hero 是本页唯一的金属重点，里面是 hero 一句、两个场景入口和一条通栏示例带。
// 两个入口用同款 pt-btn，本页没有金属主按钮。DOM 顺序固定为 hero → 构筑入口 → 中文助手入口 → 示例带：
// ≤1099px 按 DOM 顺序先读到两组“场景句 + 按钮”；宽屏由 home.css 的网格把按钮排到带子下方，不用 order。
// 示例数据全部自造：左段取阶段看板的示例构筑，右段是扩展的搜索候选（自绘示意，不是 CoE 截图）。
// 图注、尾注与右段的搜索框、候选框用共用的 l1demo__ 类（shared/styles/l1-demo.css，扩展介绍页同用）；
// 候选框在这里拆成框顶／框腰／框底三段，落进对照带的 subgrid 行，让放大行与左段对齐。
import { Icon } from '../../shared/components/Icon'
import { Motif } from '../../shared/components/Motif'
import { PtFrame } from '../../shared/components/PtFrame'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { L1_DEMO_CANDIDATES, L1_DEMO_LABEL, L1_DEMO_QUERY } from '../../shared/l1Demo'

// 候选示意的数据与扩展介绍页共用（shared/l1Demo.ts）；第一项是选中项，放进框腰作为放大行
const [SELECTED, ...REST] = L1_DEMO_CANDIDATES

export function HomePage() {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="home" />
      <main id="main" tabIndex={-1} className="portal-main home-main">
        <PtFrame as="div" variant="hero" className="band">
          <div className="band__hero">
            <h1 className="pt-hero-title">
              少查译名，
              <br className="mobile-break" />
              <span className="pt-hero-title__gold">多研究构筑。</span>
            </h1>
            <p>英文社区的攻略和做装工具，直接用本服中文术语来看。</p>
          </div>

          <section className="entry entry--build" aria-labelledby="entry-build">
            <header className="entry__head">
              <h2 id="entry-build" className="pt-subhead pt-subhead--lg">
                我拿到了一份英文 <span className="pt-ext">.build</span>
              </h2>
              <p>
                导入攻略文件，按阶段看装备、词缀和技能的本服中文，
                <span className="nw">核对后下载中文版放进游戏。</span>
              </p>
            </header>
            <div className="entry__act">
              <a className="pt-btn" href="/build/" aria-describedby="facts-build">
                打开构筑汉化 <Icon name="arrow-right" />
              </a>
              <p className="entry__facts" id="facts-build">
                <span className="nw">网页工具</span>
                {' · '}
                <span className="nw">国服简体／台服繁体</span>
                {' · '}
                <span className="nw">文件只在本机处理</span>
              </p>
            </div>
          </section>

          <section className="entry entry--coe" aria-labelledby="entry-coe">
            <header className="entry__head">
              <h2 id="entry-coe" className="pt-subhead pt-subhead--lg">
                我在 <span className="nw">Craft of Exile</span> 做装
              </h2>
              <p>
                在 CoE 英文界面上直接看国服术语，用中文搜基底和词缀；
                <span className="nw">部分装备的国服文本可转成英文导入</span>
                <span className="nw">（支持范围见介绍页）。</span>
              </p>
            </header>
            <div className="entry__act">
              <a className="pt-btn" href="/extension/" aria-describedby="facts-coe">
                安装中文助手 <Icon name="arrow-right" />
              </a>
              <p className="entry__facts" id="facts-coe">
                <span className="nw">Chrome 扩展</span>
                {' · '}
                <span className="nw">CoE Beta 的 PoE2 英文界面</span>
                {' · '}
                <span className="nw">国服简体</span>
                {' · '}
                <span className="nw">本站下载</span>
              </p>
            </div>
          </section>

          <PtPanel as="section" variant="inset" className="strip" aria-label="两件工具的对照示例">
            <figure className="strip__side strip__side--build" aria-labelledby="demo-build-cap">
              <figcaption className="l1demo__cap" id="demo-build-cap">
                <span className="l1demo__tag">示例</span>
                <span>构筑汉化的阶段看板 · 示例构筑（自造）</span>
              </figcaption>
              <div className="strip__above">
                <table className="mini-board">
                  <caption className="visually-hidden">
                    两个阶段的装备对照；“新”表示本阶段新增，“换”表示换了另一件
                  </caption>
                  <colgroup>
                    <col className="mini-board__slot" />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <td />
                      <th scope="col" className="pt-stagehead">
                        31–60 级
                      </th>
                      <th scope="col" className="pt-stagehead">
                        终局
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">戒指2</th>
                      <td>
                        <span className="mini-cell">
                          <span className="mini-cell__title">
                            <span className="mini-cell__zh">红玉戒指</span>
                          </span>
                          <span className="mini-cell__en">
                            <span lang="en">Ruby Ring</span> · 词缀 1
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="mini-cell mini-cell--changed mini-cell--open">
                          <span className="mini-cell__title">
                            <span className="mini-cell__mark">换</span>
                            <span className="mini-cell__zh">蓝玉戒指</span>
                          </span>
                          <span className="mini-cell__en">
                            <span lang="en">Sapphire Ring</span> · 词缀 2
                          </span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mini-detail mini-detail--top">
                  <div className="mini-detail__head">
                    <b>终局 · 戒指2</b>
                    <span>
                      适用等级 <span className="pt-num">60–100</span>
                    </span>
                    <span className="mini-detail__ok">
                      <Icon name="check" size={14} />
                      词缀 <span className="pt-num">2/2</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="mini-detail mini-detail--mid">
                <ol className="pt-pairs">
                  <li className="pt-pair demo__spot">
                    <span className="pt-pair__no">1</span>
                    <span className="pt-pair__en" lang="en">
                      <span className="pt-num">+60</span> to maximum Life
                    </span>
                    <span className="pt-pair__zh">
                      <span className="pt-num">+60</span> 生命上限
                    </span>
                  </li>
                </ol>
              </div>
              <div className="strip__below">
                <div className="mini-detail mini-detail--bottom">
                  <ol className="pt-pairs" start={2}>
                    <li className="pt-pair">
                      <span className="pt-pair__no">2</span>
                      <span className="pt-pair__en" lang="en">
                        <span className="pt-num">+30%</span> to Fire Resistance
                      </span>
                      <span className="pt-pair__zh">
                        火焰抗性 <span className="pt-num">+30%</span>
                      </span>
                    </li>
                  </ol>
                </div>
                <table className="mini-board mini-board--cont">
                  <caption className="visually-hidden">看板续行</caption>
                  <colgroup>
                    <col className="mini-board__slot" />
                    <col />
                    <col />
                  </colgroup>
                  <tbody>
                    <tr>
                      <th scope="row">腰带</th>
                      <td>
                        <span className="mini-cell mini-cell--added">
                          <span className="mini-cell__title">
                            <span className="mini-cell__mark">新</span>
                            <span className="mini-cell__zh">稳步法印</span>
                          </span>
                          <span className="mini-cell__en">
                            <span lang="en">Surefooted Sigil</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="mini-cell">
                          <span className="mini-cell__title">
                            <span className="mini-cell__zh">稳步法印</span>
                          </span>
                          <span className="mini-cell__en">
                            <span lang="en">Surefooted Sigil</span>
                          </span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="l1demo__foot">词典里没有的行保留英文原文并标出，不猜测替换。</p>
            </figure>

            <div className="seam" aria-hidden="true">
              <span className="seam__line seam__line--top" />
              <span className="seam__knot">
                <Motif symbol="knot" />
              </span>
              <span className="seam__line seam__line--bottom" />
            </div>

            <figure className="strip__side strip__side--coe" aria-labelledby="demo-coe-cap">
              <figcaption className="l1demo__cap" id="demo-coe-cap">
                <span className="l1demo__tag">示例</span>
                <span>中文助手的搜索候选 · 自绘示意，不是 CoE 截图</span>
              </figcaption>
              <div className="strip__above">
                <p className="l1demo__label">{L1_DEMO_LABEL}</p>
                <div className="l1demo__field">
                  <Icon name="search" />
                  {L1_DEMO_QUERY}
                  <span className="l1demo__caret" aria-hidden="true" />
                </div>
                <div className="l1demo__box l1demo__box--top">
                  <p className="l1demo__help">
                    “{L1_DEMO_QUERY}”：选择英文查询（方向键移动，Enter 选择，Escape 取消）
                  </p>
                </div>
              </div>
              <div className="l1demo__box l1demo__box--mid">
                <div className="l1demo__opt l1demo__opt--selected demo__spot">
                  <span>{SELECTED[0]}</span>
                  <span aria-hidden="true">→</span>
                  <span lang="en">{SELECTED[1]}</span>
                </div>
              </div>
              <div className="strip__below">
                <div className="l1demo__box l1demo__box--bottom">
                  {REST.map(([zh, en]) => (
                    <div className="l1demo__opt" key={en}>
                      <span>{zh}</span>
                      <span aria-hidden="true">→</span>
                      <span lang="en">{en}</span>
                    </div>
                  ))}
                  <div className="l1demo__by" aria-hidden="true">
                    <Motif symbol="gem" className="pt-attr-ext" />
                    PoE2 中文助手 · 非官方
                  </div>
                </div>
              </div>
              <div className="coe-after l1demo__foot">
                <span>选中后</span>
                <span className="l1demo__field l1demo__field--sm">
                  <Icon name="search" size={14} />
                  <span lang="en">{SELECTED[1]}</span>
                </span>
                <span>原站照常用英文搜索</span>
              </div>
            </figure>
          </PtPanel>
        </PtFrame>
        <p className="home-common">简体与繁体译名按国服、台服分别整理，不做繁简互转。</p>
      </main>
      <SiteFooter />
    </div>
  )
}
