// 线上 v13 前端验证(第 19 轮:载具中文名;文件版,勿内联——中文经 Windows shell 传输会乱码)
// 注:一律 curl --compressed(带 Accept-Encoding 协商)——2026-09-18 第 11 轮事故教训:
//     nginx 的 gzip_static/brotli_static 会优先伺服预压缩副本,裸 curl(无压缩协商)验证的
//     是原始文件,发现不了 .gz/.br 陈旧的问题(浏览器全走压缩协商,会拿到旧页!)
import { writeFileSync } from "fs";
import { spawnSync } from "child_process";

function mark(ok) { return ok ? "OK ✅" : "MISS ❌"; }
function get(url) {
  const r = spawnSync("curl", ["-sk", "--compressed", url], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("curl exit " + r.status);
  return r.stdout;
}

const s = get("https://anhappy.com/wtstats/dist/bundle.js?v=13");
writeFileSync(process.env.TMP + "/bv13.js", s, "utf8");
console.log("bundle 长度", s.length);
try { new Function(s); console.log("线上 bundle v13 语法: OK ✅"); } catch (e) { console.log("坏:", e.message); process.exit(1); }

const bundleChecks = [
  ["数据源 getter(全量可切换)", String.raw`Object.defineProperty(e,"dataUrl",{get:function(){return window.__WT_DATA_URL__||"/wtstats/data"}})`],
  ["官网导航版 logo 引用", String.raw`image="img/logo-wt.svg"`],
  ["折线图 tooltip 日期行", '日期: "+l.timeFormat("%Y/%m/%d")'],
  ["高级列金底深字", String.raw`p.COLORS.YELLOW,t.getElement().style.color="#4a3b00"`],
  ["表格 layout=fitDataStretch(第15轮)", 'layout:"fitDataStretch"'],
  ["剩余宽度按比例分配(第17轮)", "Math.floor(r*c.getWidth()/w)"],
  ["趋势图图例国家汉化(第16轮)", ".text(d.Container.get(h.Localization.Nation)(t)).attr"],
  ["载具名中文 formatter(第19轮)", '{title:"载具名",field:"ts_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__'],
  ["Wiki名中文 formatter(第19轮)", '{title:"Wiki 名",field:"wk_name",formatter:function(t){var e=t.getValue(),z=window.__WT_NAMES_ZH__'],
];
for (const [n, p] of bundleChecks) console.log(n + ":", mark(s.includes(p)));

const h = get("https://anhappy.com/wtstats/");
const htmlChecks = [
  ["index 引用 v=13", "dist/bundle.js?v=13"],
  ["中文名包已内联(第19轮)", "window.__WT_NAMES_ZH__={"],
  ["中文名包样例·三号坦克F型", '"germ_pzkpfw_iii_ausf_f":"三号坦克 F 型"'],
  ["中文名包样例·豹2A4", '"germ_leopard_2a4":"豹 2A4"'],
  ["中文名包在 bundle 之前", null], // 顺序检查,下方特判
  ["官网 favicon", 'href="img/favicon.ico"'],
  ["全量模式引导脚本", "window.__WT_DATA_URL__='/wtstats/data/full'"],
  ["全量数据按钮", "wt-data-btn"],
  ["遮罩覆盖 joined", "indexOf('/joined/')>-1"],
  ["右下角来源链接(第18轮)", "wt-src-links"],
];
for (const [n, p] of htmlChecks) {
  if (p === null) {
    const a = h.indexOf("window.__WT_NAMES_ZH__="), b = h.indexOf("dist/bundle.js?v=13");
    console.log(n + ":", mark(a > -1 && b > -1 && a < b));
  } else console.log(n + ":", mark(h.includes(p)));
}
console.log("旧 v=12 引用已清:", mark(!h.includes("v=12")));
