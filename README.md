<div align="center">

# ⚡ kimi-boost

**Battle-tested skills · hooks · agents — one command, for Kimi Code, Claude Code and Codex CLI.**

`npx kimi-boost install` → pick a preset → done.

[![GitHub stars](https://img.shields.io/github/stars/shidesheng0218/kimi-boost?style=flat-square)](https://github.com/shidesheng0218/kimi-boost)
[![npm](https://img.shields.io/npm/v/kimi-boost?style=flat-square)](https://www.npmjs.com/package/kimi-boost)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/shidesheng0218/kimi-boost/ci.yml?style=flat-square&label=CI)](https://github.com/shidesheng0218/kimi-boost/actions/workflows/ci.yml)
[![Plugin compatibility](https://img.shields.io/github/actions/workflow/status/shidesheng0218/kimi-boost/verify.yml?style=flat-square&label=plugin%20compat)](https://github.com/shidesheng0218/kimi-boost/actions/workflows/verify.yml)
[![presets](https://img.shields.io/badge/presets-16-blueviolet?style=flat-square)](#presets)

**[English](README.md) · [中文文档](docs/README.zh-CN.md)**

</div>

---

## Why

Your AI coding agent only knows what you teach it. Without guidance it writes generic, unidiomatic code, pushes straight to `main`, and runs `rm -rf` on things you liked. Hand-configuring skills, hooks and agents takes hours — so nobody ever does it.

**kimi-boost installs a complete, opinionated development workflow in seconds:**

| You get | What it does |
|---|---|
| 🧠 **Skills** | Best-practice rules your agent **auto-loads** — no prompting required |
| 🔍 **Reviewer agents** | Read-only subagents your agent delegates to before committing |
| 🛡️ **Hooks** | Cross-platform Node guards: dangerous commands, main-branch protection |
| 🔄 **One-command updates** | `kimi-boost update` keeps every preset current, even on forks |

## Demo

<div align="center">

![kimi-boost demo](https://github.com/shidesheng0218/kimi-boost/raw/main/assets/demo.gif)

</div>

GIF won't load (or you're behind a slow CDN)? Same session, as plain text:

```text
$ kimi-boost install vue3
✓ [kimi] Installed preset 'vue3' into Kimi Code
  /Users/you/.kimi-boost/hooks/vue3
  config.toml[extra_skill_dirs], config.toml[extra_agent_dirs], config.toml[[hooks]] (+1)
  Run /reload or start a new session.

$ kimi-boost doctor
✓ kimi: detected (version 0.36.1)
✓ kimi: config.toml parses
✓ kimi: hook script valid
✓ kimi: mounted dir present
All checks passed.
```

## Two ways to install

**① Official Kimi Code plugin channel — no CLI required.** The five flagship presets are mirrored to single-plugin repos and install natively:

```
/plugins install https://github.com/shidesheng0218/kimi-boost-vue3
```

Available mirrors: [vue3](https://github.com/shidesheng0218/kimi-boost-vue3) · [react](https://github.com/shidesheng0218/kimi-boost-react) · [go](https://github.com/shidesheng0218/kimi-boost-go) · [python](https://github.com/shidesheng0218/kimi-boost-python) · [usage](https://github.com/shidesheng0218/kimi-boost-usage)

Or browse them inside the `/plugins` panel via our marketplace feed:

```bash
export KIMI_CODE_PLUGIN_MARKETPLACE_URL=https://raw.githubusercontent.com/shidesheng0218/kimi-boost/main/marketplace.json
```

**② kimi-boost CLI — all 16 presets, three harnesses.** One installer for Kimi Code, Claude Code *and* Codex CLI, with updates, doctor checks and clean uninstalls:

```bash
npx kimi-boost install
```

| | Official channel | kimi-boost CLI |
|---|---|---|
| Presets | 5 flagship (mirrored) | All 16 |
| Harnesses | Kimi Code | Kimi Code · Claude Code · Codex |
| Needs | Just Kimi Code | Node.js |
| Extras | — | update · doctor · usage stats · dry-run |

## Presets

| Preset | Stack | Reviewer agent | Hooks | Official repo |
|---|---|---|---|---|
| `vue3` | Vue 3 + TypeScript | `vue3-reviewer` | 🛡️ main-branch guard | [✅ kimi-boost-vue3](https://github.com/shidesheng0218/kimi-boost-vue3) |
| `react` | React + TypeScript | `react-reviewer` | 🛡️ main-branch guard | [✅ kimi-boost-react](https://github.com/shidesheng0218/kimi-boost-react) |
| `go` | Go | `go-reviewer` | 🛡️ main-branch guard | [✅ kimi-boost-go](https://github.com/shidesheng0218/kimi-boost-go) |
| `python` | Python | `python-reviewer` | 🛡️ dangerous-shell blocker | [✅ kimi-boost-python](https://github.com/shidesheng0218/kimi-boost-python) |
| `nextjs` | Next.js (fullstack) | `nextjs-reviewer` | 🛡️ main-branch guard | via CLI |
| `react-native` | React Native | `react-native-reviewer` | 🛡️ main-branch guard | via CLI |
| `flutter` | Flutter / Dart | `flutter-reviewer` | 🛡️ main-branch guard | via CLI |
| `uniapp` | uni-app (cross-platform) | `uniapp-reviewer` | 🛡️ main-branch guard | via CLI |
| `weapp` | WeChat Mini Program | `weapp-reviewer` | — | via CLI |
| `nestjs` | NestJS / TypeScript backend | `nestjs-reviewer` | 🛡️ main-branch guard | via CLI |
| `express` | Express (Node.js) | `express-reviewer` | 🛡️ main-branch guard | via CLI |
| `fastapi` | FastAPI (Python) | `fastapi-reviewer` | 🛡️ main-branch guard | via CLI |
| `rust` | Rust | `rust-reviewer` | 🛡️ main-branch guard | via CLI |
| `java` | Java (Spring Boot) | `java-reviewer` | 🛡️ main-branch guard | via CLI |

**Special presets:**

| Preset | What it gives you | Official repo |
|---|---|---|
| `usage` | Tracks sessions / prompts / tool calls into `~/.kimi-boost/usage.json`; daily limit hint via `KIMI_BOOST_DAILY_LIMIT`; view with `kimi-boost usage` | [✅ kimi-boost-usage](https://github.com/shidesheng0218/kimi-boost-usage) |
| `mcp-tools` | Zero-config MCP servers: `fetch` (web scraping) + `time` (timezones) — written to `~/.kimi-code/mcp.json` | via CLI |
| `security` | Cross-stack guard: scans Write/Edit for hardcoded secrets, blocks dangerous `git push` (`--force`/`--delete`, allows `--force-with-lease`); plus a `security-reviewer` agent | via CLI |
| `git-workflow` | Conventional commits, branch naming & PR discipline (auto-loaded skill) + a `git-workflow-reviewer` agent; no hooks | via CLI |

> Every preset bundles a best-practice SKILL.md (auto-loaded) + a reviewer agent. New stacks are vote-driven — [issue #1](https://github.com/shidesheng0218/kimi-boost/issues/1). "via CLI" presets get their own official repo as demand grows.

Each preset is **one directory** in this repo — a valid `kimi.plugin.json` plugin AND a kimi-boost preset. Contributions welcome:

```
presets/<id>/
├── preset.json          # kimi-boost metadata
├── kimi.plugin.json     # Kimi Code plugin manifest (native marketplace form)
├── skills/<name>/SKILL.md
├── agents/<name>-reviewer.md
└── hooks/<name>.mjs     # cross-platform Node, fail-open by design
```

## Commands

| Command | What it does |
|---|---|
| `kimi-boost install [preset]` | Install a preset (`--dry-run` preview, `--with-hooks` force, `--project` install into current project) |
| `kimi-boost init` | Detect this project's stack and install matching presets (`--yes` skip prompt, `--dry-run` preview, `--project`) |
| `kimi-boost list` | Show available + installed presets |
| `kimi-boost remove <preset>` | Uninstall cleanly |
| `kimi-boost update [--repo owner/repo]` | Pull latest versions and re-apply (works on forks) |
| `kimi-boost outdated [--project] [--json]` | Show installed presets with newer registry versions |
| `kimi-boost doctor [--fix]` | Diagnose config, hooks, mounted dirs, manifest consistency, duplicate hooks |
| `kimi-boost marketplace [--source-mode repo\|zip]` | Generate a Kimi Code custom marketplace JSON |
| `kimi-boost usage [-d N]` | Show session/prompt/tool-call usage tracked by the `usage` preset |
| `kimi-boost status` | Detect installed CLIs & platform |
| `kimi-boost bootstrap [--makefile]` | Generate a `setup.sh` (or Makefile `setup` target) for team onboarding |
| `kimi-boost update --check` | Check for preset updates without installing; notifies + exits non-zero if found |
| `kimi-boost update --watch [--interval h] [--uninstall]` | Register/remove a periodic background update check |

### Project-level installs (team sharing)

`kimi-boost install <preset> --project` writes the preset into the current project instead of your user config:

- skills → `.agents/skills/` (Kimi Code + the cross-tool `.agents/` convention) and `.claude/skills/`
- agents → `.agents/agents/` and `.claude/agents/`
- hooks → `.claude/settings.json` (Claude Code only — Kimi Code has no project-level hook mechanism; Codex is skipped)

Everything lands inside the project root (nearest `.git` ancestor), so you can **commit the preset and share it with your team** — every clone gets the same AI behavior. Remove with `kimi-boost remove <preset> --project`.

### `doctor` — know your setup is healthy

```bash
$ kimi-boost doctor
✓ kimi: detected
  version 0.36.1
✓ kimi: config.toml parses
✓ kimi: hook script valid
  /Users/you/.kimi-boost/hooks/vue3/protect-main.mjs
✓ kimi: mounted dir present
⚠ codex: CLI not detected
  Install codex or ignore if you don't use it.

1 warning(s), no errors
```

`kimi-boost doctor --fix` restores missing mounted dirs and hook scripts automatically.

## How it works

```mermaid
flowchart TD
    REG["<b>presets/ registry</b> (16 presets)<br/>skills · agents · hooks · mcp"]

    subgraph CI["Monorepo CI"]
      VERIFY["verify.yml<br/>live-installs every preset<br/>into a real Kimi Code CLI"]
      SPLIT["split-presets.yml<br/>git subtree mirror"]
    end

    REG --> CI
    SPLIT -->|"auto-mirror"| M1["kimi-boost-vue3"]
    SPLIT -->|"auto-mirror"| M2["react · go · python · usage"]
    M1 & M2 -->|"/plugins install"| KP["Kimi Code /plugins"]
    REG -->|"builds (repo sources)"| MKT["marketplace.json"]
    MKT -->|"KIMI_CODE_PLUGIN_MARKETPLACE_URL"| KP

    KB["<b>kimi-boost CLI</b><br/><i>install · remove · doctor · update</i>"]
    REG --> KB
    KB -->|"text-level edit"| KCF["~/.kimi-code/config.toml"]
    KB -->|"manifest-driven"| CCS["~/.claude/settings.json"]
    KB -->|"manifest-driven"| CXC["~/.codex/config.toml"]

    classDef cli fill:#7c3aed,color:#fff,font-weight:bold;
    classDef tool fill:#1e293b,color:#e2e8f0;
    classDef out fill:#064e3b,color:#a7f3d0;
    class KB,REG cli;
    class M1,M2,MKT tool;
    class KCF,CCS,CXC,KP out;
```

- **Single source of truth** — presets live in this monorepo; the five flagship mirrors are read-only CI artifacts, re-synced on every push.
- **Kimi Code** — the CLI edits `~/.kimi-code/config.toml` at **text level** (a managed `# >>> kimi-boost managed >>>` block plus in-place array merge). Your comments and formatting survive untouched.
- **Claude Code & Codex** — manifest-driven install into `~/.claude` / `~/.codex`; agent files use the native frontmatter format (cross-compatible, per Kimi docs).
- **Hooks are plain Node `.mjs`** — the same pattern Kimi Code's own docs use, identical behavior on macOS / Windows / Linux.
- **Compatibility is tested, not assumed** — CI live-installs all 16 presets into a real Kimi Code CLI on every PR, and weekly against upstream drift.

## Safety by default

- 🔒 **Never touches your config beyond its own managed section** — comments, ordering, formatting all preserved
- 🗄️ Backed up to `<config>.kboost.bak` before every change
- 🚧 Managed-roots whitelist — refuses to delete anything outside `~/.kimi-boost`, `~/.kimi-code`, `~/.claude`, `~/.codex`
- 🛡️ Dual-channel guard — already installed via Kimi `/plugins`? No duplicate hooks.
- ♻️ **Content-aware hook dedup** — presets bundling the same guard script (e.g. `protect-main.mjs`) share a single config entry; uninstalling one preset retargets the entry to the next owner instead of breaking the rest. `doctor` flags redundant or diverging hook copies.
- ⚡ Fail-open hooks — a crashing hook never blocks your work (exit `0` allow · exit `2` block)

## Roadmap

- [x] MCP server presets
- [x] Token/cost usage guard hooks
- [x] Official-channel distribution (single-plugin repo mirrors)
- [x] Per-project (`.kimi-boost/`) presets
- [ ] More stack presets (vote in [issue #1](https://github.com/shidesheng0218/kimi-boost/issues/1))
- [ ] Mirror every preset to its own official repo

## Contributing

Preset catalog is PR-driven: add a directory under `presets/`, CI validates schema, hook events and file existence — then live-installs your preset into a real Kimi Code CLI. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
