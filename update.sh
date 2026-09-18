#!/bin/bash
# ============================================================================
# wtstats 数据同步脚本 v4.2(服务器 /opt/services/wtstats/update.sh)
# 上游:ControlNet/wt-data-project.data(GitHub,每 3 天推送一期)
# 拉取源:https://controlnet.space/wt-data-project.data —— 实为 GitHub Pages
#         后端(Fastly CDN),即官方线上前端在用的同一份数据
#
# v4.1 变更(2026-09-18 第 9 轮反馈):【数据裁剪】——上游 ranks CSV 是全量时间序列
#   (870 天,单文件 90MB),首屏要拉 20MB+ 压缩数据,中国用户要 1 分钟。
# v4.2 变更(2026-09-18 第 11 轮反馈):
#   - 裁剪窗口 181 天 → 90 天(站长要求首屏再提速;约 30 期每日 + 23 个月度采样 ≈ 53 期)
#   - 新增 full/ 全量数据集:每版目录里同时保留【未裁剪】的 9 个 ranks + 原始 metadata +
#     joined/(硬链接共享,近零磁盘),供前端「全部数据」按钮切换(/wtstats/data/full/)
#   想恢复全量为默认:删掉本脚本"数据裁剪"一步,删 data/ 重新跑。
#   想调整窗口:改第 6 步的 timedelta(days=90)。
#
# 机制:cron 每日 04:37;metadata-upstream.json(原始版)逐字节相同 → 秒退;
#       有更新 → 拉 9 个 ranks(原始)→ 组装 full/ → 校验 → 裁剪 → 双预压 → 原子换版。
# 回滚:ln -sfn /opt/services/wtstats/data/<旧版本目录> /opt/services/wtstats/data-link \
#       && mv -Tf /opt/services/wtstats/data-link /opt/services/wtstats/data-current
# ⚠️ 若 controlnet.space 域名死亡:勿自动切换 raw.githubusercontent.com,需人工决策(见 steps.md)。
# ============================================================================
set -euo pipefail

BASE=/opt/services/wtstats
SRC="https://controlnet.space/wt-data-project.data"
CUR="$BASE/data-current"
DATA="$BASE/data"
RAWMETA="$BASE/metadata-upstream.json"   # 上游原始 metadata(未裁剪),用于"有无更新"比对

# 日志统一进 update.log(手动跑与 cron 跑都一样)
exec >>"$BASE/update.log" 2>&1

echo "==== $(date '+%F %T') 更新检查 ===="

STG=$(mktemp -d "$DATA/stg.XXXXXX")
chmod 755 "$STG"        # mktemp 默认 700,换版后 nginx(www-data)需要可进入(2026-09-17 首部署踩坑)
trap 'rm -rf "$STG"' EXIT

# 1) 用硬链接快照当前数据(秒级、零额外磁盘;后续 rm/gzip 不影响旧版本目录)
CURREAL=""
if [ -L "$CUR" ]; then CURREAL=$(readlink -f "$CUR"); fi
if [ -n "$CURREAL" ] && [ -d "$CURREAL" ]; then
    cp -al "$CURREAL"/. "$STG"/
fi

# 2) 拉【原始】metadata.json;与上次原始版逐字节相同 → 无更新,秒退
#    (rm 先断开硬链接再下载——curl -o 会原地覆写共享 inode,污染旧版本目录,2026-09-18 踩坑)
rm -f "$STG/metadata.json"
curl -fsSL --compressed --retry 3 --retry-delay 5 -o "$STG/metadata.json" "$SRC/metadata.json"
if [ -f "$RAWMETA" ] && cmp -s "$STG/metadata.json" "$RAWMETA"; then
    echo "无更新"
    exit 0
fi

