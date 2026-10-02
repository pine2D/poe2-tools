import { Icon } from '../../shared/components/Icon'
import { PtDivider } from '../../shared/components/PtDivider'
import { PtForgeButton } from '../../shared/components/PtForgeButton'
import { PtFrame } from '../../shared/components/PtFrame'
import { PtPanel } from '../../shared/components/PtPanel'
import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'
import { downloadHref, EXTENSION_RELEASE, formatSize } from './release'

const { version, date, bytes } = EXTENSION_RELEASE

// 扩展介绍页（设计语言 spec §6.3；扩展发布 spec §9）：面向普通用户的下载与安装说明，不写任何开发向内容。
// hero 是页面唯一的一扇 pt-frame，环境卡是框内的 pt-panel card；能力区在框外，其余说明保持 L0。
export function ExtensionPage() {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="extension" />
      <main id="main" tabIndex={-1} className="portal-main extension-main">
        <PtFrame as="section" variant="hero" className="extension-intro">
          <div className="extension-intro__copy">
            <h1 className="pt-hero-title pt-hero-title--extension">
              熟悉的术语，
              <br />
              <span className="pt-hero-title__gold">就在原来的工具里。</span>
            </h1>
            {/* 末段写成一个字符串：空格与后文拆成两个文本节点时，390 下 text-wrap: balance 会改在
                “Craft of Exile / 的”断行，M0 断在“的 / 英文界面”（spec §6.7） */}
            <p className="extension-intro__lead">
              用 PoE2 中文助手，在 <span className="nw">Craft of Exile</span>
              {' 的英文界面查看国服简体术语。'}
            </p>
            {/* B12：DOM 中说明排在操作行之前，读屏在任何宽度都先读到；≥621px 由 CSS order 显示在操作行之后 */}
            <p className="extension-intro__note">
              <Icon name="info" className="extension-intro__note-icon" />
              <span>适用于电脑上的 Chrome。</span>
            </p>
            <div className="extension-actions">
              {/* ≤620px 时版本与大小换到第二行（extension.css），可访问名称仍是整句 */}
              <PtForgeButton as="a" href={downloadHref} download className="extension-download">
                下载扩展
                <span className="extension-download__meta">{`（v${version}，zip，${formatSize(bytes)}）`}</span>
              </PtForgeButton>
              <a className="text-link" href="https://beta.craftofexile.com/?game=poe2">
                打开 CoE Beta <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="extension-intro__legal">
              非官方工具，与 Grinding Gear Games、腾讯及 <span className="nw">Craft of Exile</span>{' '}
              <span className="nw">无关联</span>，也未获其认可。
            </p>
          </div>
          <PtPanel
            as="aside"
            variant="card"
            className="extension-env"
            aria-label="版本与支持范围"
            titlebar={{ title: '先确认你的使用环境', chip: `v${version}` }}
          >
            <dl className="extension-env__list">
              <dt>站点</dt>
              <dd>beta.craftofexile.com</dd>
              <dt>模式</dt>
              <dd>PoE2 → English</dd>
              <dt>语言</dt>
              <dd>国服简体中文</dd>
            </dl>
            <p className="extension-env__note">
              不支持旧版 www 站和 PoE1，也不会翻译所有<span className="nw">英文段落</span>。
            </p>
          </PtPanel>
        </PtFrame>
        <section className="extension-capabilities" aria-label="主要能力">
          <PtDivider />
          <div className="extension-capabilities__grid">
            <article>
              <h2 className="pt-subhead">看得懂</h2>
              <p>已收录的界面文字和术语显示为中文，装备属性保留英文对照；未收录的内容保持原文。</p>
            </article>
            <article>
              <h2 className="pt-subhead">搜得到</h2>
              <p>在支持中文输入的搜索框中输入名称，再从中英对照的候选项里选择，由原站完成搜索。</p>
            </article>
            <article>
              <h2 className="pt-subhead">核对后再导入</h2>
              <p>粘贴国服高级装备文本，查看转换后的英文。核对后填入原站，再由你继续操作。</p>
            </article>
          </div>
        </section>
        <section id="install" className="extension-guide">
          <div className="extension-guide__heading">
            <h2>安装</h2>
            <p>
              当前版本 v{version}，发布于 {date}。扩展还没有上架 Chrome
              应用商店，下载后按以下四步安装，只需操作一次。
            </p>
          </div>
          <div className="extension-guide__body">
            <ol className="extension-steps">
              <li>
                <h3>下载并解压</h3>
                <p>下载并解压到一个固定的文件夹（之后不要删除或移动它）。</p>
              </li>
              <li>
                <h3>打开开发者模式</h3>
                <p>
                  在 Chrome 地址栏打开 <code>chrome://extensions</code>，打开右上角“开发者模式”。
                </p>
              </li>
              <li>
                <h3>加载扩展</h3>
                <p>点“加载已解压的扩展程序”，选刚才的文件夹。</p>
              </li>
              <li>
                <h3>在 CoE Beta 中启用</h3>
                <p>
                  打开 CoE Beta，选 <strong>PoE2 → English</strong>{' '}
                  并刷新页面，在扩展弹窗里启用简体中文。
                </p>
              </li>
            </ol>
            <p className="extension-guide__note">
              Chrome
              会提示扩展不是来自应用商店，这是正常的；开发者模式需要一直开着，关掉后扩展会停用；Chrome
              更新后如果扩展被停用，回到扩展页重新打开即可。
            </p>
          </div>
        </section>
        <div className="extension-details">
          <section>
            <h2>确认翻译生效</h2>
            <p>
              查看页面术语是否已翻译，在首页的基底搜索框输入“水晶法器”，检查是否出现 Crystal Focus
              候选项。转换装备文本后，仍需检查原站的导入结果。
            </p>
          </section>
          <section id="update">
            <h2>更新与恢复</h2>
            <p>
              下载新版
              zip，解压覆盖原文件夹里的文件，在扩展页点该扩展的“重新加载”（圆形箭头），再刷新 CoE
              页面；弹窗里的“检查更新”会打开本页对比版本。
            </p>
            <p>关闭汉化可恢复原文。禁用或卸载扩展后，也请刷新原站页面。</p>
          </section>
          <section id="privacy">
            <h2>文本处理与隐私</h2>
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
          <section>
            <h2>支持范围与已知限制</h2>
            <p>
              当前版本不保证支持所有页面和装备格式。遇到未收录的内容、有歧义的译文或损坏的数值时，会提示你检查，不会猜译。Windows
              自带的中文输入法尚未完成验证，遇到输入问题请反馈。
            </p>
          </section>
          <section>
            <h2>遇到问题？</h2>
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
