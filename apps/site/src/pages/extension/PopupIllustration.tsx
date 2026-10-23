import { Motif } from '../../shared/components/Motif'

/** 静态示意：不伪装成当前浏览器的状态，也不渲染无实际作用的开关。 */
export function PopupIllustration({ version }: { version: string }) {
  return (
    <figure className="ext-popup" aria-labelledby="popup-caption">
      <div className="ext-popup__panel">
        <div className="ext-popup__brand">
          <Motif symbol="gem" className="pt-attr-ext" />
          <b>PoE2 中文助手</b>
          <small>v{version}</small>
        </div>
        <div className="ext-popup__status">
          <b>beta.craftofexile.com</b>
          <span>CoE 中文显示 · 生效中</span>
          <p>未收录的术语保持英文；导入以原站结果为准。</p>
        </div>
        {/* 开关名、说明与状态字逐字取自真实弹窗（popup.html、popup/index.ts），ExtensionPage.test 核对 */}
        <dl className="ext-popup__rows">
          <div>
            <dt>启用简体中文</dt>
            <dd>
              开启<span>国服术语显示与中文搜索</span>
            </dd>
          </div>
          <div>
            <dt>显示中英对照</dt>
            <dd>
              关闭<span>保留英文，方便核对术语</span>
            </dd>
          </div>
        </dl>
        <p className="ext-popup__foot">整段翻译需在设置中配置服务</p>
      </div>
      <figcaption id="popup-caption">扩展弹窗示意 · 非当前页检测结果</figcaption>
    </figure>
  )
}
