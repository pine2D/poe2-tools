import type { ReactElement } from 'react'
import { Icon } from '../../shared/components/Icon'
import {
  L1DemoBy,
  L1DemoCaption,
  L1DemoHelp,
  L1DemoOption,
  L1DemoSearch,
} from '../../shared/components/L1Demo'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { L1_DEMO_CANDIDATES, L1_DEMO_CAPTION } from '../../shared/l1Demo'
import { PopupIllustration } from './PopupIllustration'
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

// v4 入口：下载与适用环境紧邻，弹窗仅作示意；安装和支持范围保留真实产品事实。
export function ExtensionPage(): ReactElement {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="extension" />
      <main id="main" tabIndex={-1} className="portal-main ext-main">
        <div className="ext-gate">
          <div className="ext-gate__copy">
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
              <p className="ext-gate__reading">
                也能预览攻略范围，在原文旁或侧栏读译文；整段翻译需自备服务 Key。
              </p>
            </header>
            <div className="ext-gate__split">
              <section className="ext-gate__col" id="download" aria-labelledby="download-title">
                <h2 className="visually-hidden" id="download-title">
                  下载扩展
                </h2>
                <p className="ext-gate__note">
                  适用于电脑上的 Chrome。扩展尚未上架 Chrome 应用商店，从本站下载
                  zip，按下面四步安装。
                </p>
                <div className="ext-download">
                  {/* ≤620px 时版本与大小换到第二行（extension.css），可访问名称仍是整句 */}
                  <a
                    href={downloadHref}
                    download
                    className="pt-btn pt-btn--primary ext-download__btn"
                  >
                    下载扩展
                    <span className="ext-download__meta">{`（v${version}，zip，${formatSize(bytes)}）`}</span>
                  </a>
                </div>
                <ul className="ext-facts">
                  <li>
                    发布于 <b>{date}</b>
                  </li>
                  {/* 权限逐项对应 manifest.json 的 permissions 与 optional_host_permissions */}
                  <li>
                    固定权限：本机存储、当前页读取与侧边栏（storage、activeTab、scripting、sidePanel）
                  </li>
                  <li>自动划词只在你授权的站点申请访问，安装时不取得全站权限</li>
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
              <section className="ext-gate__col" id="env" aria-labelledby="env-title">
                <h2 className="pt-subhead" id="env-title">
                  CoE 中文显示环境
                </h2>
                <dl className="ext-env">
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
            </div>
          </div>
          <PopupIllustration version={version} />
          <nav className="ext-route" aria-label="安装与使用">
            <ol>
              <li>
                <a href="#download">下载</a>
              </li>
              <li>
                <a href="#install">安装（四步）</a>
              </li>
              <li>
                <a href="#verify">CoE 中文显示</a>
              </li>
              <li>
                <a href="#guide">网页翻译与划词</a>
              </li>
            </ol>
          </nav>
        </div>

        <section id="install" className="ext-guide" aria-labelledby="install-title">
          <header className="ext-guide__head">
            <h2 className="pt-subhead pt-subhead--lg" id="install-title">
              安装
            </h2>
            <p>当前版本 v{version}。已装旧版时按“更新与恢复”操作。</p>
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
              <h3>打开中文助手</h3>
              {/* Chrome 的拼图图标先展开扩展列表，要再点一次扩展名才打开弹窗（样稿把两次点击写成了一次） */}
              <p>点工具栏的拼图图标，在展开的列表里点“PoE2 中文助手”打开弹窗。</p>
              <p>
                在 CoE Beta 选 <strong>PoE2 → English</strong> 并刷新，再打开“
                <strong>启用简体中文</strong>”；读攻略时点“预览此页翻译范围”。
              </p>
            </li>
          </ol>
          <p className="ext-guide__note">
            Chrome 会提示扩展不是来自应用商店。开发者模式需要一直开着，关掉后扩展会停用；Chrome
            更新后如果扩展被停用，回到扩展页重新打开。
          </p>
        </section>

        <section id="verify" className="ext-verify" aria-labelledby="verify-title">
          <span className="ext-verify__mark" aria-hidden="true">
            <Icon name="check" />
          </span>
          <h2 className="pt-subhead pt-subhead--lg" id="verify-title">
            确认 CoE 中文显示
          </h2>
          <p className="ext-verify__intro">装好后回到 CoE Beta 刷新页面，看下面两处。</p>
          <div className="ext-verify__grid">
            <div>
              <ul className="ext-see">
                <li>
                  <Icon name="check" />
                  <span>
                    导航、按钮等已收录的界面文字显示为中文
                    <small>未收录词条保持英文；可在弹窗打开“显示中英对照”。</small>
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    首页的基底搜索框输入“水晶”，出现中英对照的候选
                    <small>选“水晶法器”后搜索框填入 Crystal Focus，原站照常用英文搜索。</small>
                  </span>
                </li>
              </ul>
              {/* 自绘示意，不是 CoE 截图；不可交互。样式来自共用的 l1-demo.css，部件来自 shared/components/L1Demo.tsx，
                  标签、输入与候选来自 shared/l1Demo.ts（与首页对照带同一套部件与示例数据；标签是扩展对原站搜索框标签的译名，
                  候选名逐字取自正式词典，l1Demo.test.ts 核对）。这里用整框，选中项只靠类名 l1demo__opt--selected 表示外观 */}
              <PtPanel as="figure" variant="inset" className="ext-demo" aria-labelledby="demo-cap">
                <L1DemoCaption id="demo-cap">{L1_DEMO_CAPTION}</L1DemoCaption>
                <L1DemoSearch />
                <div className="l1demo__box">
                  <L1DemoHelp />
                  {L1_DEMO_CANDIDATES.map(([zh, en], index) => (
                    <L1DemoOption key={en} zh={zh} en={en} selected={index === 0} />
                  ))}
                  <L1DemoBy />
                </div>
                <p className="l1demo__foot">候选框底部带有“PoE2 中文助手 · 非官方”署名。</p>
              </PtPanel>
            </div>
            <dl className="ext-states">
              <div className="ext-state ext-state--ok">
                <dt>
                  <StateIcon kind="ok" />
                  <span className="ext-state__name">生效中</span>
                </dt>
                <dd>
                  两处都对上了。未收录的内容保持英文原文。转换装备文本后，仍要在原站核对导入结果。
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
                  非官方”署名的候选。原站自带的中文界面不算生效。
                  <ul className="ext-causes">
                    <li className="ext-cause">
                      <span className="ext-cause__why">不是 CoE Beta 页面</span>
                      <p className="ext-cause__fix">
                        地址请用 beta.craftofexile.com（不支持旧版 www
                        站），安装或切换后请刷新页面。
                      </p>
                    </li>
                    <li className="ext-cause">
                      <span className="ext-cause__why">没切到 PoE2 + English</span>
                      <p className="ext-cause__fix">
                        在原站选 PoE2，右上角语言选 English，再刷新页面。
                      </p>
                    </li>
                    <li className="ext-cause">
                      <span className="ext-cause__why">扩展未启用</span>
                      <p className="ext-cause__fix">
                        在 <code>chrome://extensions</code>{' '}
                        确认开发者模式和这个扩展都开着，开启后刷新页面。
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
            <h2 className="pt-subhead" id="update-title">
              更新与恢复
            </h2>
            <p>
              下载新版
              zip，解压覆盖原文件夹里的文件，在扩展页点该扩展的“重新加载”（圆形箭头），再刷新 CoE
              页面；弹窗里的“检查更新”会打开本页对比版本。
            </p>
            <p>关闭汉化可恢复原文。禁用或卸载扩展后，也请刷新原站页面。</p>
          </section>
          <section id="privacy" aria-labelledby="privacy-title">
            <h2 className="pt-subhead" id="privacy-title">
              文本处理与隐私
            </h2>
            <p>
              术语显示和装备文本转换都在你的浏览器里完成，设置也保存在本机。攻略翻译只在你点击后读取当前页；只有配置了翻译服务并开始翻译，侧边栏才把所选段落、必要原文语境和术语发给你自己选择的服务商。
            </p>
            <p>
              划词翻译在你点“翻译”后，由扩展后台发送选中的文字和相关术语，不附带页面地址。设置里的“测试连接”只发送一句简短的测试消息，不含攻略文字。
            </p>
            <p>
              扩展不内置任何 Key，Key 与译文缓存只保存在本机，Key
              未加密保存；可在侧边栏设置里一键清除。扩展不需要游戏账号登录，也不
              <span className="nw">代替</span>你执行原站导入。
            </p>
            <a
              className="text-link"
              href="https://github.com/pine2D/poe2-tools/blob/main/docs/chrome-extension/privacy.md"
            >
              查看权限与隐私说明
            </a>
          </section>
          <section id="guide" aria-labelledby="guide-title">
            <h2 className="pt-subhead" id="guide-title">
              攻略翻译
            </h2>
            <p>
              在攻略页点扩展图标，再点“预览此页翻译范围”，先核对正文、选区或点选区域。预览不发送正文；核对章节和用量后点“开始翻译”才发送。译文默认放在原文旁，也可仅在侧栏阅读、定位原文或恢复页面。
            </p>
            <p>
              整段翻译需要你自备翻译服务的 Key：默认 DeepSeek，也可以填写 OpenAI
              兼容接口。没有配置时，侧边栏仍会显示原文和术语标注。
            </p>
            <p>
              首版适配 Mobalytics 的 PoE2 构筑页与 poe2.com，其他网站使用通用正文读取；只支持桌面
              Chrome，不支持 PoE1。
            </p>
          </section>
          <section id="selection" aria-labelledby="selection-title">
            <h2 className="pt-subhead" id="selection-title">
              划词翻译
            </h2>
            <p>
              在已启用划词的网页上选中一段文字，会出现“翻译”入口。术语先按国服词典对照，整句要点“翻译”才会发送；单次最多
              6000 字符，输入框和密码框里的文字不会被选用。
            </p>
            <p>
              在弹窗里点“启用本页划词”可临时开启当前页；在“管理自动划词站点”里添加常用站点并授予该站访问权限后，打开这些站点会自动启用。移除站点会撤回只供它使用的权限。Craft
              of Exile 页面不启用划词。
            </p>
          </section>
          {/* 首页“支持范围见介绍页”的落点；按钮名逐字取自扩展实际渲染的文字与扩展对原站按钮的译名 */}
          <section id="convert" aria-labelledby="convert-title">
            <h2 className="pt-subhead" id="convert-title">
              装备文本转换
            </h2>
            <ol className="ext-convert">
              <li>
                在 CoE Beta 点原站的“<strong>导入装备</strong>”，粘贴在游戏里按{' '}
                <kbd>Ctrl+Alt+C</kbd> 复制的国服装备文本。
              </li>
              <li>
                点“<strong>预览中文转换</strong>”，对照原文与英文两栏核对。
              </li>
              <li>
                显示“可以填入”时，点“<strong>填入英文到原站导入框</strong>”；显示“需先核对 N
                行”时，点“<strong>第 N 行</strong>”定位核对后再预览。
              </li>
              <li>
                在原站点“<strong>继续</strong>”（Proceed）完成导入，结果以原站为准。
              </li>
            </ol>
            <p>
              咒符和传奇装备目前仅供对照；特殊标题、未收录的类别或属性格式可能无法转换，没转换的部分保持原文并标出提示。
            </p>
          </section>
          <section aria-labelledby="scope-title">
            <h2 className="pt-subhead" id="scope-title">
              支持范围与已知限制
            </h2>
            <p>
              未收录、有歧义或损坏的数值会保留原文并提示核对。Windows
              自带的中文输入法尚未完成验证，遇到输入问题请反馈。
            </p>
          </section>
          <section aria-labelledby="help-title">
            <h2 className="pt-subhead" id="help-title">
              遇到问题？
            </h2>
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
