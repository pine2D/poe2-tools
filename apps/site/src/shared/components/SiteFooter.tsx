export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>PoE2 Tools</strong>
        <p>流放者做的工具，留更多时间给游戏。</p>
      </div>
      <nav aria-label="站点信息">
        <a href="https://github.com/pine2D/poe2-tools/issues">反馈问题</a>
        <a href="https://github.com/pine2D/poe2-tools">查看源码</a>
        <a href="/extension/#privacy">扩展隐私说明</a>
      </nav>
      <p className="site-legal">
        非官方社区工具，与 Grinding Gear Games、腾讯及 Craft of Exile
        无关联。游戏文本版权归各权利方所有。
      </p>
    </footer>
  )
}
