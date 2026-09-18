// ============================================================================
// wtstats 前端补丁脚本(在本地 wtstats-deploy-plan 目录下跑:bun patch-frontend.mjs)
// 输入:inspect/ 内上游 web 分支 tarball 解包产物(下载命令见 steps.md)
// 输出:patched/index.html + patched/bundle.js(scp 到服务器 dist/ 覆盖)
// 原则:每处替换必须恰好命中 1 次,否则报错拒出产物(防上游结构变化后补丁打歪)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from "fs";

// bundle 缓存版本号(全局唯一出处,verify-patch.mjs 会读走这个数自动对齐):
// 改了任何 bundle 补丁 → V + 1 → 重跑;index.html 走 no-cache,改注入层可不递增
const V = 13;

mkdirSync("patched", { recursive: true });

// ---- bundle.js:3 处替换 ----
let bundle = readFileSync("inspect/dist/bundle.js", "utf8");
const patches = [
  // ① 数据源:作者域名 → 本站同源路径(前端的 metadata/ranks/joined 全部请求都拼在它后面);
  //    第 11 轮改成 getter:默认读精简数据,注入层设 window.__WT_DATA_URL__='/wtstats/data/full'
  //    即把全部请求切到全量数据(「全部数据」按钮:设全局+整页重载;bundle 里 4 个消费点全是
  //    活属性读取,每次请求都重新走 getter,这是不重载就切不干净的图表内存缓存之外的唯一通路)
  ["数据源域名→本站同源路径(getter 可切换)",
   'e.dataUrl="https://controlnet.space/wt-data-project.data"',
   'Object.defineProperty(e,"dataUrl",{get:function(){return window.__WT_DATA_URL__||"/wtstats/data"}})'],
  // ② 「待定计划」页签:实时抓作者域名的 README → 读本地文件(消除外部运行时依赖/CORS 失败)
  ["待定计划页签 README→本地",
   's.text("https://wt.controlnet.space/README.md"',
   's.text("/wtstats/README.md"'],
  // ③ 导航栏 logo:官网页头导航同款 logo-wt.svg(167×80 单色图形,官方自己就在 39-80px 高度用它;
  //    第 9 轮的中文 hero 版 505×288 是大横幅素材,36px 高下中文小字糊成一片,第 11 轮换掉;
  //    商标属 Gaijin,仅作游戏识别用)
  ["导航 logo→官网导航版 SVG",
   'image="/img/logo64.png"',
   'image="img/logo-wt.svg"'],
  // ④ 语言判断:上游只认 navigator.language 恰好=="zh-CN"或"zh",其余(含 zh-TW/zh-Hans-CN/英文环境)
  //    全部回落英文 → 强制默认简中(站长裁定:中文最重要)
  ["语言判断→强制简中(主)",
   '"zh-CN"===navigator.language||"zh"===navigator.language?(e="zh-CN",n=!0):e="en-US"',
   '(e="zh-CN",n=!0)'],
  // ⑤ 同上,异常分支的英文回落一并改掉(保险)
  ["语言判断→强制简中(catch 分支)",
   'console.error(t),e="en-US"}return[4,fetch("config/i18n/',
   'console.error(t),e="zh-CN"}return[4,fetch("config/i18n/'],
  // ⑥ 表格列标题汉化(上游把原始字段名直接当标题显示;共 14 列,全在唯一一处 Tabulator 实例化里)
  ["表格列:载具名", '{title:"ts_name",field:"ts_name"}', '{title:"载具名",field:"ts_name"}'],
  ["表格列:Wiki 名", '{title:"wk_name",field:"wk_name"}', '{title:"Wiki 名",field:"wk_name"}'],
  // ⑥-2 载具中文名(第 19 轮,/wtapi/ 管线落地):表格 ts_name/wk_name 两列的数据就是 identifier
  //     (上游 selectColumns 里 ts_name:t.name、wk_name:t.wk_name,而 joined CSV 的 name 列=identifier),
  //     formatter 查注入的 window.__WT_NAMES_ZH__(key=小写 identifier → datamine units.csv 官方简中,
  //     由 ../wtapi-build/gen_names_zh.py 生成);查不到(事件车等)回落原值;底层数据不动(排序/CSV 导出仍按 identifier),
  //     命中时 hover 的 title 提示显示原 identifier 便于核对
  ["表格列:载具名中文 formatter(第19轮)",
   '{title:"载具名",field:"ts_name"}',
   '{title:"载具名",field:"ts_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__,r=z&&z[String(e).toLowerCase()]||e;return r!==e&&t.getElement().setAttribute("title",e),r}}'],
  ["表格列:Wiki名中文 formatter(第19轮)",
   '{title:"Wiki 名",field:"wk_name"}',
   '{title:"Wiki 名",field:"wk_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__,r=z&&z[String(e).toLowerCase()]||e;return r!==e&&t.getElement().setAttribute("title",e),r}}'],
  ["表格列:国家", '{title:"nation",field:"nation"', '{title:"国家",field:"nation"'],
  ["表格列:类别", '{title:"class",field:"class"', '{title:"类别",field:"class"'],
  ["表格列:分房(含列宽)", '{title:"br",field:"br",maxWidth:50}', '{title:"分房",field:"br",maxWidth:72}'],
  ["表格列:场次", '{title:"battles",field:"battles"', '{title:"场次",field:"battles"'],
  ["表格列:胜率", '{title:"win_rate",field:"win_rate"', '{title:"胜率",field:"win_rate"'],
  ["表格列:空击杀/场", '{title:"air_frags_per_battle",field:"air_frags_per_battle"}', '{title:"空击杀/场",field:"air_frags_per_battle"}'],
  ["表格列:空击杀/亡", '{title:"air_frags_per_death",field:"air_frags_per_death"}', '{title:"空击杀/亡",field:"air_frags_per_death"}'],
  ["表格列:地击杀/场", '{title:"ground_frags_per_battle",field:"ground_frags_per_battle"}', '{title:"地击杀/场",field:"ground_frags_per_battle"}'],
  ["表格列:地击杀/亡", '{title:"ground_frags_per_death",field:"ground_frags_per_death"}', '{title:"地击杀/亡",field:"ground_frags_per_death"}'],
  ["表格列:高级", '{title:"premium",field:"is_premium"', '{title:"高级",field:"is_premium"'],
  ["表格列:研发/场(摘列宽帽)", '{title:"rp_rate",field:"rp_rate",maxWidth:84}', '{title:"研发/场",field:"rp_rate"}'],
  ["表格列:银狮/场(摘列宽帽)", '{title:"sl_rate",field:"sl_rate",maxWidth:80}', '{title:"银狮/场",field:"sl_rate"}'],
  // ⑦ 表格值汉化:国家列 formatter 的返回值套十国映射(配色仍按原值算,不受影响)
  ["表格值:国家名",
   'i=p.nationColors.get(e);return n.style.backgroundColor=i,n.style.color=p.utils.genTextColorFromBgColor(i),e}',
   'i=p.nationColors.get(e);return n.style.backgroundColor=i,n.style.color=p.utils.genTextColorFromBgColor(i),{Germany:"德国",USA:"美国",USSR:"苏联",Britain:"英国",Japan:"日本",France:"法国",Italy:"意大利",China:"中国",Sweden:"瑞典",Israel:"以色列"}[e]||e}'],
  // ⑧ 表格值汉化:高级列 True/False → 是/否
  ["表格值:是/否",
   'return"True"===e&&(t.getElement().style.backgroundColor=p.COLORS.YELLOW),e}',
   'return"True"===e&&(t.getElement().style.backgroundColor=p.COLORS.YELLOW,t.getElement().style.color="#4a3b00"),"True"===e?"是":"否"}'],
  // ⑨ 表格值汉化:类别列 地面/空中
  ["表格值:类别",
   'nation:t.nation,class:t.cls,br:n.br',
   'nation:t.nation,class:({Ground_vehicles:"地面",Aviation:"空中"})[t.cls]||t.cls,br:n.br'],
  // ⑩ 表格 layout:fitColumns → fitDataStretch(第 14 轮引入,第 15 轮定稿):fitColumns=比例铺满但拖列宽
  //    松手弹回;fitDataFill=列宽内容自适应+拖拽可保持,但宽屏下列宽总和小于页面时表尾空一块;
  //    fitDataStretch=同 fitDataFill 的拖拽保持,且最后一列自动伸缩吸收剩余宽度——表格永远正好填满页面
  ["表格 layout→fitDataStretch(铺满+拖拽可保持)",
   'layout:"fitColumns"',
   'layout:"fitDataStretch"'],
  // ⑪ 总体趋势图图例国家名汉化(第 16 轮):StackedLineChartLegend 直接 .text(t) 输出原始 nation key
  //    (如 "USA"),没走 i18n——语言包 zh-CN.json 的 Nation 节点本就有十国中文,隔壁热力图图例都汉化了;
  //    改成与热力图图例同款 Container.get(Localization.Nation)(t)(模块内 d/h 标识符同名同作用域,已核对)
  ["总体趋势图图例国家名汉化",
   '.attr("y",e-15-30*n).text(t).attr("text-anchor","start")',
   '.attr("y",e-15-30*n).text(d.Container.get(h.Localization.Nation)(t)).attr("text-anchor","start")'],
  // ⑫ 表格剩余宽度按比例分配(第 16 轮引入平分,第 17 轮改比例):fitDataStretch 原版把全部余量塞给
  //     最后一列(超宽);平分版(第 16 轮)在宽屏下把窄列也撑得老长且"正好填满"在取整/边框下易溢出;
  //     现改为【按各列当前宽度比例】分配给可见且无 maxWidth 帽的列(名字列基数大吃得多、击杀列只加
  //     一点点,视觉均衡),只加 floor 整数份、故意留 ≤列数像素的余量 → 永不触发横向滚动条;
  //     setWidth 自带 minWidth 兜底;r<0(窄屏溢出)走原回落分支
  ["表格剩余宽度按比例分配(替代末列独占/平分)",
   'fitDataStretch:function(t,e){var n=0,i=this.table.rowManager.element.clientWidth,r=0,o=!1;t.forEach(((t,e)=>{t.widthFixed||t.reinitializeWidth(),(this.table.options.responsiveLayout?t.modules.responsive.visible:t.visible)&&(o=t),t.visible&&(n+=t.getWidth())})),o?(r=i-n+o.getWidth(),this.table.options.responsiveLayout&&this.table.modExists("responsiveLayout",!0)&&(o.setWidth(0),this.table.modules.responsiveLayout.update()),r>0?o.setWidth(r):o.reinitializeWidth()):this.table.options.responsiveLayout&&this.table.modExists("responsiveLayout",!0)&&this.table.modules.responsiveLayout.update()}',
   'fitDataStretch:function(t,e){var n=0,i=this.table.rowManager.element.clientWidth,r=0,o=!1,s,w;t.forEach(((t,e)=>{t.widthFixed||t.reinitializeWidth(),(this.table.options.responsiveLayout?t.modules.responsive.visible:t.visible)&&(o=t),t.visible&&(n+=t.getWidth())})),o?(r=i-n,this.table.options.responsiveLayout&&this.table.modExists("responsiveLayout",!0)&&(o.setWidth(0),this.table.modules.responsiveLayout.update()),r>0?(s=t.filter(function(c){return c.visible&&!c.maxWidth}),w=0,s.forEach(function(c){w+=c.getWidth()}),w>0&&s.forEach(function(c){c.setWidth(c.getWidth()+Math.floor(r*c.getWidth()/w))})):o.reinitializeWidth()):this.table.options.responsiveLayout&&this.table.modExists("responsiveLayout",!0)&&this.table.modules.responsiveLayout.update()}'],
  // ⑬ 折线图悬浮标签加日期行(第 9 轮):上游 onPointerMove 已算出 selectedDate(最近数据期),
  //    但 tooltip 只显示「国家 分房: 胜率」;现把日期作为第 1 行插进去(nRow=20 行富余)。
  //    括号对称:update([日期串].concat(this.selected.map(…)),t) —— 头部开 [.concat(,尾部补一个 )
  ["折线图 tooltip 加日期行",
   '[4,this.tooltip.update(this.selected.map((function(t){var e;return"".concat(p.Container.get(f.Localization.Nation)(t.nation)," ")+"".concat(t.br,": ").concat(u.round(null===(e=t.values.find((function(t){return t.date.getTime()===i.selectedDate})))||void 0===e?void 0:e.value,3))})),t)]',
   '[4,this.tooltip.update(["日期: "+l.timeFormat("%Y/%m/%d")(new Date(i.selectedDate))].concat(this.selected.map((function(t){var e;return"".concat(p.Container.get(f.Localization.Nation)(t.nation)," ")+"".concat(t.br,": ").concat(u.round(null===(e=t.values.find((function(t){return t.date.getTime()===i.selectedDate})))||void 0===e?void 0:e.value,3))}))),t)]'],
];
for (const [name, from, to] of patches) {
  const n = bundle.split(from).length - 1;
  if (n !== 1) throw new Error(`补丁「${name}」命中 ${n} 次(应为 1),上游结构可能变了,先重新解剖`);
  bundle = bundle.replace(from, to);
}
writeFileSync("patch-table.json", JSON.stringify(patches.map(([name, from, to]) => ({ name, from, to })), null, 1));
if (/controlnet\.space/.test(bundle)) throw new Error("bundle.js 仍残留 controlnet.space,检查遗漏");
// 【语法关卡】2026-09-18 事故增设:v3 曾因一条 from/to 大括号不对称的补丁产出语法非法的 bundle 直接打挂线上,
// 字符串核对查不出这类错,必须在写盘前整体解析一遍
try { new Function(bundle); } catch (e) { throw new Error(`补丁产物语法解析失败(禁止上线!): ${e.message}`); }
writeFileSync("patched/bundle.js", bundle);

