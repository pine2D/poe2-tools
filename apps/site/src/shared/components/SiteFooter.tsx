// 全站页脚（spec §6.1）：L0；完整声明（spec §5.14）与“第三方许可”链接到 /NOTICE.txt
import type { ReactElement } from 'react'

export function SiteFooter(): ReactElement {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <strong>PoE2 Tools</strong>
          <p>流放者做的工具，留更多时间给游戏。</p>
        </div>
        <nav aria-label="站点信息">
          <a href="https://github.com/pine2D/poe2-tools/issues">反馈问题</a>
          <a href="https://github.com/pine2D/poe2-tools">查看源码</a>
          <a href="/extension/#privacy">扩展隐私说明</a>
          <a href="/NOTICE.txt">第三方许可</a>
        </nav>
        <p className="site-legal">
          非官方工具，与 Grinding Gear Games、腾讯及 <span className="nw">Craft of Exile</span>{' '}
          <span className="nw">无关联</span>，也未获其认可。游戏文本版权归各权利方所有。
        </p>
      </div>
    </footer>
  )
}
