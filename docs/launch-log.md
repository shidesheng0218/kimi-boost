# Launch & feedback log

Track where kimi-boost was announced, with links, so we can follow up and measure.

| Date (UTC) | Channel | Link | Notes |
|---|---|---|---|
| 2026-08-17 | X / Twitter | https://x.com/Shidesheng0218/status/2089223442902262137 | main announcement tweet |
| 2026-08-20 | X / Twitter | https://x.com/Shidesheng0218/status/2090276862450864374 | v0.6/0.7 follow-up: official /plugins channel + project-level presets, demo.gif attached |
| 2026-09-14 | Kimi App「发现」 | not posted yet | material ready: guardrails post copy + cover image `assets/guard-block.png` + `assets/stats-card.png` |

## Feedback funnel

- Pinned issue #1 (demand survey A–F): https://github.com/shidesheng0218/kimi-boost/issues/1
- Preset requests: use the `preset` issue template (label `preset`)
- Feature requests: use the `feature` issue template (label `feature`)
- Open follow-ups: #9 slash-commands not installed by adapters · #10 revert TS pin once typescript-eslint supports TS 7

## Checklist

- [x] X / Twitter main tweet + v0.6/0.7 follow-up
- [x] npm published through **0.13.0** (2026-09-12)
- [x] Official Kimi Code `/plugins` channel: **6 flagship mirrors** (vue3/react/go/python/usage/core) + `marketplace.json`
- [x] Compatibility CI: live-installs every preset into a real Kimi Code CLI (per PR + weekly drift check)
- [x] Kimi App「发现」: copy + cover images prepared — **pending post**
- [ ] V2EX (copy in `docs/feedback-post-zh.md` — refresh to 0.13 first: guardrails, stats, community presets)
- [ ] 掘金 long-form — `docs/juejin.md` still describes v0.1 (3 presets); **must be rewritten before posting**
- [ ] 知乎 / 即刻 (short copy in `docs/feedback-post-zh.md`)
- [ ] Reddit r/ChatGPTCoding + r/LLMDevs (copy in `docs/feedback-post-en.md`)
- [ ] Hacker News Show HN — 暂缓: HN 对新账号限制 Show HN(2026-08-19 实测触发限制页)。先养号(实质评论 5-10 条 + 投稿 1-2 篇非自有技术文章),有 karma 后再发
- [ ] Kimi official developer community group + Curated application

## Metric snapshot

| Metric | Value | As of |
|---|---|---|
| GitHub stars | 0 | 2026-09-14 |
| GitHub forks | 0 | 2026-09-14 |
| npm downloads (last 30d) | 2937 | 2026-09-14 |
| npm latest | 0.13.0 | 2026-09-14 |

> 诊断:工程完成度(13 个版本、272 测试、19 preset、护栏平台)远超曝光度。当前瓶颈是分发,不是功能。

## Releases

| Version | npm | GitHub Release | Notes |
|---|---|---|---|
| 0.1.0 | ✅ published | — | initial (3 presets) |
| 0.2.0 | ✅ published | v0.2.0 (3 preset zips + marketplace.json) | doctor / dry-run / comment-preserving config editing / Windows CI |
| 0.2.1 | ✅ published | — | fix: dynamic `--version` banner |
| 0.3.0 | ✅ published | v0.3.0 (8 preset zips + marketplace.json) | 8 presets (go/react/flutter/nestjs/uniapp added), `create` scaffold command |
| 0.4.0 | ✅ published | v0.4.0 (14 preset zips + marketplace.json) | 14 presets (rust/java/fastapi/nextjs/express/react-native added) |
| 0.5.0 | ✅ published | v0.5.0 | `usage` preset (session/prompt/tool-call tracking + daily limit), MCP presets (`mcp.json` merge), hook args, 16 presets |
| 0.6.0 | ✅ published | v0.6.0 | **official `/plugins` channel**: subtree-split mirrors + `marketplace.json`; compatibility CI live-installs into a real Kimi Code CLI |
| 0.7.0 | ✅ published | v0.7.0 | project-level presets (`--project`, git-shareable), flagship slash commands, three-way status view |
| 0.8.0 | ✅ published | v0.8.0 | content-aware hook dedup (sha256 + refcount), version tracking + `outdated`, `prepublishOnly` gate + publish pipeline |
| 0.9.0 | ✅ published | v0.9.0 | `init` (project-aware), `update --dry-run` + update now applies remote content, ESLint + pre-commit gates, `security` + `git-workflow` presets, `bootstrap`, `update --check/--watch` |
| 0.10.0 | ✅ published | v0.10.0 | `stats` + shareable SVG cards, community presets (`install github:owner/repo`), `badge` |
| 0.11.0 | ✅ published | v0.11.0 | `export`/`import` (setup clone), stats v2 (per-tool breakdown + toolCalls counting fix), preset author tooling (`validate`/`dev`/`package`), install robustness (self-check, backups, fetch resilience) |
| 0.12.0 | ✅ published | v0.12.0 | **`core` guardrails preset**, `init` defaults to it; fix: `block-dangerous` rm patterns never actually matched |
| 0.13.0 | ✅ published | v0.13.0 | guard log + **`kimi-boost guard`** (list/log/live toggles/custom patterns), `protect-credentials` + `git-destructive` guards, stats surfaces `🛡️ N blocks` |
| next (0.14.0) | — | — | `core` joins the flagship mirrors (`/plugins install …/kimi-boost-core`); 2 `split-presets.sh` fixes |