// ---- index.html:favicon 相对化 + 删三段统计代码 + bundle 引用加版本号 ----
let html = readFileSync("inspect/index.html", "utf8");
// favicon:换官网 warthunder.com 的 favicon.ico(36×36 飞机+菱形靶标,第 11 轮站长指定),并子路径相对化
html = html.replace('href="/img/logo.ico"', 'href="img/favicon.ico"');
// bundle.js 走全局 30 天缓存且无构建指纹:每次重发补丁版必须递增 ?v=N 击穿浏览器缓存(改顶部的 V)
html = html.replace('<script src="dist/bundle.js"></script>', `<script src="dist/bundle.js?v=${V}"></script>`);
// 隐藏无用导航项(站长裁定):待定计划/GitHub源码/数据/反馈/论坛NEW/作者 —— 纯 CSS,不动 JS
html = html.replace("</head>", `<style>
/* ===== 镜像定制层 ===== */
/* 1) 隐藏无用的导航项 */
#navbar li:has(> a#todo-list), #navbar li:has(> a#web-repo), #navbar li:has(> a#data-repo),
#navbar li:has(> a#issues), #navbar li:has(> a#forum), #navbar li:has(> a#github) { display: none !important; }
#navbar a#todo-list, #navbar a#web-repo, #navbar a#data-repo,
#navbar a#issues, #navbar a#forum, #navbar a#github { display: none; }

/* 2) 界面美化层 v2(2026-09-18 第 7 轮):暗/亮双主题(跟随系统+手动切换)+ 横排筛选栏;
   只碰页面骨架与文字色,图表数据配色(热力图/图例/单元格)保持原样 */
:root {
  --wt-bg1: #f7f8fa; --wt-bg2: #e9edf2; --wt-card: #ffffff; --wt-line: #e3e6ea;
  --wt-ink: #2b2f36; --wt-sub: #6b7280; --wt-accent: #3b82f6;
  --wt-ring: rgba(59,130,246,.18); --wt-field: #ffffff; --wt-arrow: #6b7280;
  --wt-nav1: #33383f; --wt-nav2: #22262b; --wt-chart: #3f4652; --wt-axis: #d5d9de;
  --wt-scroll: #c3c9d1; --wt-head: #f2f4f7;
}
:root[data-theme="dark"] {
  --wt-bg1: #191d23; --wt-bg2: #101318; --wt-card: #1e232b; --wt-line: #2d333d;
  --wt-ink: #e6eaf1; --wt-sub: #959dab; --wt-accent: #5c9dff;
  --wt-ring: rgba(92,157,255,.22); --wt-field: #161a20; --wt-arrow: #959dab;
  --wt-nav1: #23272e; --wt-nav2: #171a1f; --wt-chart: #c6cdd9; --wt-axis: #39404b;
  --wt-scroll: #3a414c; --wt-head: #232830;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --wt-bg1: #191d23; --wt-bg2: #101318; --wt-card: #1e232b; --wt-line: #2d333d;
    --wt-ink: #e6eaf1; --wt-sub: #959dab; --wt-accent: #5c9dff;
    --wt-ring: rgba(92,157,255,.22); --wt-field: #161a20; --wt-arrow: #959dab;
    --wt-nav1: #23272e; --wt-nav2: #171a1f; --wt-chart: #c6cdd9; --wt-axis: #39404b;
    --wt-scroll: #3a414c; --wt-head: #232830;
  }
}
html { background: var(--wt-bg2); }
body {
  margin: 0; min-height: 100vh;
  background: linear-gradient(180deg, var(--wt-bg1) 0%, var(--wt-bg2) 100%);
  color: var(--wt-ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
/* 导航栏:双层 flex 强制垂直居中(第 9 轮:v2 单层 flex 仍被作者样式的 logo padding/margin:auto 顶歪) */
ul#navbar {
  display: flex; flex-direction: row; align-items: center; gap: 2px; min-height: 52px;
  background: linear-gradient(180deg, var(--wt-nav1) 0%, var(--wt-nav2) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 2px 12px rgba(0,0,0,.28);
  padding: 0 14px; position: sticky; top: 0; z-index: 100;
}
ul#navbar > li { display: flex; align-items: center; float: none; min-height: 52px; }
ul#navbar > li > a {
  display: flex; align-items: center;
  border-radius: 8px; margin: 0 2px; padding: 0 15px !important; line-height: 1.2;
  transition: background .15s ease, color .15s ease; white-space: nowrap;
}
/* 官网导航版 SVG logo(167×80,图形 path 无 fill → 文件内已填官方页头同款 #cfd8dc;导航栏两主题都是深色,单色即可)。
   清掉作者样式里的 8.5px padding 与 margin:auto(flex 下 auto 外边距会抢空间) */
#nav-logo { height: 38px; width: auto; padding: 0 !important; margin: 0 10px 0 0 !important; }
ul#navbar > li > a:hover { background: rgba(255,255,255,.10); }
ul#navbar > li > a.link-tab { font-weight: 600; }
/* 主体:筛选栏横排在上,图表区通栏占满宽度 */
div#main-div { display: flex; flex-direction: column; gap: 14px; padding: 16px 20px 32px; }
/* 筛选栏:横排卡片(标签+下拉顺排,自动换行,不再挤占宽度) */
div#sidebar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px;
  background: var(--wt-card); border: 1px solid var(--wt-line); border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.05);
  padding: 12px 18px;
}
div#sidebar label { display: inline; margin: 0 !important; font-size: 13px; font-weight: 500; color: var(--wt-sub); }
div#sidebar input[type="checkbox"] { accent-color: var(--wt-accent); width: 15px; height: 15px; cursor: pointer; vertical-align: -2px; }
div#sidebar select {
  appearance: none; -webkit-appearance: none;
  padding: 6px 30px 6px 11px; min-width: 110px; box-sizing: border-box;
  border: 1px solid var(--wt-line); border-radius: 9px;
  background: var(--wt-field) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888f9b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 11px center;
  color: var(--wt-ink); font-size: 13px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
div#sidebar select:hover { border-color: var(--wt-arrow); }
div#sidebar select:focus { outline: none; border-color: var(--wt-accent); box-shadow: 0 0 0 3px var(--wt-ring); }
/* 图表/表格区:通栏卡片 */
div#content {
  background: var(--wt-card); border: 1px solid var(--wt-line); border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.05);
  padding: 14px; overflow-x: auto;
}
/* 图表文字/坐标轴跟随主题(数据配色不动) */
#content svg text { fill: var(--wt-chart); }
#content svg .tick line, #content svg .domain { stroke: var(--wt-axis); }
/* 悬浮提示框(第 9 轮):上面那条规则会把 tooltip 文字也染成浅色,而 tooltip 底是白色
   (折线图/趋势图)或单元格彩色(热力图,运行时内联样式不受影响)→ 文字固定深墨色,两主题均可读 */
#content svg g.tooltip text { fill: #20242b; }
/* 按钮跟随主题 */
#content button {
  background: var(--wt-card); border: 1px solid var(--wt-line); color: var(--wt-ink);
  border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px;
  transition: border-color .15s, color .15s;
}
#content button:hover { border-color: var(--wt-accent); color: var(--wt-accent); }
/* 表格跟随主题(2026-09-18 第 8 轮重写):应用在运行时注入 Tabulator 默认样式(行=白底/根=灰框),
   v2 的同特异性规则被注入顺序压过 → 暗色下出现"白底白字";
   现全部加 #content 前缀(ID 特异性稳定压过);单元格数据底色/文字色是内联样式,两主题下均不受影响 */
#content .tabulator { background: var(--wt-card); border: 1px solid var(--wt-line); color: var(--wt-ink); }
#content .tabulator .tabulator-header { background: var(--wt-head); border-bottom: 1px solid var(--wt-line); color: var(--wt-sub); }
#content .tabulator .tabulator-col { background: var(--wt-head); border-right: 1px solid var(--wt-line); }
#content .tabulator .tabulator-col-content { color: var(--wt-sub); }
#content .tabulator .tabulator-row { background: var(--wt-card); color: var(--wt-ink); border-bottom: 1px solid var(--wt-line); }
#content .tabulator .tabulator-row:hover { background: var(--wt-head); }
#content .tabulator .tabulator-cell { color: var(--wt-ink); border-right: 1px solid var(--wt-line); }
#content .tabulator .tabulator-footer { background: var(--wt-head); color: var(--wt-sub); border-top: 1px solid var(--wt-line); }
/* Export to CSV 按钮(应用自绘,#selected-table-div 内紧跟表格 append,第 17 轮加间距) */
#selected-table-div > button { margin-top: 10px; }
/* 细滚动条 */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--wt-scroll); border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { filter: brightness(1.15); }
/* 主题切换按钮(右上角,压在导航栏上) */
#wt-theme-btn {
  position: fixed; top: 9px; right: 16px; z-index: 300;
  width: 34px; height: 34px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.08);
  color: #eeffff; font-size: 15px; line-height: 1; cursor: pointer;
  backdrop-filter: blur(4px); transition: background .15s;
}
#wt-theme-btn:hover { background: rgba(255,255,255,.18); }
/* 全量数据切换按钮(第 11 轮加,第 13 轮定稿):主题按钮左侧;按钮文字=点击后切到的模式,
   「全部数据」↔「精简数据」对称配对,两态同款玻璃样式只靠文字区分(第 12 轮的高亮态被用户否掉) */
#wt-data-btn {
  position: fixed; top: 9px; right: 58px; z-index: 300;
  height: 34px; padding: 0 13px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.08);
  color: #eeffff; font-size: 13px; line-height: 1; cursor: pointer; white-space: nowrap;
  backdrop-filter: blur(4px); transition: background .15s;
}
#wt-data-btn:hover { background: rgba(255,255,255,.18); }
/* 来源链接(第 18 轮,AGPL 出处+本仓库):右下角固定小字,半透明不扰,hover 提亮 */
#wt-src-links { position: fixed; right: 10px; bottom: 5px; z-index: 290; font-size: 11px; opacity: .5; transition: opacity .15s; }
#wt-src-links:hover { opacity: 1; }
#wt-src-links a { color: var(--wt-sub); text-decoration: none; }
#wt-src-links a:hover { color: var(--wt-accent); text-decoration: underline; }
/* 全量切换确认弹窗(第 12 轮,替代浏览器原生 confirm;跟主题变量走,暗亮自适应) */
#wt-dialog-mask { position: fixed; inset: 0; z-index: 99998; background: rgba(10,12,16,.45);
  display: flex; align-items: center; justify-content: center; }
#wt-dialog { width: min(400px, calc(100vw - 48px)); background: var(--wt-card); color: var(--wt-ink);
  border: 1px solid var(--wt-line); border-radius: 14px; padding: 22px 24px;
  box-shadow: 0 12px 40px rgba(0,0,0,.28); }
#wt-dialog h3 { margin: 0 0 10px; font-size: 16px; }
#wt-dialog p { margin: 0 0 6px; color: var(--wt-sub); line-height: 1.7; font-size: 13px; }
#wt-dialog .wt-dialog-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
#wt-dialog button { height: 34px; padding: 0 16px; border-radius: 9px; cursor: pointer;
  font-size: 13px; border: 1px solid var(--wt-line); background: var(--wt-field); color: var(--wt-ink); }
#wt-dialog button.wt-primary { background: var(--wt-accent); border-color: var(--wt-accent); color: #fff; }
/* 手机端 */
@media (max-width: 640px) {
  div#main-div { padding: 12px 12px 24px; }
  div#sidebar { gap: 8px 14px; padding: 10px 14px; }
  ul#navbar { flex-wrap: wrap; padding: 0 150px 0 10px; }
}
</style>
<script>
/* 主题引导(防闪烁):页面渲染前按 localStorage/系统偏好设定 data-theme */
(function(){try{var t=localStorage.getItem('wt-theme');if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
/* 全量数据模式引导(第 11 轮加,第 15 轮改 sessionStorage):进页面一律精简模式;全量只在当次标签页内
   生效(sessionStorage 随标签页关闭失效);顺手清掉第 11-14 轮遗留的 localStorage 旧标记 */
(function(){try{localStorage.removeItem('wt-data-mode')}catch(e){}
try{if(sessionStorage.getItem('wt-data-mode')==='full'){window.__WT_DATA_URL__='/wtstats/data/full'}}catch(e){}})();
</script>
</head>`);
// 加载遮罩 + 界面锁定(2026-09-18 第 4 轮):拦截大 CSV(XHR 与 fetch 双包)期间全屏遮罩锁操作,防连点导致图表空白
html = html.replace(`<script src="dist/bundle.js?v=${V}"></script>`, `<div id="wt-loading" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,17,15,.55);color:#EEFFFF;font:14px/1.8 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;align-items:center;justify-content:center;flex-direction:column;gap:14px"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,.22);border-top-color:#EEFFFF;border-radius:50%;animation:wtspin .9s linear infinite"></div><div>数据加载中,请稍候…</div><div id="wt-load-hint" style="font-size:12px;opacity:.72">首次加载约需十秒左右(数据量较大),完成后进缓存,下次就快了</div></div>
<style>@keyframes wtspin{to{transform:rotate(360deg)}}</style>
<script>
(function(){
  var n=0;
  function u(){var o=document.getElementById('wt-loading');if(o)o.style.display=n>0?'flex':'none'}
  var ox=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){
    try{if(typeof arguments[1]=='string'&&(arguments[1].indexOf('_ranks_')>-1||arguments[1].indexOf('/joined/')>-1)){n++;u();this.addEventListener('loadend',function(){n--;u()})}}catch(e){}
    return ox.apply(this,arguments);
  };
  var of=window.fetch;
  window.fetch=function(){
    try{
      var u1=String(arguments[0]);
      if(u1.indexOf('_ranks_')>-1||u1.indexOf('/joined/')>-1){
        n++;u();
        var d=function(){n--;u()};
        var p=of.apply(this,arguments);p.then(d,d);return p;
      }
    }catch(e){}
    return of.apply(this,arguments);
  };
  // 主题切换按钮(2026-09-18 第 7 轮):右上角 🌙/☀️,记忆在 localStorage
  var b=document.createElement('button');b.id='wt-theme-btn';b.title='切换深色/浅色主题';
  function wtSet(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('wt-theme',t)}catch(e){}b.textContent=(t==='dark')?'☀️':'🌙';}
  wtSet(document.documentElement.getAttribute('data-theme')||'light');
  b.onclick=function(){wtSet(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');};
  document.body.appendChild(b);
  // 全量数据切换按钮(第 11 轮加,第 12 轮改文字按钮+网页弹窗):「全部数据」→ 弹窗确认 → 记忆选择
  // 并整页重载(数据源 getter 切到 /full);「精简模式」= 已在全量,直接切回。页内有 3 处图表内存缓存,
  // 不重载切不干净,故一律走重载。
  var fm=null;try{fm=sessionStorage.getItem('wt-data-mode')}catch(e){}
  var db=document.createElement('button');db.id='wt-data-btn';
  function wtDataUI(){
    if(fm==='full'){db.textContent='精简数据';db.title='当前为全量数据模式,点击切回精简数据(加载更快)';}
    else{db.textContent='全部数据';db.title='加载未裁剪的全部历史数据(2019 年至今)';}
  }
  wtDataUI();
  function wtDialog(){
    return new Promise(function(res){
      var m=document.createElement('div');m.id='wt-dialog-mask';
      m.innerHTML='<div id="wt-dialog" role="dialog" aria-modal="true"><h3>加载全部数据?</h3>'
        +'<p>未裁剪的完整历史,2019 年至今约 770 期。</p>'
        +'<p>首次加载约 1 分钟,之后走缓存。</p>'
        +'<div class="wt-dialog-btns"><button class="wt-cancel">取消</button><button class="wt-primary">加载</button></div></div>';
      function done(v){m.remove();document.removeEventListener('keydown',esc);res(v)}
      function esc(e){if(e.key==='Escape')done(false)}
      m.addEventListener('click',function(e){if(e.target===m)done(false)});
      m.querySelector('.wt-cancel').onclick=function(){done(false)};
      m.querySelector('.wt-primary').onclick=function(){done(true)};
      document.addEventListener('keydown',esc);
      document.body.appendChild(m);
    });
  }
  db.onclick=function(){
    if(fm==='full'){try{sessionStorage.removeItem('wt-data-mode')}catch(e){}location.reload();return;}
    wtDialog().then(function(ok){
      if(ok){try{sessionStorage.setItem('wt-data-mode','full')}catch(e){}location.reload();}
    });
  };
  document.body.appendChild(db);
  // 来源链接(第 18 轮):右下角「原项目 · 本站源码」——AGPL 出处与镜像仓库(备份兼源码要约)
  var sl=document.createElement('div');sl.id='wt-src-links';
  sl.innerHTML='<a href="https://github.com/ControlNet/wt-data-project.web" target="_blank" rel="noopener noreferrer">原项目</a> · <a href="https://github.com/rzfff/wtstats-mirror" target="_blank" rel="noopener noreferrer">本站源码</a>';
  document.body.appendChild(sl);
  if(fm==='full'){var lh=document.getElementById('wt-load-hint');if(lh){lh.textContent='全量数据模式:数据量较大,首次加载约需 1 分钟,请耐心等待;完成后进缓存,下次就快了'}}
})();
</script>
<script src="dist/bundle.js?v=${V}"></script>`);
// 载具中文名包(第 19 轮):datamine units.csv → ../wtapi-build/names-zh-by-id.json(gen_names_zh.py 生成);
// 内联注入在 bundle 之前 —— 表格 formatter 渲染时 window.__WT_NAMES_ZH__ 必已就位,无异步竞态。
// 更新流程:datamine 换版 → 跑 gen_names_zh.py → 重跑本脚本 → 只传 index.html(注入层 no-cache,无需 ?v 递增)
let namesZh = "";
try {
  namesZh = readFileSync("../wtapi-build/names-zh-by-id.json", "utf8").trim();
  if (namesZh.includes("</script")) throw new Error("names JSON 含 </script 序列,拒绝内联注入");
} catch (e) {
  if (String(e.message).includes("ENOENT")) {
    console.error("警告:../wtapi-build/names-zh-by-id.json 不存在,本次产物无中文名(表格回落英文原名)");
    namesZh = "";
  } else throw e;
}
if (namesZh) {
  const anchor = `<script src="dist/bundle.js?v=${V}"></script>`;
  if (!html.includes(anchor)) throw new Error("中文名注入锚点失配(bundle script 标签)");
  html = html.replace(anchor, `<script>window.__WT_NAMES_ZH__=${namesZh}</script>\n${anchor}`);
}
// gtag(Google Analytics)整段 + Cloudflare Web Analytics 整段(两个注释标记之间一并移除)
html = html.replace(/\s*<!-- Global site tag[\s\S]*?End Cloudflare Web Analytics -->/, "");
// getloli 计数图(默认 display:none,中文浏览器会被 JS 设为可见;bundle 对空选择集是安全空操作,可删)
html = html.replace(/\s*<img src="https:\/\/getloli[^>]*>/, "");
if (html.includes("googletagmanager") || html.includes("cloudflareinsights") || html.includes("getloli"))
  throw new Error("index.html 统计代码未清干净");
// 版本号一致性关卡(2026-09-18 审计增设:此前 ?v=N 在 3 处钉死,漏改一处会静默 no-op 丢遮罩):
// ① 全文档恰有 1 处 bundle 版本引用且等于 V;② 加载遮罩必须注入成功(锚点失配时 replace 是无声空操作)
const vrefs = html.match(/dist\/bundle\.js\?v=\d+/g) || [];
if (vrefs.length !== 1 || vrefs[0] !== `dist/bundle.js?v=${V}`)
  throw new Error(`bundle 版本引用异常:[${vrefs.join(", ")}] 应为恰 1 处 ?v=${V}`);
if (!html.includes('id="wt-loading"') || !html.includes("首次加载约需十秒"))
  throw new Error("加载遮罩未注入成功(替换锚点失配会静默 no-op,检查上方 replace 的匹配串)");
writeFileSync("patched/index.html", html);

console.log(`OK: patched/bundle.js ${bundle.length} B; patched/index.html ${html.length} B`);
console.log("下一步(⚠ 两处铁律):scp patched/index.html → /opt/services/wtstats/dist/");
console.log("              scp patched/bundle.js → /opt/services/wtstats/dist/dist/  ← 上游布局,根里还套一层 dist/");
console.log("              ⚠ 两个文件传完都必须 rm+重压自己的 .gz/.br(index 的在 dist/,bundle 的在 dist/dist/)——");
console.log("                gzip_static/brotli_static 优先伺服预压缩副本,漏压=浏览器拿旧页而裸 curl 验证不出(第 11 轮事故):");
console.log("                rm -f index.html.gz index.html.br && gzip -k -9 index.html && brotli -q 10 -k index.html");
console.log("              线上验证用 bun check-live6.mjs(内部 curl --compressed,专防此类坑)");
