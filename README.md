# kimi-boost

> One-command preset installer & cross-tool enhancer for **Kimi Code**, Claude Code and Codex CLI.

Install battle-tested development workflows (skills + hooks + agents) into your AI coding CLI in seconds — instead of hours of manual config.

## Quick start

```bash
npx kimi-boost install
# pick a preset interactively, done
```

Presets ship as:
- **Agent Skills** (`SKILL.md`) — loaded automatically by the agent
- **Hooks** — cross-platform `node` scripts (safety guards, commit protection)
- **Agents / subagents** — reusable reviewer roles

## Commands

| Command | Description |
|---|---|
| `kimi-boost install [preset]` | Install a preset (interactive picker if none given) |
| `kimi-boost list` | List available / installed presets |
| `kimi-boost remove <preset>` | Uninstall a preset |
| `kimi-boost status` | Detect installed CLIs & platform |
| `kimi-boost update` | Check installed presets for updates |

## Presets

| ID | Stack | What you get |
|---|---|---|
| `vue3` | Vue 3 + TypeScript | Best-practice skill + main-branch push guard hook |
| `weapp` | WeChat Mini Program | Directory / subpackage / performance rules |
| `python` | Python | PEP 8 + typing skill + dangerous-shell guard hook |

## How it works

- Kimi Code: writes `~/.kimi-code/config.toml` (`extra_skill_dirs`, `extra_agent_dirs`, `[[hooks]]`) — fully compatible with the official plugin system
- Everything backed up to `<config>.kboost.bak` before any change
- Hooks are plain Node `.mjs` — cross-platform (macOS / Windows / Linux)
- All hooks fail-open: an error never blocks your work

## License

MIT
