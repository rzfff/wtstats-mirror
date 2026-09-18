# wtstats-mirror

[wt-data-project](https://github.com/ControlNet/wt-data-project.web) 的自建镜像与中文本地化补丁集,
线上运行于 <https://anhappy.com/wtstats/>(War Thunder 载具胜率/分房统计站)。

上游前端与数据仓均为 **AGPL-3.0** 许可(全文见 [`LICENSE`](LICENSE));本仓库依 AGPL 公开本镜像的
完整对应源码与修改说明(见 [`dist/SOURCE.md`](dist/SOURCE.md)),感谢原作者 ControlNet 的开源工作。

## 仓库内容

| 路径 | 内容 |
|---|---|
| `dist/` | 线上部署成品全量快照(index.html 注入层 + dist/bundle.js 补丁版 + config/img/wasm,含 nginx 预压 .gz/.br) |
| `patches/` | 补丁工具链:`patch-frontend.mjs`(26 处补丁,每处强制恰命中 1 次+语法关卡)、`verify-patch.mjs`(57 项断言)、`bisect-patch.mjs`、`check-live6.mjs`(线上验证)、`patch-table.json`(补丁底稿) |
| `update.sh` | 数据同步脚本:每日检查上游数据仓(每 3 天一版),裁剪(近 90 天+月度采样)+ 组装全量层 + gzip/brotli 双预压 + 原子换版 |
| `LICENSE` | AGPL-3.0 全文(上游) |

数据文件(约 1GB/版,770 期 CSV)不入库——由 `update.sh` 随时从上游全量重拉,不需要备份。

## 主要修改(相对上游)

强制简体中文、表格 14 列汉化、暗/亮双主题、横排筛选栏、加载遮罩、「全部数据」切换(精简/全量双数据层)、
官网导航版 logo 与 favicon、tooltip 日期行、表格列宽按比例填充且可拖拽、总体趋势图图例汉化等。
完整清单与逐条对照见 [`dist/SOURCE.md`](dist/SOURCE.md) 与 [`patches/patch-table.json`](patches/patch-table.json)。

## 重建线上产物

```bash
# 1. 取上游 web 分支出厂成品(codeload 免构建产物),解包得到原始 dist/
# 2. 在 patches/ 目录跑:
bun patch-frontend.mjs && bun verify-patch.mjs
# 3. 产物 patched/index.html + patched/bundle.js 即 dist/ 同名文件(部署后记得重压 .gz/.br)
```

War Thunder 相关商标与素材归 Gaijin / BULKHEAD 所有,本站仅作游戏识别性使用,非官方站点。
