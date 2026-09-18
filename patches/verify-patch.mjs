// 补丁产物验证脚本(每次重打补丁后跑:bun verify-patch.mjs)
// 注意:不要用 bun -e 内联跑本文件内容——中文经 Windows shell 传输会乱码,必须落文件
import { readFileSync } from "fs";
const bundle = readFileSync("./patched/bundle.js", "utf8");
const html = readFileSync("./patched/index.html", "utf8");
// 版本号自动对齐 patch-frontend.mjs 顶部的 const V(单一出处,防两文件各改各的)
const V = Number((readFileSync("./patch-frontend.mjs", "utf8").match(/const V = (\d+);/) || [])[1]);
if (!V) throw new Error("从 patch-frontend.mjs 提取 const V 失败");
const checks = [
  ["bundle: 数据源指向本站", '/wtstats/data"', "bundle"],
  ["bundle: 数据源 getter 可切换(第11轮)", 'Object.defineProperty(e,"dataUrl",{get:function(){return window.__WT_DATA_URL__||"/wtstats/data"}})', "bundle"],
  ["bundle: 表格 layout=fitDataStretch(第15轮)", 'layout:"fitDataStretch"', "bundle"],
  ["bundle: 剩余宽度按比例分配(第17轮)", 'Math.floor(r*c.getWidth()/w)', "bundle"],
  ["html: Export按钮间距(第17轮)", '#selected-table-div > button { margin-top: 10px; }', "html"],
  ["html: 右下角来源链接(第18轮)", '#wt-src-links { position: fixed; right: 10px; bottom: 5px;', "html"],
  ["html: 来源链接指向上游(第18轮)", 'https://github.com/ControlNet/wt-data-project.web', "html"],
  ["html: 来源链接指向本仓库(第18轮)", 'https://github.com/rzfff/wtstats-mirror', "html"],
  ["bundle: 趋势图图例国家汉化(第16轮)", '.text(d.Container.get(h.Localization.Nation)(t)).attr("text-anchor"', "bundle"],
  ["bundle: 无 controlnet.space 残留", null, "bundle-neg:controlnet.space"],
  ["bundle: 强制简中(主)", '(e="zh-CN",n=!0),l.select("html")', "bundle"],
  ["bundle: 强制简中(catch)", 'console.error(t),e="zh-CN"', "bundle"],
  ["bundle: 表格列·载具名(含中文formatter,第19轮)", '{title:"载具名",field:"ts_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__,r=z&&z[String(e).toLowerCase()]||e;return r!==e&&t.getElement().setAttribute("title",e),r}}', "bundle"],
  ["bundle: 表格列·Wiki 名(含中文formatter,第19轮)", '{title:"Wiki 名",field:"wk_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__,r=z&&z[String(e).toLowerCase()]||e;return r!==e&&t.getElement().setAttribute("title",e),r}}', "bundle"],
  ["html: 中文名包已注入(第19轮)", "window.__WT_NAMES_ZH__={", "html"],
  ["html: 中文名在 bundle 之前(第19轮)", null, "html-order:window.__WT_NAMES_ZH__=|dist/bundle.js?v="],
  ["bundle: 表格列·国家", '{title:"国家",field:"nation"', "bundle"],
  ["bundle: 表格列·类别", '{title:"类别",field:"class"', "bundle"],
  ["bundle: 表格列·分房", '{title:"分房",field:"br"', "bundle"],
  ["bundle: 表格列·场次", '{title:"场次",field:"battles"', "bundle"],
  ["bundle: 表格列·胜率", '{title:"胜率",field:"win_rate"', "bundle"],
  ["bundle: 表格列·空击杀/场", '{title:"空击杀/场"', "bundle"],
  ["bundle: 表格列·空击杀/亡", '{title:"空击杀/亡"', "bundle"],
  ["bundle: 表格列·地击杀/场", '{title:"地击杀/场"', "bundle"],
  ["bundle: 表格列·地击杀/亡", '{title:"地击杀/亡"', "bundle"],
  ["bundle: 表格列·高级", '{title:"高级",field:"is_premium"', "bundle"],
  ["bundle: 表格列·研发/场", '{title:"研发/场"', "bundle"],
  ["bundle: 表格列·银狮/场", '{title:"银狮/场"', "bundle"],
  ["bundle: 表格值·十国映射", '{Germany:"德国",USA:"美国",USSR:"苏联",Britain:"英国",Japan:"日本",France:"法国",Italy:"意大利",China:"中国",Sweden:"瑞典",Israel:"以色列"}[e]||e}', "bundle"],
  ["bundle: 表格值·是/否", '"True"===e?"是":"否"', "bundle"],
  ["bundle: 表格值·地面/空中", '({Ground_vehicles:"地面",Aviation:"空中"})[t.cls]||t.cls', "bundle"],
  ["html: bundle 引用 v=" + V, `dist/bundle.js?v=${V}`, "html"],
  ["bundle: 官网导航版 SVG logo(第11轮)", 'img/logo-wt.svg', "bundle"],
  ["bundle: 高级列金底深字", '#4a3b00', "bundle"],
  ["bundle: 折线图tooltip日期行", '日期: "+l.timeFormat("%Y/%m/%d")', "bundle"],
  ["html: tooltip文字固定深色", '#content svg g.tooltip text { fill: #20242b; }', "html"],
  ["html: 加载时长提示", "首次加载约需十秒", "html"],
  ["html: 藏 tab CSS", "a#todo-list", "html"],
  ["html: 美化层-纵向布局", "flex-direction: column", "html"],
  ["html: 美化层-横排筛选栏", "display: flex; flex-wrap: wrap; align-items: center", "html"],
  ["html: 美化层-下拉框", "div#sidebar select {", "html"],
  ["html: 美化层-导航栏flex居中", "display: flex; flex-direction: row; align-items: center", "html"],
  ["html: 暗色主题变量", ':root[data-theme="dark"]', "html"],
  ["html: 跟随系统暗色", "prefers-color-scheme: dark", "html"],
  ["html: 主题切换按钮", "wt-theme-btn", "html"],
  ["html: 官网 favicon(第11轮)", 'href="img/favicon.ico"', "html"],
  ["html: 全量模式引导脚本(第11轮)", "window.__WT_DATA_URL__='/wtstats/data/full'", "html"],
  ["html: 全量改 sessionStorage(第15轮)", "sessionStorage.getItem('wt-data-mode')", "html"],
  ["html: 清理旧 localStorage 标记(第15轮)", "localStorage.removeItem('wt-data-mode')", "html"],
  ["html: 弹窗无记住句(第15轮)", null, "html-neg:会记住选择"],
  ["html: 全量数据按钮(第11轮)", "wt-data-btn", "html"],
  ["html: 按钮文字版·全量态(第13轮)", "db.textContent='精简数据'", "html"],
  ["html: 按钮文字版·精简态(第12轮)", "db.textContent='全部数据'", "html"],
  ["html: 全量弹窗·网页版(第12轮)", 'id="wt-dialog"', "html"],
  ["html: 弹窗标题(第12轮)", "加载全部数据?", "html"],
  ["html: 全量遮罩文案(第11轮)", "全量数据模式:数据量较大", "html"],
  ["html: 遮罩覆盖 joined(第11轮)", "indexOf('/joined/')>-1", "html"],
  ["html: 表格主题-#content前缀压特异性", "#content .tabulator .tabulator-row { background: var(--wt-card); color: var(--wt-ink);", "html"],
  ["html: 主题引导防闪烁", "主题引导", "html"],
  ["html: 加载遮罩元素", 'id="wt-loading"', "html"],
  ["html: XHR 拦截器", "XMLHttpRequest.prototype.open", "html"],
  ["html: fetch 拦截器", "window.fetch=function", "html"],
  ["html: 无统计代码残留", null, "html-neg:googletagmanager|cloudflareinsights|getloli"],
];
let bad = 0;
for (const [name, pat, mode] of checks) {
  let ok;
  if (mode === "bundle") ok = bundle.includes(pat);
  else if (mode === "html") ok = html.includes(pat);
  else if (mode?.startsWith("bundle-neg:")) ok = !new RegExp(mode.slice(12)).test(bundle);
  else if (mode?.startsWith("html-neg:")) ok = !new RegExp(mode.slice(9)).test(html);
  else if (mode?.startsWith("html-order:")) { // "html-order:甲|乙" = 甲必须出现在乙之前(中文名包要先于 bundle 就位)
    const [a, b] = mode.slice(11).split("|");
    const ia = html.indexOf(a), ib = html.indexOf(b);
    ok = ia > -1 && ib > -1 && ia < ib;
  }
  if (!ok) bad++;
  console.log((ok ? "  OK  " : "MISS!") + " " + name);
}
console.log(bad === 0 ? "\n全部通过 ✅" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
