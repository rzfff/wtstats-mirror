// 线上 v8 前端验证(文件版,勿内联——中文经 Windows shell 传输会乱码)
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

const s = get("https://anhappy.com/wtstats/dist/bundle.js?v=12");
writeFileSync(process.env.TMP + "/bv12.js", s, "utf8");
console.log("bundle 长度", s.length);
try { new Function(s); console.log("线上 bundle v12 语法: OK ✅"); } catch (e) { console.log("坏:", e.message); process.exit(1); }

const bundleChecks = [
  ["数据源 getter(全量可切换)", String.raw`Object.defineProperty(e,"dataUrl",{get:function(){return window.__WT_DATA_URL__||"/wtstats/data"}})`],
  ["官网导航版 logo 引用", String.raw`image="img/logo-wt.svg"`],
  ["折线图 tooltip 日期行", '日期: "+l.timeFormat("%Y/%m/%d")'],
  ["高级列金底深字", String.raw`p.COLORS.YELLOW,t.getElement().style.color="#4a3b00"`],
  ["表格 layout=fitDataStretch(第15轮)", 'layout:"fitDataStretch"'],
  ["剩余宽度按比例分配(第17轮)", "Math.floor(r*c.getWidth()/w)"],
  ["趋势图图例国家汉化(第16轮)", ".text(d.Container.get(h.Localization.Nation)(t)).attr"],
];
for (const [n, p] of bundleChecks) console.log(n + ":", mark(s.includes(p)));

const h = get("https://anhappy.com/wtstats/");
const htmlChecks = [
  ["index 引用 v=12", "dist/bundle.js?v=12"],
  ["官网 favicon", 'href="img/favicon.ico"'],
  ["全量模式引导脚本", "window.__WT_DATA_URL__='/wtstats/data/full'"],
  ["全量 sessionStorage(第15轮)", "sessionStorage.getItem('wt-data-mode')"],
  ["全量数据按钮", "wt-data-btn"],
  ["按钮文字版·全量态(第13轮)", "db.textContent='精简数据'"],
  ["按钮文字版·精简态(第12轮)", "db.textContent='全部数据'"],
  ["全量弹窗·网页版(第12轮)", "wt-dialog-mask"],
  ["弹窗标题(第12轮)", "加载全部数据?"],
  ["全量确认提示(约1分钟)", "首次加载约需 1 分钟"],
  ["遮罩覆盖 joined", "indexOf('/joined/')>-1"],
];
for (const [n, p] of htmlChecks) console.log(n + ":", mark(h.includes(p)));
console.log("旧 v=11 引用已清:", mark(!h.includes("v=11")));

// 全量数据集(重建完成后可用;full/metadata.json 应含全部 ~770 期 joined)
try {
  const fm = JSON.parse(get("https://anhappy.com/wtstats/data/full/metadata.json"));
  const n = fm.filter(e => e.type === "joined").length;
  console.log(`full/metadata.json:${n} 期 joined`, mark(n > 700));
} catch (e) { console.log("full/metadata.json: 暂不可达(" + e.message.slice(0, 60) + ")——若重建仍在跑属正常"); }

// 精简版(默认)metadata:90 天窗口后应 ~54 期
try {
  const pm = JSON.parse(get("https://anhappy.com/wtstats/data/metadata.json"));
  const n = pm.filter(e => e.type === "joined").length;
  console.log(`data/metadata.json(精简默认):${n} 期 joined`, mark(n >= 40 && n <= 70));
} catch (e) { console.log("data/metadata.json: " + e.message.slice(0, 60)); }
