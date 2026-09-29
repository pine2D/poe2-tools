// 颗粒唯一源（spec §5.1）：高频细颗粒直接以 SVG data URI 引用，不预烘焙位图。
// 只用可擦除语法，不导入任何模块。

/** §5.1 高频细颗粒：200×200，feTurbulence fractalNoise baseFrequency .85、numOctaves 3、stitchTiles（mockup :24） */
export const GRAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
  '<filter id="n" color-interpolation-filters="sRGB">' +
  '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/>' +
  '<feColorMatrix values="1.7 0 0 0 -.35 1.7 0 0 0 -.35 1.7 0 0 0 -.35 0 0 0 0 1"/>' +
  '</filter>' +
  '<rect width="200" height="200" filter="url(#n)"/>' +
  '</svg>'

/** 'data:image/svg+xml,' + encodeURIComponent(GRAIN_SVG) */
export const GRAIN_DATA_URI = `data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}`

/** knot-full 档案图用的颗粒滤镜（mockup :545-550），只用于 ≥64px 的全形 */
export const KNOT_FULL_GRAIN_FILTER =
  '<filter id="grain" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
  '<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="5" result="t"/>' +
  '<feColorMatrix in="t" type="matrix" values=".6 0 0 0 .55 .6 0 0 0 .55 .6 0 0 0 .55 0 0 0 0 1" result="c"/>' +
  '<feComposite in="c" in2="SourceGraphic" operator="in" result="ci"/>' +
  '<feBlend in="SourceGraphic" in2="ci" mode="multiply"/>' +
  '</filter>'
