// 逐补丁二分:对原始 bundle 依次应用每个补丁,每步做语法解析,找出第一个引入语法错误的补丁
import { readFileSync } from "fs";
const orig = readFileSync("./inspect/dist/bundle.js", "utf8");

// 与 patch-frontend.mjs 完全一致的补丁表(仅取 from;to 从同文件逻辑复制)
const P = JSON.parse(readFileSync("./patch-table.json", "utf8"));

let cur = orig;
const regionOf = (s) => { const i = s.indexOf('"sl_rate"'); return i < 0 ? "(无)" : s.slice(i - 60, i + 60); };
let prevRegion = regionOf(orig);
for (const { name, from, to } of P) {
  const n = cur.split(from).length - 1;
  if (n !== 1) { console.log(`跳过「${name}」(命中 ${n} 次)`); continue; }
  const next = cur.replace(from, to);
  try {
    new Function(next);
    cur = next;
    const r = regionOf(cur);
    if (r !== prevRegion) { console.log(`⚠️ 补丁「${name}」改动了 sl_rate 区域:\n  前: ${prevRegion}\n  后: ${r}\n`); prevRegion = r; }
  } catch (e) {
    console.log(`❌ 补丁「${name}」引入语法错误:${e.message}`);
    const idx = next.indexOf(to);
    console.log("产物上下文:\n" + next.slice(Math.max(0, idx - 120), idx + to.length + 80));
    process.exit(1);
  }
}
console.log("全部补丁语法 OK(那问题就不在补丁本身)");
