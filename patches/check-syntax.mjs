// 语法自检:解析 patched/bundle.js,定位语法错误的确切位置
import { readFileSync } from "fs";
const s = readFileSync("./patched/bundle.js", "utf8");
try {
  new Function(s);
  console.log("本地 patched/bundle.js 语法 OK");
} catch (e) {
  console.log("语法错误:", e.message);
  // 从错误信息里抠列号(browser 报的是 line 2 col N;本地无换行则直接给上下文)
  const m = /<anonymous>:(\d+):(\d+)/.exec(e.stack || "");
  if (m) {
    let off = 0;
    const lines = s.split("\n");
    for (let i = 0; i + 1 < Number(m[1]); i++) off += lines[i].length + 1;
    off += Number(m[2]) - 1;
    console.log("偏移≈", off);
    console.log("上下文:", s.slice(Math.max(0, off - 160), off + 160));
  }
}
