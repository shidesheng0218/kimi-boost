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

PRESETS=(vue3 react go python usage)
ORG="${KB_ORG:-shidesheng0218}"
PUSH=0
[[ "${1:-}" == "--push" ]] && PUSH=1

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash first" >&2
  exit 1
fi

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
    git push "$remote" "$branch:main" --force
  else
    echo "   dry-run: git push https://github.com/${ORG}/kimi-boost-${id}.git ${branch}:main --force"
  fi
done

echo "done."
