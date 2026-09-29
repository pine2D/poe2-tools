import { SiteFooter } from '../../shared/components/SiteFooter'
import { SiteHeader } from '../../shared/components/SiteHeader'

// 固定到已经核对的源码快照；发行包上线后再更新入口，不猜测下载地址。
const docs =
  'https://github.com/pine2D/poe2-tools/blob/a68f6d8bacc7f336f6136a91665ca027063a536c/docs/chrome-extension'
export function ExtensionPage() {
  return (
    <div className="pt-backdrop portal">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <SiteHeader active="extension" />
      <main id="main" tabIndex={-1} className="portal-main extension-main">
        <section className="extension-intro">
          <div>
            <h1>
              熟悉的术语，
              <br />
              <span>就在原来的工具里。</span>
            </h1>
            <p>用 PoE2 中文助手，在 Craft of Exile 的英文界面查看国服简体术语。</p>
            <div className="extension-actions">
              <a className="site-button" href="#install">
                查看安装步骤
              </a>
              <a className="text-link" href="https://beta.craftofexile.com/?game=poe2">
                打开 CoE Beta <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="desktop-note">
              开发预览 · 需自行构建。适用于桌面 Chrome，请在电脑上安装。
            </p>
          </div>
          <aside className="release-note" aria-label="版本与支持范围">
            <span className="tool-kind">开发预览 · 0.1.111</span>
            <h2>先确认你的使用环境</h2>
            <dl>
              <dt>站点</dt>
              <dd>beta.craftofexile.com</dd>
              <dt>模式</dt>
              <dd>PoE2 → English</dd>
              <dt>语言</dt>
              <dd>国服简体中文</dd>
            </dl>
            <p>不支持旧版 www 站和 PoE1，也不会翻译所有英文段落。</p>
          </aside>
        </section>
        <section className="extension-capabilities" aria-label="主要能力">
          <article>
            <h2>看得懂</h2>
            <p>已收录的界面文字和术语显示为中文，装备属性保留英文对照；未收录的内容保持原文。</p>
          </article>
          <article>
            <h2>搜得到</h2>
            <p>在支持中文输入的搜索框中输入名称，再从中英对照的候选项里选择，由原站完成搜索。</p>
          </article>
          <article>
            <h2>核对后再导入</h2>
            <p>粘贴国服高级装备文本，查看转换后的英文。核对后填入原站，再由你继续操作。</p>
          </article>
        </section>
        <section id="install" className="guide-section">
          <div className="guide-heading">
            <h2>安装开发预览版</h2>
            <p>
              目前尚未提供公开发行包，也没有 Chrome
              商店安装入口。可以下载下方已核对版本的源码，自行构建安装。
            </p>
            <a className="text-link" href={`${docs}/install.md`}>
              查看源码与构建说明 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ol className="install-steps">
            <li>
              <h3>获取并构建扩展</h3>
              <p>
                下载下方固定版本的源码 ZIP 并解压。准备 Node 24 或更高版本及
                pnpm，在解压后的项目根目录执行构建命令。
              </p>
              <a
                className="text-link"
                href="https://github.com/pine2D/poe2-tools/archive/a68f6d8bacc7f336f6136a91665ca027063a536c.zip"
              >
                下载源码 ZIP（需构建）
              </a>
              <pre className="install-command">
                <code>
                  {'pnpm install --frozen-lockfile\npnpm extension:build\npnpm extension:check'}
                </code>
              </pre>
              <p>
                构建和检查通过后，在下一步加载 <code>apps/poe2-extension/dist/</code>{' '}
                目录，不需要另外打包。
              </p>
            </li>
            <li>
              <h3>加载到桌面 Chrome</h3>
              <p>
                打开 <code>chrome://extensions/</code>
                ，开启“开发者模式”，点击“加载已解压的扩展程序”，选择构建出的扩展目录。
              </p>
            </li>
            <li>
              <h3>打开支持的页面</h3>
              <p>
                进入 CoE Beta，选择 <strong>PoE2 → English</strong>
                ，刷新页面，并在扩展弹窗启用简体中文。
              </p>
            </li>
            <li>
              <h3>确认翻译生效</h3>
              <p>
                查看页面术语是否已翻译，在首页的基底搜索框输入“水晶法器”，检查是否出现 Crystal Focus
                候选项。转换装备文本后，仍需检查原站的导入结果。
              </p>
            </li>
          </ol>
        </section>
        <div className="extension-details">
          <section>
            <h2>更新与恢复</h2>
            <p>
              沿用原安装目录，重新构建或解压新版文件；在 Chrome
              扩展管理页点击“重新加载”，核对版本，再刷新已有 CoE 标签页。
            </p>
            <p>关闭汉化可恢复原文。禁用或卸载扩展后，也请刷新原站页面。</p>
          </section>
          <section id="privacy">
            <h2>文本处理与隐私</h2>
            <p>
              汉化和文本转换都在你的浏览器里完成，设置也保存在本机。填入英文并在 CoE
              点击继续后，由原站处理后续操作。
            </p>
            <p>扩展仅面向 CoE Beta，不需要游戏账号登录，也不代替你执行原站导入。</p>
            <a className="text-link" href={`${docs}/privacy.md`}>
              查看权限与隐私说明
            </a>
          </section>
          <section>
            <h2>支持范围与已知限制</h2>
            <p>
              开发预览版不保证支持所有页面和装备格式。遇到未收录的内容、有歧义的译文或损坏的数值时，会提示你检查，不会猜译。Windows
              原生中文输入法还需要在 Windows 环境下验证。
            </p>
            <a className="text-link" href={`${docs}/compatibility.md`}>
              查看兼容性记录
            </a>
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
