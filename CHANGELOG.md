## Unreleased

### Team onboarding

- `kimi-boost bootstrap`: generates a `setup.sh` (or appends an idempotent `setup:` target to an existing `Makefile` with `--makefile`) that detects Kimi Code/Claude Code and installs every project-level preset recorded in `.kimi-boost/installed.json` — one command for new team members after `git clone`

### Background update checks

- `kimi-boost update --check`: diffs installed preset versions against the registry without touching disk; exits non-zero and fires a desktop notification (`osascript`/`notify-send`, terminal-only on Windows) when updates are found
- `kimi-boost update --watch [--interval <hours>]`: registers a periodic `--check` run via native OS scheduling — `launchctl`/LaunchAgent on macOS, `crontab` on Linux, prints a `schtasks` command to run manually on Windows; default interval 6h, idempotent re-registration
- `kimi-boost update --watch --uninstall`: removes the scheduled check
- No new runtime dependencies (no `node-cron`/`pm2`/`node-notifier`) — same shell-out philosophy as the rest of the CLI

### `create` scaffolding

- `kimi-boost create <id> --shape mcp`: scaffolds an MCP-server preset (`mcpServers` stub, no skills/agents/hooks) instead of the default skill+agent+hook shape
- `kimi-boost create <id> --shape command`: scaffolds a slash-command preset (`commands/<id>-report.md`) instead of a hook, keeping the skill+agent
- `kimi-boost create <id> --force`: overwrite an existing `presets/<id>/` directory instead of erroring

### `doctor --fix` hook auto-merge

- Exact-duplicate hooks (same event+matcher+byte-identical script content across presets) are now merged by `doctor --fix`: the first owner's config entry is kept, redundant entries are removed from `config.toml` (kimi/codex) or `settings.json` (claude) — closes the "v1 diagnoses only" gap noted in 0.8.0 for this specific, lossless case
- Diverging copies (same event+matcher+script name, different content) remain diagnose-only by design — `--fix` won't guess which version is correct; the warning now names both owning presets and suggests running `kimi-boost update <id>` on the stale one

### Fixed

- `detect()` now respects `CLAUDE_CODE_HOME`/`CODEX_HOME` env overrides for the claude/codex home directories, matching the existing `KIMI_CODE_HOME` behavior for kimi — previously only kimi's detection honored a sandboxed home dir, which made `doctor`/`status` blind to env-overridden claude/codex setups (found while adding hook-conflict test coverage)

### Test coverage

- Added dedicated test files for `create`, `list`, `status`, `update` (command layer), `detect`, `safety`, `hookRegistry`, and `doctor`'s hook-conflict detection — previously untested despite being in active use

### Release pipeline

- `prepublishOnly` now runs typecheck, the full test suite and preset validation before `build`, matching what CI already gates on
- New `publish.yml` workflow: on `v*` tag push, runs the same checks then `npm publish --provenance --access public`. Requires an `NPM_TOKEN` repo secret to actually publish — inert (fails safely) until that secret is added

## 0.8.0 (2026-08-28)

### Content-aware hook dedup

- Presets bundling functionally identical hooks (e.g. `vue3` + `nextjs` both ship `protect-main.mjs`) now share a **single config entry** per tool instead of registering duplicates. Identity = event + matcher + args + timeout + sha256 of the script content.
- Shared registry lives in the user manifest (`~/.kimi-boost/installed.json`, new `hooks` key) with refcounting per preset
- Uninstalling one of several presets sharing a hook **retargets** the config entry to the next owner's script copy — remaining presets keep working; the entry is removed only when the last ref goes away
- `install`/`update` re-runs release stale refs first, so content changes converge to one fresh entry; idempotent for unchanged reinstalls
- `doctor` detects cross-preset hook problems on all three tools: *duplicate hook content* (redundant, converges on next update) and *diverging copies* (same event + same script name, different content). v1 diagnoses only — no auto-merge in `--fix`
- No directory-layout change: per-preset script copies under `~/.kimi-boost/hooks/<id>/` are kept (self-sufficient uninstalls); legacy installs without a registry keep working and converge on the next install/update

### Version tracking + `outdated`

- `kimi-boost outdated`: compares installed presets against the remote registry (`--repo`/`--branch` for forks, `--project` for project-level presets, `--json` for scripting); statuses: up-to-date / update available / local version unknown / not in remote registry
- User manifest records the installed preset version per tool (legacy `string[]` records read transparently, migrated on next write); project manifest (`.kimi-boost/installed.json`) does the same
- `kboost status` matrix now shows an **Installed** column next to Latest
- Local-version lookup unified into `storedPresetVersion()` (shared by `update`, `outdated`, `status`)

### Fixed

- `doctor --project --fix`: restoring a missing single file (e.g. `agents/<name>.md`) no longer crashes with ENOTDIR — files and directories are restored by their actual type

## 0.7.0 (2026-08-19)

### Project-level presets

- `kimi-boost install <preset> --project`: install into the current project for git-based team sharing — skills → `.agents/skills/` + `.claude/skills/`, agents → `.agents/agents/` + `.claude/agents/`, hooks → `.claude/settings.json` (Claude Code only; Kimi Code has no project-level hook mechanism, Codex skipped with a notice)
- `kimi-boost remove <preset> --project`: surgical cleanup — never deletes settings.json itself, only our hook entries
- `kboost status`: three-way per-preset install matrix (kimi/claude/codex) with `--json`

