#!/usr/bin/env node
/**
 * Live-install verification for presets.
 *
 * Installs every preset into a real Kimi Code CLI through the `kimi web`
 * REST API (POST /api/v1/plugins) and asserts each one loads with
 * state:"ok" and no diagnostics. Also runs a static lint of each
 * kimi.plugin.json manifest before the live pass.
 *
 * No model calls are made — plugin management is purely local — so this
 * needs no API key and is safe for CI.
 *
 * Usage:
 *   node scripts/verify-plugins.mjs [--preset <id>...] [--keep-installed]
 *
 * Env:
 *   KIMI_BIN       path to the kimi binary (default: ~/.kimi-code/bin/kimi,
 *                  falling back to `kimi` on PATH)
 *   KIMI_WEB_PORT  port for the temporary server (default: random)
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const presetsDir = join(root, "presets");

const args = process.argv.slice(2);
const keepInstalled = args.includes("--keep-installed");
const only = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--preset" && args[i + 1]) only.push(args[++i]);
}

const PORT = process.env.KIMI_WEB_PORT || String(58000 + Math.floor(Math.random() * 1500));
const BASE = `http://127.0.0.1:${PORT}`;

function findKimiBin() {
  if (process.env.KIMI_BIN && existsSync(process.env.KIMI_BIN)) return process.env.KIMI_BIN;
  const homeBin = join(process.env.HOME || "", ".kimi-code", "bin", "kimi");
  if (existsSync(homeBin)) return homeBin;
  const which = spawnSync("which", ["kimi"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error("kimi binary not found; set KIMI_BIN");
}

const failures = [];
const notes = [];

/* ---------- static manifest lint ---------- */

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function lintManifest(id, dir) {
  const manifestPath = join(dir, "kimi.plugin.json");
  if (!existsSync(manifestPath)) {
    failures.push(`presets/${id}: missing kimi.plugin.json`);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    failures.push(`presets/${id}: kimi.plugin.json is not valid JSON: ${err.message}`);
    return;
  }
  if (!manifest.name || !NAME_RE.test(manifest.name)) {
    failures.push(`presets/${id}: manifest name "${manifest.name}" violates ${NAME_RE}`);
  }
  if (manifest.name !== id) {
    notes.push(`presets/${id}: manifest name "${manifest.name}" != directory name`);
  }
  const checkPaths = (field) => {
    const value = manifest[field];
    if (!value) return;
    for (const p of Array.isArray(value) ? value : [value]) {
      if (typeof p !== "string" || !p.startsWith("./")) {
        failures.push(`presets/${id}: ${field} entry "${p}" must be a ./ path`);
        continue;
      }
      if (!existsSync(join(dir, p))) {
        failures.push(`presets/${id}: ${field} entry "${p}" does not exist`);
      }
    }
  };
  checkPaths("skills");
  checkPaths("agents");
  checkPaths("commands");
  checkPaths("systemPromptPath");
  // commands: 每个 .md 命令文件需在 frontmatter 后有非空正文
  const commandsVal = manifest.commands;
  if (commandsVal) {
    const cmdPaths = Array.isArray(commandsVal) ? commandsVal : [commandsVal];
    for (const p of cmdPaths) {
      const abs = join(dir, String(p));
      if (!existsSync(abs)) continue; // checkPaths 已报过
      const files = [];
      if (statSync(abs).isDirectory()) {
        for (const f of readdirSync(abs, { recursive: true })) {
          if (String(f).endsWith(".md")) files.push(join(abs, String(f)));
        }
      } else if (abs.endsWith(".md")) {
        files.push(abs);
      }
      for (const f of files) {
        const body = readFileSync(f, "utf8").replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
        if (!body) failures.push(`presets/${id}: command file "${p}" (${f}) has empty prompt body`);
      }
    }
  }
  for (const [i, hook] of (manifest.hooks || []).entries()) {
    if (!hook.event || !hook.command) {
      failures.push(`presets/${id}: hooks[${i}] missing event or command`);
      continue;
    }
    // Resolve a ./ script path out of the command, e.g. "node ./hooks/x.mjs"
    const scriptArg = (hook.command.match(/(?:^|\s)(\.\/[^\s"']+)/) || [])[1];
    if (scriptArg && !existsSync(join(dir, scriptArg))) {
      failures.push(`presets/${id}: hooks[${i}] script "${scriptArg}" does not exist`);
    }
  }
}

/* ---------- live install verification ---------- */

async function waitForServer(proc, timeoutMs = 30000) {
  return new Promise((resolvePromise, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`kimi web did not start in ${timeoutMs}ms\n${out}`)), timeoutMs);
    proc.stdout.on("data", (chunk) => {
      out += chunk;
      const token = out.match(/Token:\s+(\S+)/);
      if (token) {
        clearTimeout(timer);
        resolvePromise(token[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`kimi web exited early (code ${code})\n${out}`));
    });
  });
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response from ${method} ${path}: ${text.slice(0, 200)}`);
  }
  return json;
}

async function main() {
  const ids = readdirSync(presetsDir)
    .filter((e) => statSync(join(presetsDir, e)).isDirectory())
    .filter((e) => only.length === 0 || only.includes(e))
    .sort();
  if (ids.length === 0) throw new Error("no presets found");

  console.log(`Static lint: ${ids.length} preset(s)`);
  for (const id of ids) lintManifest(id, join(presetsDir, id));
  for (const n of notes) console.log(`  note: ${n}`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }
  console.log("  all manifests OK");

  const kimi = findKimiBin();
  console.log(`\nStarting kimi web on port ${PORT} (${kimi})`);
  const server = spawn(kimi, ["web", "--port", PORT], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  server.stderr.on("data", (c) => (stderr += c));

  try {
    const token = await waitForServer(server);
    for (const id of ids) {
      const dir = resolve(join(presetsDir, id));
      // Clean slate in case a previous run left the plugin installed.
      await api(token, "POST", `/plugins/${id}:remove`).catch(() => {});
      const result = await api(token, "POST", "/plugins", { source: dir });
      if (result.code !== 0) {
        failures.push(`presets/${id}: install failed: ${result.msg}`);
        continue;
      }
      const d = result.data || {};
      if (d.state !== "ok" || d.hasErrors) {
        failures.push(`presets/${id}: installed but state=${d.state} hasErrors=${d.hasErrors}`);
        continue;
      }
      console.log(
        `  ok: ${id} (skills:${d.skillCount} hooks:${d.hookCount} commands:${d.commandCount} mcp:${d.mcpServerCount})`,
      );
      if (!keepInstalled) {
        await api(token, "POST", `/plugins/${id}:remove`).catch((err) => {
          notes.push(`presets/${id}: cleanup remove failed: ${err.message}`);
        });
      }
    }
  } finally {
    server.kill("SIGTERM");
  }

  if (stderr.trim()) console.log(`\nserver stderr (last 300 chars): ${stderr.slice(-300)}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${ids.length} preset(s) install cleanly.`);
}

main().catch((err) => {
  console.error(`verify-plugins: ${err.message}`);
  process.exit(1);
});
