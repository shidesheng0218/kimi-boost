# Contributing

Thanks for helping grow the preset catalog. Three ways to contribute:

## 1. Add a new preset (most valuable)

A preset is a directory under `presets/<id>/`:

```
presets/<id>/
├── preset.json          # required - kimi-boost metadata (see below)
├── kimi.plugin.json     # optional - Kimi Code plugin manifest (native marketplace form)
├── skills/              # optional - SKILL.md files the agent auto-loads
│   └── <name>/SKILL.md
├── agents/              # optional - reviewer/subagent .md files
│   └── <name>-reviewer.md
└── hooks/               # optional - cross-platform node .mjs scripts
    └── <name>.mjs
```

`preset.json` schema:

```json
{
  "id": "mypreset",                    // must match directory name, kebab-case
  "name": "My Stack",
  "description": "One-line pitch shown in the installer",
  "tags": ["frontend", "vue"],
  "version": "1.0.0",                  // bump on content changes
  "hooks": [                           // optional
    {
      "event": "PreToolUse",           // see Kimi Code hooks docs for events
      "matcher": "Bash",
      "script": "my-hook.mjs",         // relative to hooks/
      "timeout": 5
    }
  ]
}
```

Rules:

- `hooks/*.mjs` must be pure Node (cross-platform, no bash)
- hooks must **fail-open** (non-zero exit = allow, exit 2 = block)
- agents must be read-only unless the prompt explains why not
- all content must be original or license-compatible (MIT/CC0) with attribution

## 2. Improve an existing preset

Edit the SKILL.md / hooks / agents, bump `version` in `preset.json`, open a PR.

## 3. Report issues

- Preset content is wrong or outdated → open an issue with the preset id
- `kimi-boost` crashes → include `node -v`, OS, and the command output

## CI

Every PR runs: typecheck, unit tests, preset schema validation, build and a CLI smoke test. Make sure `node scripts/validate-presets.mjs` passes locally.

## License

MIT. By contributing you agree your contributions are MIT-licensed.