### Presets

- Flagship presets thickened with slash commands: `/<id>:review` (severity-graded reviewer delegation), plus `/react:component`, `/go:test`, `/python:lint`, `/usage:report`
- `skillInstructions` gates stack skills to matching projects only

### CI / security

- split-presets.sh detects missing mirror repos and prints the exact `gh repo create` one-liner
- SPLIT_TOKEN rotated to a fine-grained PAT scoped to the five mirror repos (Contents R/W only)

## 0.6.0 (2026-08-19)

### Official-channel distribution

- Flagship presets (vue3/react/go/python/usage) are mirrored to single-plugin repos (`kimi-boost-<id>`) via CI subtree split — installable with the official `/plugins install <repo-url>` (tree-subdirectory URLs are rejected by the official installer)
- `marketplace` command: new default `repo` source mode (mirrored presets only); `tree` mode deprecated with a warning
- `presets/flagship.json`: single source of truth for mirrored presets (read by CLI + split script)

### Compatibility CI

- `verify.yml`: live-installs every preset into a real Kimi Code CLI via the `kimi web` REST API — on PRs touching `presets/**` and weekly (upstream drift)
- `split-presets.yml`: auto-mirrors flagship presets to single repos on push
- `scripts/verify-plugins.mjs` + `npm run verify:plugins` for local verification

### Docs & misc

- Bilingual README refresh: two install paths, preset catalog with official-repo links, mirror-architecture mermaid
- Per-preset README for mirrors; demo.gif re-recorded deterministically
- Delete stale `presets/marketplace.json`

## 0.5.0 (2026-08-18)

### Differentiators

- **`usage` preset + `kimi-boost usage` command** — session / prompt / tool-call tracking with daily limit hint (`KIMI_BOOST_DAILY_LIMIT`); all hooks fail-open, no agent blocking
- **MCP presets** — `mcp-tools` (zero-config `fetch` + `time` servers); preset `mcpServers` are merged into `~/.kimi-code/mcp.json` (user entries preserved), 16 presets total
- Hook `args` support (same script registered under multiple events with distinct commands)

## 0.4.0 (2026-08-18)

### Presets (8 → 14)

- New: `rust`, `java` (Spring Boot), `fastapi`, `nextjs`, `express`, `react-native`
- 14 presets total, each = auto-loaded best-practice SKILL.md + reviewer agent + main-branch guard

## 0.3.0 (2026-08-17)

### Presets (3 → 8)

- New: `go`, `react`, `flutter`, `nestjs`, `uniapp` (each = auto-loaded best-practice SKILL.md + reviewer agent + main-branch guard)
- Every preset is also a valid `kimi.plugin.json` plugin

### Community

- `kimi-boost create <id> [--name] [--tags]` — one-command preset scaffold for contributors; CI validates the result
- CONTRIBUTING updated with the scaffold flow

## 0.2.1 (2026-08-17)

- Fix: `kimi-boost --version` now reads from package.json instead of a hardcoded value (0.2.0 shipped with a stale version banner)

# Changelog

## 0.2.0 (2026-08-17)

### New commands

- `kimi-boost doctor [--fix]` — diagnose setup: CLI detection, config syntax, hook script health (`node --check`), mounted dirs, manifest consistency; `--fix` restores missing dirs/hook scripts
- `--dry-run` on `install`/`remove` — preview every change without touching the disk

### Config safety

- **Text-level `config.toml` editing**: user comments and formatting are preserved; kimi-boost only touches its own managed sections (`# >>> kimi-boost managed >>>` block for hooks, in-place array merge for `extra_skill_dirs`/`extra_agent_dirs`)
- TOML escaping for Windows paths (backslash/quotes) — fixed invalid configs on Windows
- Legacy hook removal: presets installed by older versions (hooks outside the managed block) are now fully removable

### Cross-tool & registry

- `update --repo <owner/repo> --branch <ref>` (or `$KIMI_BOOST_REPO`) — works for forks
- Dual-channel guard: if a preset is already installed via Kimi Code's `/plugins`, `install` skips duplicate config.toml hooks unless `--with-hooks`
- `marketplace --source-mode zip --tag <tag>` — generate a marketplace pointing at GitHub Release zips; new `release-presets.yml` workflow packs preset zips and publishes them automatically on tag push
- CI matrix now includes `windows-latest`

### Fixes

- `saveKimiConfig` created missing parent dirs (crashed in fresh sandboxes)
- Lazy config path resolution (env overrides now reliable in tests/CI)
- Test isolation: serialized vitest files, no cross-file env pollution

## 0.1.0 (2026-08-17)

- Initial release: `install` / `remove` / `list` / `update` / `status` / `marketplace`
- Presets: `vue3`, `weapp`, `python` (skills + reviewer agents + Node hooks)
- Adapters: Kimi Code, Claude Code, Codex CLI
- Manifest-driven cleanup, managed-roots safety whitelist, kebab-case preset id validation
