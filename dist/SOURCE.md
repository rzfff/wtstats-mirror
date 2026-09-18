# 本镜像说明(Source / 来源)

本页是 **[wt-data-project](https://github.com/ControlNet/wt-data-project.web)** 的自建镜像,
部署于 `anhappy.com/wtstats/`;数据每 3 天自动跟随上游数据仓
**[ControlNet/wt-data-project.data](https://github.com/ControlNet/wt-data-project.data)**(AGPL-3.0)更新。

## 相对上游出厂产物的修改

上游 `web` 分支为 CI 构建好的免构建成品,本镜像在其基础上做了以下修改
(依 AGPL-3.0 在此提供对应修改说明;**补丁全量清单与逐条 from/to 对照**见运维方交接文档
`wtstats-deploy-plan/patch-frontend.mjs` 与其生成的 `patch-table.json`,2026-09-18 版共 26 条 bundle 补丁):

1. `dist/bundle.js`(26 处字符串替换,除注明外均不改变程序结构):
   - 数据源 `https://controlnet.space/wt-data-project.data` → 运行时 getter:默认 `/wtstats/data`(精简数据),页面设置 `window.__WT_DATA_URL__` 后切换到 `/wtstats/data/full`(全量数据,配合首页「全部数据」按钮)
   - 「待定计划」页签读取的 `https://wt.controlnet.space/README.md` → `/wtstats/README.md`(本地化,消除外部运行时依赖)
   - 语言判断改为强制简体中文(上游只认 `navigator.language` 恰好为 `zh-CN`/`zh`)
   - 表格 14 个列标题与国家/高级/类别列的取值汉化(如 `ts_name`→`载具名`、`True`→`是`)
   - 分房/研发/银狮列宽调整(适配中文列名)
   - 导航栏 logo `/img/logo64.png` → `img/logo-wt.svg`(War Thunder 官网页头导航同款 SVG,商标归 Gaijin,仅作游戏识别性使用)
   - 「高级」列金色背景单元格文字改深棕色以保证暗色主题下可读
   - 表格布局 fitColumns → fitDataStretch,并修改其布局处理器:剩余宽度平分给 7 个无上限列(击杀比×4/高级/研发/银狮),名字列按内容自适应,表格正好填满页面宽度
   - 总体趋势图图例国家名改走简中语言包(原先输出英文原始值)
   - 折线图悬浮标签增加日期行
2. `index.html`:
   - favicon `/img/logo.ico` → `img/favicon.ico`(War Thunder 官网 favicon)
   - 移除 Google Analytics(gtag)、Cloudflare Web Analytics、getloli 访问计数图
   - 注入 CSS/JS 定制层:暗/亮双主题(可切换)、横排筛选栏、加载遮罩(覆盖 ranks 与 joined 请求)、隐藏 6 个无用导航项、tooltip 文字配色、「全部数据」按钮(在未裁剪全量与精简数据间切换,切换前有加载时长确认提示;进页面一律精简模式,全量仅在当次标签页内生效)、全量模式引导脚本
   - `bundle.js` 引用加 `?v=N` 缓存版本号
3. 数据目录 `data/`:上游数据仓的镜像,由同步脚本自动裁剪(**精简默认:近 90 天全保留 + 更早每月 1 号采样**;`data/full/` 子目录为未裁剪全量副本——9 个原始 ranks + 原始 metadata,joined/ 与精简版硬链接共享)
4. 删除 `CNAME`、`.github/`(GitHub Pages 专用文件);`README.md`、`LICENSE` 原样保留;新增本文件

## 源码

本镜像的完整源码、补丁集与部署工具链公开于:<https://github.com/rzfff/wtstats-mirror>

## 许可

- 前端与数据均以 **AGPL-3.0** 许可,全文见 [`./LICENSE`](./LICENSE),© ControlNet 及贡献者
- 数据来源:thunderskill 玩家统计 + War Thunder Wiki,由上游数据仓聚合发布
