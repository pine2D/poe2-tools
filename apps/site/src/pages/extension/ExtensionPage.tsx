import type { ReactElement } from 'react'
import { Icon } from '../../shared/components/Icon'
import { Motif } from '../../shared/components/Motif'
import { PtForgeButton } from '../../shared/components/PtForgeButton'
import { PtFrame } from '../../shared/components/PtFrame'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { L1_DEMO_CANDIDATES, L1_DEMO_LABEL, L1_DEMO_QUERY } from '../../shared/l1Demo'
import { downloadHref, EXTENSION_RELEASE, formatSize } from './release'

const { version, date, bytes } = EXTENSION_RELEASE
const COE_BETA = 'https://beta.craftofexile.com/?game=poe2'

type StateKind = 'ok' | 'part' | 'off'

// 状态图标：“部分生效”的半填圆要用实心路径，Icon 只画描边，所以三种状态图标都在本页内联；颜色随 dt 的文字色
function StateIcon({ kind }: { kind: StateKind }): ReactElement {
  return (
    <svg
      className="ext-state__icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      {kind === 'ok' && <path d="m8 12.5 2.8 2.8L16.5 9.5" />}
      {kind === 'part' && (
        <>
          <path d="M12 3v18" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === 'off' && <path d="m9 9 6 6M15 9l-6 6" />}
    </svg>
  )
}

// 扩展介绍页（二期重排，样稿 2026-10-03-extension，本地留存）：面向普通用户，不写开发向内容。
// 阅读顺序 = 确认环境 → 下载 → 四步安装 → 确认生效。唯一的金属重点是下载区那扇 pt-frame 与框内唯一的 pt-forge-btn；
// 安装、确认生效与参考信息都是 L0。“确认生效”的三种状态与第三期弹窗的当前页状态同词。
export function ExtensionPage(): ReactElement {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="extension" />
      <main id="main" tabIndex={-1} className="portal-main ext-main">
        <PtFrame as="div" variant="hero" className="ext-gate">
          <header className="ext-gate__hero">
            <h1 className="pt-hero-title pt-hero-title--extension">
              <span className="hero-clause">熟悉的术语，</span>
              <br className="mobile-break" />
              <span className="pt-hero-title__gold hero-clause">就在原来的工具里。</span>
            </h1>
            <p className="ext-gate__lead">
              PoE2 中文助手在 <span className="nw">Craft of Exile</span>
              {' 的英文界面上显示国服简体术语，可以用中文搜基底和词缀；'}
              <span className="nw">部分装备的国服文本</span>
              <span className="nw">可转成英文导入。</span>
            </p>
            <nav className="ext-route" aria-label="安装路线">
              <ol>
                <li>
                  <a href="#env">确认环境</a>
                </li>
                <li>
                  <a href="#download">下载</a>
                </li>
                <li>
                  <a href="#install">安装（四步）</a>
                </li>
                <li>
                  <a href="#verify">确认生效</a>
                </li>
              </ol>
            </nav>
          </header>
          <div className="ext-gate__split">
            <section className="ext-gate__col" id="env" aria-labelledby="env-title">
              <h2 className="pt-subhead" id="env-title">
                先确认环境
              </h2>
              <p className="ext-gate__note">以下几项都符合再下载。</p>
              <dl className="ext-env">
                <dt>浏览器</dt>
                <dd>电脑上的 Chrome</dd>
                <dt>站点</dt>
                <dd>
                  beta.craftofexile.com <small>新版 Beta</small>
                </dd>
                <dt>原站设置</dt>
                <dd>PoE2 → English</dd>
                <dt>术语</dt>
                <dd>
                  国服简体中文 <small>暂无台服繁体</small>
                </dd>
              </dl>
              <p className="ext-env__not">
                不支持旧版 www 站和 PoE1，也不会翻译所有<span className="nw">英文段落</span>。
              </p>
              <a className="text-link ext-env__link" href={COE_BETA}>
                打开 CoE Beta <Icon name="external" size={14} />
              </a>
            </section>
            {/* 中缝：从“确认环境”指向“下载”；铜线与菱结属于这扇框，不另算落点 */}
            <div className="ext-seam" aria-hidden="true">
              <span className="ext-seam__line" />
              <span className="ext-seam__knot">
                <Motif symbol="knot" />
              </span>
              <span className="ext-seam__line ext-seam__line--bottom" />
            </div>
            <section className="ext-gate__col" id="download" aria-labelledby="download-title">
              <h2 className="pt-subhead" id="download-title">
                再下载
              </h2>
              <p className="ext-gate__note">
                扩展还没有上架 Chrome 应用商店。从本站下载 zip，再按下面四步安装，只需操作一次。
              </p>
              <div className="ext-download">
                {/* ≤620px 时版本与大小换到第二行（extension.css），可访问名称仍是整句 */}
                <PtForgeButton as="a" href={downloadHref} download className="ext-download__btn">
                  下载扩展
                  <span className="ext-download__meta">{`（v${version}，zip，${formatSize(bytes)}）`}</span>
                </PtForgeButton>
              </div>
              <ul className="ext-facts">
                <li>
                  发布于 <b>{date}</b>
                </li>
                <li>只申请“存储”权限，用来在本机保存设置</li>
                <li>
                  <a className="text-link" href="#update">
                    已装旧版？看更新方法
                  </a>
                </li>
              </ul>
              <p className="ext-gate__legal">
                非官方工具，与 Grinding Gear Games、腾讯及{' '}
                <span className="nw">Craft of Exile</span> <span className="nw">无关联</span>
                ，也未获其认可。
              </p>
            </section>
          </div>
        </PtFrame>

        <section id="install" className="ext-guide" aria-labelledby="install-title">
          <header className="ext-guide__head">
            <h2 id="install-title">安装</h2>
            <p>当前版本 v{version}。下载后按顺序做一次，之后不用重复。</p>
          </header>
          <ol className="ext-steps">
            <li className="ext-step">
              <h3>解压到固定文件夹</h3>
              <p>把下载的 zip 解压到一个固定的文件夹，之后不要删除或移动它。</p>
            </li>
            <li className="ext-step">
              <h3>打开开发者模式</h3>
              <p>
                在 Chrome 地址栏打开 <code>chrome://extensions</code>，打开右上角“
                <strong>开发者模式</strong>”。
              </p>
            </li>
            <li className="ext-step">
              <h3>加载扩展</h3>
              <p>
                点“<strong>加载已解压的扩展程序</strong>”，选刚才解压的文件夹。
              </p>
            </li>
            <li className="ext-step">
              <h3>在 CoE Beta 中启用</h3>
              <p>
                打开 CoE Beta，选 <strong>PoE2 → English</strong> 并刷新页面。
              </p>
              {/* Chrome 的拼图图标先展开扩展列表，要再点一次扩展名才打开弹窗（样稿把两次点击写成了一次） */}
              <p>
                点工具栏的拼图图标，在展开的列表里点“PoE2 中文助手”打开弹窗，再打开“
                <strong>启用简体中文</strong>”。
              </p>
            </li>
          </ol>
          <p className="ext-guide__note">
            Chrome
            会提示扩展不是来自应用商店，这是正常的。开发者模式需要一直开着，关掉后扩展会停用；Chrome
            更新后如果扩展被停用，回到扩展页重新打开即可。
          </p>
        </section>

        <section id="verify" className="ext-verify" aria-labelledby="verify-title">
          <span className="ext-verify__mark" aria-hidden="true">
            <Icon name="check" />
          </span>
          <h2 id="verify-title">确认生效</h2>
          <p className="ext-verify__intro">装好后回到 CoE Beta 刷新页面，看下面两处。</p>
          <div className="ext-verify__grid">
            <div>
              <ul className="ext-see">
                <li>
                  <Icon name="check" />
                  <span>
                    导航、按钮等已收录的界面文字显示为中文
                    <small>
                      装备属性保留英文对照；词典没收录的内容保持英文、不猜译，这是正常现象。弹窗里打开“显示中英对照”可同时看到英文。
                    </small>
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    首页的基底搜索框输入“水晶”，出现中英对照的候选
                    <small>如下图：选“水晶法器 → Crystal Focus”，原站照常用英文搜索。</small>
                  </span>
                </li>
              </ul>
              {/* 自绘示意，不是 CoE 截图；不可交互。样式来自共用的 l1-demo.css，标签、输入与候选来自 shared/l1Demo.ts
                  （与首页对照带同一套 l1demo__ 类与示例数据；标签是扩展对原站搜索框标签的译名，候选名逐字取自正式词典，
                  l1Demo.test.ts 核对）。这里用整框，选中项只靠类名 l1demo__opt--selected 表示外观 */}
              <PtPanel as="figure" variant="inset" className="ext-demo" aria-labelledby="demo-cap">
                <figcaption className="l1demo__cap" id="demo-cap">
                  <span className="l1demo__tag">示例</span>
                  <span>中文助手的搜索候选 · 自绘示意，不是 CoE 截图</span>
                </figcaption>
                <p className="l1demo__label">{L1_DEMO_LABEL}</p>
                <div className="l1demo__field">
                  <Icon name="search" />
                  {L1_DEMO_QUERY}
                  <span className="l1demo__caret" aria-hidden="true" />
                </div>
                <div className="l1demo__box">
                  <p className="l1demo__help">
                    “{L1_DEMO_QUERY}”：选择英文查询（方向键移动，Enter 选择，Escape 取消）
                  </p>
                  {L1_DEMO_CANDIDATES.map(([zh, en], index) => (
                    <div
                      key={en}
                      className={index === 0 ? 'l1demo__opt l1demo__opt--selected' : 'l1demo__opt'}
                    >
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
                <p className="l1demo__foot">
                  候选框底部有“PoE2 中文助手 · 非官方”署名，用来区分扩展和原站的内容。
                </p>
              </PtPanel>
            </div>
            <dl className="ext-states">
              <div className="ext-state ext-state--ok">
                <dt>
                  <StateIcon kind="ok" />
                  <span className="ext-state__name">生效中</span>
                </dt>
                <dd>
                  两处都对上了。页面上仍有一些英文是正常的：未收录的内容保持原文。转换装备文本后，仍要在原站核对导入结果。
                </dd>
              </div>
              <div className="ext-state ext-state--part">
                <dt>
                  <StateIcon kind="part" />
                  <span className="ext-state__name">部分生效</span>
                </dt>
                <dd>
                  弹窗显示“部分生效”，或界面已有中文但基底搜索框输入“水晶”不出候选，或某一整块区域的界面文字仍全是英文。先刷新页面；仍不行请反馈，并写明是哪个区域。
                </dd>
              </div>
              <div className="ext-state ext-state--off">
                <dt>
                  <StateIcon kind="off" />
                  <span className="ext-state__name">未生效</span>
                </dt>
                <dd>
                  扩展弹窗顶部显示“未生效”；或者在搜索框输入“水晶”，没有出现带“PoE2 中文助手 ·
                  非官方”署名的候选。原站自带的中文界面不算生效。通常是下面三个原因之一：
                  <ul className="ext-causes">
                    <li className="ext-cause">
                      <span className="ext-cause__why">不是 CoE Beta 页面</span>
                      <p className="ext-cause__fix">
                        地址要是 beta.craftofexile.com；旧版 www
                        站不支持。地址没错时，可能是页面在安装或更新扩展之前就打开了，刷新即可。
                      </p>
                    </li>
                    <li className="ext-cause">
                      <span className="ext-cause__why">没切到 PoE2 + English</span>
                      <p className="ext-cause__fix">
                        在原站选 PoE2，右上角语言选 English，再刷新页面。语言不是 English
                        时，页面左下角会出现扩展的提示，弹窗里也会写明原因。
                      </p>
                    </li>
                    <li className="ext-cause">
                      <span className="ext-cause__why">扩展未启用</span>
                      <p className="ext-cause__fix">
                        在 <code>chrome://extensions</code>{' '}
                        确认开发者模式和这个扩展都开着，刚在扩展页打开扩展时要刷新页面；在弹窗里打开“启用简体中文”不用刷新。
                      </p>
                    </li>
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="ext-details">
          <section id="update" aria-labelledby="update-title">
            <h2 id="update-title">更新与恢复</h2>
            <p>
              下载新版
              zip，解压覆盖原文件夹里的文件，在扩展页点该扩展的“重新加载”（圆形箭头），再刷新 CoE
              页面；弹窗里的“检查更新”会打开本页对比版本。
            </p>
            <p>关闭汉化可恢复原文。禁用或卸载扩展后，也请刷新原站页面。</p>
          </section>
          <section id="privacy" aria-labelledby="privacy-title">
            <h2 id="privacy-title">文本处理与隐私</h2>
            <p>
              汉化和文本转换都在你的浏览器里完成，设置也保存在本机。填入英文并在 CoE
              点击继续后，由原站处理后续操作。
            </p>
            <p>
              扩展仅面向 CoE Beta，不需要游戏账号登录，也不<span className="nw">代替</span>
              你执行原站导入。
            </p>
            <a
              className="text-link"
              href="https://github.com/pine2D/poe2-tools/blob/main/docs/chrome-extension/privacy.md"
            >
              查看权限与隐私说明
            </a>
          </section>
          {/* 首页“支持范围见介绍页”的落点；按钮名逐字取自扩展实际渲染的文字与扩展对原站按钮的译名 */}
          <section id="convert" aria-labelledby="convert-title">
            <h2 id="convert-title">装备文本转换</h2>
            <ol className="ext-convert">
              <li>
                在 CoE Beta 点原站的“<strong>导入装备</strong>”，粘贴在游戏里按{' '}
                <kbd>Ctrl+Alt+C</kbd> 复制的国服装备文本。
              </li>
              <li>
                点“<strong>预览中文转换</strong>”，对照原文与英文两栏核对。
              </li>
              <li>
                预览后显示“可以填入”（译文完整）时，核对两栏后点“
                <strong>填入英文到原站导入框</strong>
                ”；显示“需先改正 N 行”时这个按钮不能用，点问题前面的“<strong>第 N 行</strong>
                ”会选中原文里的这一行，改正后重新预览。
              </li>
              <li>
                最后由你自己点原站的“<strong>继续</strong>
                ”（Proceed）完成导入。扩展不会替你提交，导入结果以原站为准。
              </li>
            </ol>
            <p>
              咒符和传奇装备目前仅供对照；特殊标题、未收录的类别或属性格式可能无法转换，没转换的部分保持原文并标出提示。
            </p>
          </section>
          <section aria-labelledby="scope-title">
            <h2 id="scope-title">支持范围与已知限制</h2>
            <p>
              当前版本不保证支持所有页面和装备格式。遇到未收录的内容、有歧义的译文或损坏的数值时，会提示你检查，不会猜译。Windows
              自带的中文输入法尚未完成验证，遇到输入问题请反馈。
            </p>
          </section>
          <section aria-labelledby="help-title">
            <h2 id="help-title">遇到问题？</h2>
            <p>
              可以先关闭扩展，看看原站是否也有同样的问题。反馈时请说明页面、操作步骤和扩展版本；如果附上装备样本，请先删去私人信息。
            </p>
            <a className="text-link" href="https://github.com/pine2D/poe2-tools/issues">
              反馈问题
            </a>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