# 3) 原始 metadata 完整性:能解析、期数合理、joined 日期单调
python3 - "$STG" <<'PYEOF'
import json, sys, os
stg = sys.argv[1]
meta = json.load(open(os.path.join(stg, "metadata.json"), encoding="utf-8"))
dates = [e["date"] for e in meta if e.get("type") == "joined"]
assert len(dates) > 100, f"metadata 仅 {len(dates)} 期 joined,可疑"
assert dates == sorted(dates), "metadata joined 日期非单调"
print(f"metadata OK:{len(meta)} 条,最新期 {dates[-1]}")
PYEOF

# 4) 拉 9 个 ranks 时序 CSV(原始全量;逐个校验体积)——_all 三个保持全量不裁
for m in ab rb sb; do
    for r in 0 1 all; do
        rm -f "$STG/${m}_ranks_${r}.csv"   # 断开硬链接再下载,防原地覆写污染旧版本
        curl -fsSL --compressed --retry 3 --retry-delay 5 \
             -o "$STG/${m}_ranks_${r}.csv" "$SRC/${m}_ranks_${r}.csv"
        sz=$(stat -c%s "$STG/${m}_ranks_${r}.csv")
        if [ "$sz" -le 500000 ]; then
            echo "FATAL: ${m}_ranks_${r}.csv 仅 $sz 字节,放弃换版(旧版不受影响)"
            exit 1
        fi
    done
done

# 5) joined 增量:metadata 里列出而快照中不存在的才拉(已发布的 joined 上游不再改)
python3 - "$STG" "$SRC" <<'PYEOF'
import json, subprocess, sys, os
stg, src = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(stg, "joined"), exist_ok=True)
meta = json.load(open(os.path.join(stg, "metadata.json"), encoding="utf-8"))
n = 0
for e in meta:
    if e.get("type") != "joined":
        continue
    f = os.path.join(stg, "joined", e["date"] + ".csv")
    if not os.path.exists(f):
        subprocess.run(["curl", "-fsSL", "--compressed", "--retry", "3",
                        "--retry-delay", "5", "-o", f, f"{src}/joined/{e['date']}.csv"],
                       check=True)
        n += 1
last = max(e["date"] for e in meta if e.get("type") == "joined")
sz = os.path.getsize(os.path.join(stg, "joined", last + ".csv"))
assert sz > 10000, f"最新 joined {last} 仅 $sz 字节,可疑"
print(f"joined 本次新拉 {n} 个;最新期 {last}({sz}B)校验通过")
PYEOF

# 5.5)【全量数据集】(v4.2,第 11 轮「全部数据」按钮):组装 $STG/full/ —— 未裁剪的 9 个
#      ranks + 原始 metadata,前端把数据源切到 /wtstats/data/full/ 即读这里。
#      6 个大 ranks 用硬链接(第 6 步裁剪以 tmp+rename 换掉根目录副本,自动断链,两侧独立);
#      3 个 _all 与 metadata 用拷贝 —— 它们不参与裁剪,若硬链接会让 gzip 拒压根目录副本
#      ("has 1 other link -- file ignored",2026-09-18 上午日志里的警告即同类问题);
#      joined/ 整目录硬链接放在第 7 步压缩之后(新拉文件若带 2 链接同样会被 gzip 跳过)。
mkdir -p "$STG/full"
for m in ab rb sb; do for r in 0 1; do ln "$STG/${m}_ranks_${r}.csv" "$STG/full/${m}_ranks_${r}.csv"; done; done
for m in ab rb sb; do cp "$STG/${m}_ranks_all.csv" "$STG/full/${m}_ranks_all.csv"; done
cp "$STG/metadata.json" "$STG/full/metadata.json"

