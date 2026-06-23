#!/usr/bin/env bash
#
# 构建并将 plantrail 安装到全局。
#
# 用法:
#   scripts/install-global.sh
#
# 行为:
#   1. 运行 npm run build (tsc + 打包 hooks)
#   2. 通过 npm install -g . 将当前包安装为全局命令
#   3. 打印安装后的命令位置与版本

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 构建 (npm run build)"
npm run build

echo "==> 全局安装 (npm install -g .)"
npm install -g .

echo "==> 完成"
# 直接定位本次 npm 全局安装写入的二进制, 而非 PATH 中可能存在的旧版本
GLOBAL_BIN="$(npm prefix -g)/bin"
PLANTRAIL_BIN="${GLOBAL_BIN}/plantrail"
if [ -x "$PLANTRAIL_BIN" ]; then
  echo "命令位置: ${PLANTRAIL_BIN}"
  echo "版本: $("$PLANTRAIL_BIN" --version 2>/dev/null || echo '未知')"
  if [ "$(command -v plantrail 2>/dev/null || true)" != "$PLANTRAIL_BIN" ]; then
    echo "提示: PATH 中的 plantrail 与本次安装路径不一致, 请确认 ${GLOBAL_BIN} 在 PATH 中且优先级正确"
  fi
else
  echo "提示: 未在 ${GLOBAL_BIN} 找到 plantrail, 安装可能失败"
fi
