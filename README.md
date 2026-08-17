<div align="center">

# kimi-boost

**One command. Instant workflow superpowers for your AI coding CLI.**

Battle-tested **skills · hooks · agents** — preconfigured into **Kimi Code**, Claude Code and Codex CLI.

`npx kimi-boost install` → pick a preset → done.

</div>

---

## Why

Your AI coding agent only knows what you teach it. Without guidance it writes generic, unidiomatic code, pushes straight to `main`, and runs `rm -rf` on things you liked. Hand-configuring skills, hooks and agents takes hours — and most people never do it.

**kimi-boost** installs a complete, opinionated development workflow into your agent in seconds:

- **Skills** — loaded automatically, teach your agent best practices for your stack
- **Hooks** — cross-platform `node` guards (dangerous commands, main-branch protection)
- **Agents** — ready-made reviewer subagents your agent can delegate to

## Quick start

```bash
npx kimi-boost install
# ✔ vue3 — Vue 3 + TypeScript
# ✔ weapp — WeChat Mini Program
# ✔ python — Python engineering
```

Interactive picker. That's it. Your next session is boosted.

> Requires [Kimi Code](https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html), Claude Code or Codex CLI. Works on macOS, Windows and Linux.

## Presets

| Preset | Stack | Included |
|---|---|---|
| `vue3` | Vue 3 + TypeScript | Best-practice skill · reviewer agent · **main-branch push guard hook** |
| `weapp` | WeChat Mini Program | Structure / subpackage / performance / security rules · reviewer agent |
| `python` | Python | PEP 8 + typing skill · reviewer agent · **dangerous-shell guard hook** |

## Commands

| Command | What it does |
|---|---|
| `kimi-boost install [preset]` | Install a preset (interactive if none given) |
| `kimi-boost list` | Show available + installed presets |
| `kimi-boost remove <preset>` | Uninstall cleanly |
| `kimi-boost update` | Pull latest preset versions from the registry and re-apply |
| `kimi-boost marketplace` | Generate the Kimi Code custom marketplace JSON |
| `kimi-boost status` | Detect installed CLIs & platform |

## Also a plugin marketplace

Kimi Code ships a native plugin system (`/plugins`). kimi-boost doubles as a **third-party marketplace** for it:

```bash
kimi-boost marketplace        # prints instructions
# Terminal: /plugins marketplace https://raw.githubusercontent.com/shidesheng0218/kimi-boost/main/marketplace.json
# or env:   export KIMI_CODE_PLUGIN_MARKETPLACE_URL=<same url>
```

Each preset is also a valid `kimi.plugin.json` plugin — installable with `/plugins install`, with skills, agents, hooks and MCP servers declared in the manifest.

## How it works

- **Kimi Code** — writes `~/.kimi-code/config.toml` (`extra_skill_dirs`, `extra_agent_dirs`, `[[hooks]]`); agent files follow the native frontmatter format (compatible with Claude Code / OpenCode agent files, per Kimi docs)
- **Hooks are plain Node `.mjs`** — same pattern Kimi Code's own docs use, works identically on macOS / Windows / Linux
- **Fail-open hooks** — a crashing hook never blocks your work (exit `0` allow · exit `2` block)
- **Safe by default** — your config is backed up to `<config>.kboost.bak` before every change
- **Idempotent** — reinstall/update never duplicates entries

## Contributing

Preset catalog is PR-driven: add a directory under `presets/`, CI validates schema, hook events and file existence. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [ ] Claude Code + Codex adapters (agent files already cross-compatible)
- [ ] MCP server presets
- [ ] Token/cost usage guard hooks
- [ ] Per-project (`.kimi-boost/`) presets

## License

MIT
