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
          <span>CoE 汉化 · 生效中</span>
          <p>未收录的术语保持英文；导入以原站结果为准。</p>
        </div>
        <dl className="ext-popup__rows">
          <div>
            <dt>启用简体中文</dt>
            <dd>
              已开启<span>国服术语、中文搜索与装备文本转换</span>
            </dd>
          </div>
          <div>
            <dt>中英对照</dt>
            <dd>
              可选<span>术语旁显示英文原名</span>
            </dd>
          </div>
        </dl>
        <p className="ext-popup__foot">整段翻译需在设置中配置服务</p>
      </div>
      <figcaption id="popup-caption">扩展弹窗示意 · 非当前页检测结果</figcaption>
    </figure>
  )
}
