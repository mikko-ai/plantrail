#!/usr/bin/env bash
#
# 更新版本号并提交。
#
# 用法:
#   scripts/release.sh patch   # 0.1.0 -> 0.1.1
#   scripts/release.sh minor   # 0.1.0 -> 0.2.0
#   scripts/release.sh major   # 0.1.0 -> 1.0.0
#
# 行为:
#   1. 校验参数与 git 工作区
#   2. 用 npm version 更新 package.json / package-lock.json (不打 git tag)
#   3. 仅提交版本文件, 提交信息形如 "v0.1.1"

set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-}"

case "$BUMP" in
  patch | minor | major) ;;
  *)
    echo "用法: $0 <patch|minor|major>" >&2
    exit 1
    ;;
esac

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误: 当前目录不是 git 仓库" >&2
  exit 1
fi

# 避免把版本文件以外的暂存改动一起带进本次提交
if ! git diff --cached --quiet; then
  echo "错误: 暂存区存在未提交改动, 请先处理后再发布版本" >&2
  exit 1
fi

OLD_VERSION="$(node -p "require('./package.json').version")"

# --no-git-tag-version: 只改文件, 不自动 commit/tag, 由脚本统一控制提交信息
NEW_TAG="$(npm version "$BUMP" --no-git-tag-version)" # 形如 v0.1.1

echo "版本: ${OLD_VERSION} -> ${NEW_TAG#v}"

git add package.json
[ -f package-lock.json ] && git add package-lock.json

git commit -m "${NEW_TAG}"

echo "已提交: ${NEW_TAG}"
