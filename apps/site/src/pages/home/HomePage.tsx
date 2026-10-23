// v4 首页：入口与真实术语示例分区展示，翻面由用户主动触发。
import { useState } from 'react'
import { Icon } from '../../shared/components/Icon'
import {
  L1DemoBy,
  L1DemoCaption,
  L1DemoHelp,
  L1DemoOption,
  L1DemoSearch,
} from '../../shared/components/L1Demo'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { L1_DEMO_CANDIDATES, L1_DEMO_CAPTION } from '../../shared/l1Demo'

// 候选示意的数据与扩展介绍页共用（shared/l1Demo.ts）；第一项是选中项，放进框腰作为放大行
const [SELECTED, ...REST] = L1_DEMO_CANDIDATES

// 示例物品：名称与词缀逐字取自正式国服词典（items.json、stats.json），类别名取自 CoE 界面译名（HomePage.test 核对）
const ITEM = {
  'zh-CN': {
    name: '蓝玉戒指',
    cls: '戒指',
    mods: ['+60 生命上限', '火焰抗性 +30%'],
  },
  en: {
    name: 'Sapphire Ring',
    cls: 'Rings',
    mods: ['+60 to maximum Life', '+30% to Fire Resistance'],
  },
} as const

function ItemTip({ lang, front }: { lang: 'zh-CN' | 'en'; front: boolean }) {
  const item = ITEM[lang]
  return (
    <div
      className={`home-tip ${front ? 'home-tip--front' : 'home-tip--back'}`}
      lang={lang}
      aria-hidden={front ? undefined : true}
    >
      <div className="home-tip__head">
        <strong
          className={
            lang === 'en' ? 'pt-nameplate__en home-tip__name' : 'pt-subhead home-tip__name'
          }
        >
          {item.name}
        </strong>
        <span className="home-tip__cls">{item.cls}</span>
      </div>
      <span className="home-tip__sep" aria-hidden="true" />
      <span className="home-tip__body">
        {item.mods.map((mod) => (
          <span key={mod}>{mod}</span>
        ))}
      </span>
    </div>
  )
}

export function HomePage() {
  const [english, setEnglish] = useState(false)
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="home" />
      <main id="main" tabIndex={-1} className="portal-main home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <p className="home-eyebrow">PoE2 · 构筑与做装</p>
            <h1 id="home-title" className="pt-hero-title">
              少查译名，
              <br />
              多研究构筑。
            </h1>
            <p className="home-lead">英文社区的攻略和做装工具，直接用本服中文术语来看。</p>
            <div className="home-actions">
              <a className="pt-plaque" href="/build/">
                打开构筑汉化
                <Icon name="arrow-right" />
              </a>
              <a className="pt-plaque" href="/extension/">
                安装中文助手
                <Icon name="arrow-right" />
              </a>
            </div>
            <p className="home-hero__note">构筑文件在本机处理 · 扩展整段翻译需自备 Key</p>
          </div>
          {/* 物品提示框（DESIGN“物品提示框”）：英文原文与中文预览两张叠放，只在用户点击后翻面；
              后面那张只露出名称栏，aria-hidden。整块可点由按钮的 ::after 铺满 .home-item__stack 实现 */}
          <figure className="home-item" aria-labelledby="hero-demo-caption">
            <div className="home-item__stack" data-front={english ? 'en' : 'zh'}>
              <ItemTip lang="zh-CN" front={!english} />
              <ItemTip lang="en" front={english} />
              <button
                className="home-item__flip"
                type="button"
                onClick={() => setEnglish((v) => !v)}
              >
                {english ? '翻面 · 查看中文' : '翻面 · 查看英文原文'}
              </button>
            </div>
            <figcaption id="hero-demo-caption">装备文本示意 · 自造样本</figcaption>
          </figure>
        </section>
        <section className="entry entry--build" aria-labelledby="entry-build">
          <header className="entry__head">
            <h2 id="entry-build" className="pt-subhead pt-subhead--lg">
              <span className="hero-clause">我拿到了一份英文</span>{' '}
              <span className="pt-ext">.build</span>
            </h2>
            <p>
              导入攻略文件，按阶段看装备、词缀和技能的本服中文，
              <span className="nw">核对后下载中文版。</span>
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
            <p className="entry__facts">尚未在游戏里实测加载。</p>
          </div>
          <figure className="strip__side strip__side--build" aria-labelledby="demo-build-cap">
            <L1DemoCaption id="demo-build-cap">构筑汉化的阶段看板 · 示例构筑（自造）</L1DemoCaption>
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
          <figure className="strip__side strip__side--coe" aria-labelledby="demo-coe-cap">
            <L1DemoCaption id="demo-coe-cap">{L1_DEMO_CAPTION}</L1DemoCaption>
            <div className="strip__above">
              <L1DemoSearch />
              <div className="l1demo__box l1demo__box--top">
                <L1DemoHelp />
              </div>
            </div>
            <div className="l1demo__box l1demo__box--mid">
              <L1DemoOption zh={SELECTED[0]} en={SELECTED[1]} selected className="demo__spot" />
            </div>
            <div className="strip__below">
              <div className="l1demo__box l1demo__box--bottom">
                {REST.map(([zh, en]) => (
                  <L1DemoOption key={en} zh={zh} en={en} />
                ))}
                <L1DemoBy />
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
        </section>
        <p className="home-common">简体与繁体译名按国服、台服分别整理，不做繁简互转。</p>
      </main>
      <SiteFooter />
    </div>
  )
}
