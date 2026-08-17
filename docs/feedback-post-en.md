# Demand-validation post (English)

Channels: Reddit (r/ChatGPTCoding, r/LLMDevs, r/commandline), Hacker News (Show HN), X/Twitter.

## Reddit / HN version

Title: **Show HN: kimi-boost – one command that gives your AI coding CLI real dev workflow (skills + hooks + agents)**

Body:

---

Your AI coding agent only knows what you teach it. Out of the box it writes generic code, pushes straight to `main`, and runs `rm -rf` on things you like. Hand-configuring skills, hooks and agents takes hours — so nobody does it.

**kimi-boost** installs a complete workflow in one command:

```bash
npx kimi-boost install
```

What you get per preset (vue3 / weapp / python today):

- **SKILL.md** best-practice rules the agent auto-loads (composition API, subpackaging, PEP 8 + typing)
- **Reviewer subagent** it can delegate to before committing
- **Cross-platform Node hooks** — main-branch push guard, dangerous-shell blocker (fail-open by design)

Supported CLIs: **Kimi Code, Claude Code, Codex** (config-format adapters). Also doubles as a custom plugin marketplace for Kimi Code's native `/plugins` system. Config backed up before every change, idempotent, `kimi-boost update` keeps presets fresh.

We're early — want to know what YOU want next:

- A. Stack skills (Flutter / Go / Rails / React…)
- B. Code-review agents
- C. Safety/git hooks
- D. MCP server presets
- E. Token/cost guards

Repo + presets: https://github.com/shidesheng0218/kimi-boost
npm: `npx kimi-boost install`

## X / Twitter version

> AI coding agents only know what you teach them. Out of the box: generic code, pushes to main, unbothered `rm -rf`. We built kimi-boost — `npx kimi-boost install` loads stack best-practice skills + reviewer agents + safety hooks into Kimi Code/Claude Code/Codex. Cross-tool, idempotent, auto-updating. Built with the community → tell us what to build next ↓
> https://github.com/shidesheng0218/kimi-boost
