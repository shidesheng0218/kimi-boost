# Launch posts (English, v0.6.0)

Channels: Reddit (r/ChatGPTCoding, r/LLMDevs, r/commandline), Hacker News (Show HN), X/Twitter.

## Reddit / HN version

Title: **Show HN: kimi-boost – one command gives your AI coding CLI a real dev workflow (skills + hooks + agents); now installable via Kimi Code's native /plugins**

Body:

---

Your AI coding agent only knows what you teach it. Out of the box it writes generic code, pushes straight to `main`, and runs `rm -rf` on things you like. Hand-configuring skills, hooks and agents takes hours — so nobody does it.

**kimi-boost** installs a complete, opinionated workflow in one command:

```bash
npx kimi-boost install
```

**New in v0.6.0 — official plugin channel.** The five flagship presets are mirrored as single-plugin repos, so Kimi Code users can install them natively, no CLI required:

```
/plugins install https://github.com/shidesheng0218/kimi-boost-vue3
```

What you get per preset:

- **SKILL.md** best-practice rules the agent auto-loads (composition API, subpackaging, PEP 8 + typing)
- **Reviewer subagent** it can delegate to before committing
- **Cross-platform Node hooks** — main-branch push guard, dangerous-shell blocker (fail-open by design)

16 presets today: vue3 / react / nextjs / react-native / flutter / uniapp / weapp / nestjs / express / fastapi / go / rust / java / python, plus `usage` (token-cost tracking) and `mcp-tools` (zero-config MCP servers).

Supported CLIs: **Kimi Code, Claude Code, Codex** (config-format adapters). Config is backed up before every change, installs are idempotent, and `kimi-boost update` keeps presets fresh.

Compatibility is tested, not assumed: CI live-installs all 16 presets into a real Kimi Code CLI on every PR, and weekly against upstream drift.

We're still demand-driven — tell us what to build next:

- A. More stack skills (Rails / Swift / Kotlin…)
- B. More code-review agents
- C. More safety/git hooks
- D. More MCP server presets
- E. Workflow bundles (commit conventions, doc generation)

Repo: https://github.com/shidesheng0218/kimi-boost
npm: `npx kimi-boost install`

## X / Twitter version (v0.6.0 follow-up)

> kimi-boost v0.6.0: presets now install through Kimi Code's OFFICIAL /plugins channel — no CLI needed:
>
> /plugins install https://github.com/shidesheng0218/kimi-boost-vue3
>
> 16 presets (stack skills + reviewer agents + safety hooks), 3 harnesses (Kimi Code / Claude Code / Codex), and CI that live-installs every preset into a real Kimi Code CLI on each PR.
>
> npx kimi-boost install
