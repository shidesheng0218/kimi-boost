#!/usr/bin/env bash
# Split flagship presets into their own single-plugin repos via git subtree.
#
# The monorepo stays the single source of truth. For every flagship preset
# this script produces a synthetic branch (split/<id>) containing only
# presets/<id>/, and with --push force-pushes it to the main branch of
# github.com/<KB_ORG>/kimi-boost-<id>. Target repos are read-only mirrors;
# contributions land in the monorepo.
#
# Usage:
#   scripts/split-presets.sh            # dry-run: split locally, print push commands
#   scripts/split-presets.sh --push     # split and force-push to the single repos
#
# Env:
#   KB_ORG     GitHub owner of the single repos (default: shidesheng0218)
#   GH_TOKEN   token used for authenticated push (CI: a PAT with repo scope,
#              because GITHUB_TOKEN cannot push to other repositories)

set -euo pipefail

cd "$(dirname "$0")/.."

# Flagship preset list lives in presets/flagship.json (single source of
# truth, also read by the CLI's marketplace command).
if [[ -f presets/flagship.json ]]; then
  PRESETS=()
  # `|| [[ -n "$line" ]]` 必须保留:node 输出无结尾换行,否则 read 在最后一行
  # 返回非零、循环体不执行 —— 最后一个旗舰 preset 会被静默丢掉。
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] && PRESETS+=("$line")
  done < <(
    node -e "process.stdout.write(JSON.parse(require('node:fs').readFileSync('presets/flagship.json','utf8')).join('\n'))"
  )
else
  PRESETS=(vue3 react go python usage)
fi
ORG="${KB_ORG:-shidesheng0218}"
PUSH=0
[[ "${1:-}" == "--push" ]] && PUSH=1

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash first" >&2
  exit 1
fi

# Fine-grained PATs cannot create repositories (API limitation), so repo
# creation stays a rare manual step: detect missing mirrors and print the
# exact one-liner instead of failing the push with a cryptic error.
repo_exists() {
  # 注意:不能用 auth=() + "${auth[@]}"——macOS 自带 bash 3.2 在 set -u 下
  # 展开空数组会报 unbound variable(CI 的 bash 5 无此问题,本地会踩)
  if [[ -n "${GH_TOKEN:-}" ]]; then
    curl -sf -o /dev/null -m 15 -H "Authorization: Bearer ${GH_TOKEN}" "https://api.github.com/repos/$1"
  else
    curl -sf -o /dev/null -m 15 "https://api.github.com/repos/$1"
  fi
}

MISSING=0
for id in "${PRESETS[@]}"; do
  if ! repo_exists "${ORG}/kimi-boost-${id}"; then
    echo "MISSING mirror repo: ${ORG}/kimi-boost-${id}" >&2
    echo "  create it with:" >&2
    echo "  gh repo create ${ORG}/kimi-boost-${id} --public --description \"<preset 描述>（kimi-boost 自动同步镜像）\"" >&2
    echo "  (description 与现有 6 个镜像保持一致:取 presets/${id}/preset.json 的 description + '（kimi-boost 自动同步镜像）')" >&2
    MISSING=1
  fi
done
[[ "$MISSING" == "1" ]] && exit 2

FAILED_PUSHES=()

for id in "${PRESETS[@]}"; do
  prefix="presets/$id"
  [[ -d "$prefix" ]] || { echo "skip $id: $prefix not found"; continue; }

  branch="split/$id"
  echo "== $id: subtree split $prefix -> $branch"
  # --rejoin is not used: splits are recomputed from scratch each run,
  # which keeps history one-directional and idempotent.
  git subtree split --prefix="$prefix" -b "$branch"

  if [[ "$PUSH" == "1" ]]; then
    if [[ -n "${GH_TOKEN:-}" ]]; then
      remote="https://x-access-token:${GH_TOKEN}@github.com/${ORG}/kimi-boost-${id}.git"
    else
      remote="https://github.com/${ORG}/kimi-boost-${id}.git"
    fi
    echo "== $id: force-push to ${ORG}/kimi-boost-${id} main"
    # 不在失败处直接退出:一个镜像 403 不该挡住其余 preset 的同步
    if ! git push "$remote" "$branch:main" --force; then
      FAILED_PUSHES+=("$id")
      echo "!! push failed for ${ORG}/kimi-boost-${id}" >&2
      echo "   若为 403/permission denied:说明 GH_TOKEN(CI 里的 SPLIT_TOKEN)没有该仓的写权限。" >&2
      echo "   修复:GitHub → Settings → Developer settings → Fine-grained tokens → 该 token" >&2
      echo "         → Repository access 勾上 kimi-boost-${id} → Contents: Read and write。" >&2
    fi
  else
    echo "   dry-run: git push https://github.com/${ORG}/kimi-boost-${id}.git ${branch}:main --force"
  fi
done

if [[ ${#FAILED_PUSHES[@]} -gt 0 ]]; then
  echo "done with failures: ${FAILED_PUSHES[*]}" >&2
  exit 1
fi

echo "done."
