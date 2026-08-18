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