# 6)【数据裁剪】(v4.2,第 11 轮收窄):近 90 天全保留 + 更早每月 1 号取样
#    (上游每 3 天一推,≈30 期每日 + ~23 个月度采样 ≈ 53 期;热力图看最新无影响,单元格趋势线仍有
#     2020 年至今的月度采样;全量需求走 full/ 与前端按钮,不再靠放宽窗口解决)
#    6 个 ranks_{0,1} + metadata 同步裁剪(_all 三个与 full/ 整目录保持全量,总体趋势页不受影响)
python3 - "$STG" <<'PYEOF'
import csv, json, os, sys
from datetime import date, timedelta
stg = sys.argv[1]
mp = os.path.join(stg, "metadata.json")
meta = json.load(open(mp, encoding="utf-8"))
dates = sorted({e["date"] for e in meta if e.get("type") == "joined"})
latest = date.fromisoformat(dates[-1])
cutoff = latest - timedelta(days=90)
ks = {d for d in dates if date.fromisoformat(d) >= cutoff or d.endswith("-01")}
assert len(ks) > 40, f"裁剪后仅 {len(ks)} 个日期(原始 {len(dates)} 个,90 天窗口截止 {cutoff}),异常"
assert dates[-1] in ks, "最新日期未被保留,异常"
# metadata 也走 tmp+rename(open("w") 会原地截断硬链接共享的 inode,污染旧版本,2026-09-18 踩坑)
with open(mp + ".trimming", "w", encoding="utf-8") as f:
    json.dump([e for e in meta if e.get("date") in ks], f, ensure_ascii=False)
os.replace(mp + ".trimming", mp)
total = 0
for m in ("ab", "rb", "sb"):
    for r in ("0", "1"):
        p = os.path.join(stg, f"{m}_ranks_{r}.csv")
        tmp = p + ".trimming"
        with open(p, encoding="utf-8", newline="") as fi, \
             open(tmp, "w", encoding="utf-8", newline="") as fo:
            rd, wr = csv.reader(fi), csv.writer(fo)
            hdr = next(rd); wr.writerow(hdr)
            di = hdr.index("date")
            for row in rd:
                if row[di] in ks:
                    wr.writerow(row); total += 1
        os.replace(tmp, p)
        print(f"  {m}_ranks_{r}.csv → {os.path.getsize(p)//1024}KB")
ksorted = sorted(ks)
print(f"裁剪完成:保留 {len(ks)} 个日期({ksorted[0]}…{ksorted[-1]};根数据全集 {dates[0]}…{dates[-1]} 共 {len(dates)} 期,保留 {total} 行)")
PYEOF

# 7) 预压缩(gzip_static / brotli_static 双份;先 rm 再压,避免改写与旧版本共享的硬链接)
find "$STG" -type f \( -name '*.csv' -o -name '*.json' \) ! -name '*.gz' ! -name '*.br' -print0 |
while IFS= read -r -d '' f; do
    if [ ! -f "$f.gz" ] || [ "$f" -nt "$f.gz" ]; then rm -f "$f.gz"; gzip -k -9 "$f"; fi
    if command -v brotli >/dev/null 2>&1; then
        if [ ! -f "$f.br" ] || [ "$f" -nt "$f.br" ]; then rm -f "$f.br"; brotli -q 10 -k "$f"; fi
    fi
done
echo "预压缩完成:$(find "$STG" -name '*.gz' | wc -l) 个 .gz / $(find "$STG" -name '*.br' | wc -l) 个 .br"

# 7.5) joined/ 硬链接进 full/(v4.2):放压缩之后 —— 根目录新文件都已压完,硬链接两侧同 inode
#      同 mtime,第 7 步的 -nt 判定不会触发重压,零额外磁盘;老文件连 .gz/.br 一起链接
cp -al "$STG/joined" "$STG/full/joined"

# 8) 记录原始 metadata(供下轮比对;放最后写,失败中断则不会误记"已处理")+ 原子换版 + 只留 2 版
curl -fsSL --compressed -o "$RAWMETA.tmp" "$SRC/metadata.json" && mv "$RAWMETA.tmp" "$RAWMETA"
NEW="$DATA/v$(date +%Y%m%d-%H%M%S)"
mv "$STG" "$NEW"
ln -s "$NEW" "$BASE/data-link" && mv -Tf "$BASE/data-link" "$CUR"
ls -1dt "$DATA"/v* 2>/dev/null | tail -n +3 | xargs -r rm -rf
echo "换版完成 → $NEW(本版磁盘 $(du -sh "$NEW" | cut -f1))"
