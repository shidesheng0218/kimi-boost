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
  while IFS= read -r line; do PRESETS+=("$line"); done < <(
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
  local auth=()
  [[ -n "${GH_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer ${GH_TOKEN}")
  curl -sf -o /dev/null -m 15 "${auth[@]}" "https://api.github.com/repos/$1"
}

MISSING=0
for id in "${PRESETS[@]}"; do
  if ! repo_exists "${ORG}/kimi-boost-${id}"; then
    echo "MISSING mirror repo: ${ORG}/kimi-boost-${id}" >&2
    echo "  create it with:" >&2
    echo "  gh repo create ${ORG}/kimi-boost-${id} --public --description \"kimi-boost preset '${id}' (auto-synced mirror; contribute at ${ORG}/kimi-boost)\"" >&2
    MISSING=1
  fi
done
[[ "$MISSING" == "1" ]] && exit 2

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
