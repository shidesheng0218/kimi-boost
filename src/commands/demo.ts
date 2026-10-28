import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { presetSourceDir } from "../registry/presets.js";

export interface DemoOptions {
  json?: boolean;
}

export interface DemoResult {
  blocked: {
    command: string;
    exitCode: number | null;
    output: string;
  };
  allowed: {
    command: string;
    exitCode: number | null;
    output: string;
  };
  isolated: boolean;
}

export function runDemo(opts: DemoOptions = {}): DemoResult {
  const sandbox = mkdtempSync(join(tmpdir(), "kboost-demo-"));
  const fakeHome = mkdtempSync(join(tmpdir(), "kboost-demo-home-"));
  const hookScript = join(presetSourceDir("core"), "hooks", "protect-main.mjs");

  try {
    spawnSync("git", ["init", "-b", "main"], { cwd: sandbox, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "demo@kimi-boost.local"], { cwd: sandbox, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "Kimi Boost Demo"], { cwd: sandbox, stdio: "ignore" });
    writeFileSync(join(sandbox, "README.md"), "# Demo Project\n");
    spawnSync("git", ["add", "."], { cwd: sandbox, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: sandbox, stdio: "ignore" });

    const blockedCmd = "git push origin HEAD:main";
    const blockedRes = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ tool_input: { command: blockedCmd }, cwd: sandbox }),
      env: { ...process.env, KIMI_BOOST_HOME: fakeHome },
      encoding: "utf8",
    });

    const allowedCmd = "git status";
    const allowedRes = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ tool_input: { command: allowedCmd }, cwd: sandbox }),
      env: { ...process.env, KIMI_BOOST_HOME: fakeHome },
      encoding: "utf8",
    });

    const result: DemoResult = {
      blocked: {
        command: blockedCmd,
        exitCode: blockedRes.status,
        output: (blockedRes.stderr || blockedRes.stdout).trim(),
      },
      allowed: {
        command: allowedCmd,
        exitCode: allowedRes.status,
        output: (allowedRes.stdout || allowedRes.stderr).trim(),
      },
      isolated: true,
    };

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    console.log(pc.bold("\n🛡️  kimi-boost 安全护栏演示 (沙箱回放)\n"));
    console.log(pc.dim("说明：仅测试 hook 逻辑，不执行真实 push，不修改本机配置。\n"));

    console.log(pc.cyan("1. 测试拦截场景 (推送到受保护主干)："));
    console.log(pc.dim(`   输入命令: ${blockedCmd}`));
    if (result.blocked.exitCode === 2) {
      console.log(pc.green(`   ✓ 成功拦截 (退出码 2)`));
    } else {
      console.log(pc.red(`   ✗ 拦截未按预期触发 (退出码 ${result.blocked.exitCode})`));
    }
    if (result.blocked.output) {
      console.log(pc.dim(`   输出详情: ${result.blocked.output.split("\n")[0]}`));
    }

    console.log(pc.cyan("\n2. 测试放行场景 (日常只读/开发命令)："));
    console.log(pc.dim(`   输入命令: ${allowedCmd}`));
    if (result.allowed.exitCode === 0) {
      console.log(pc.green(`   ✓ 正常放行 (退出码 0)`));
    } else {
      console.log(pc.red(`   ✗ 误拦截 (退出码 ${result.allowed.exitCode})`));
    }

    console.log(pc.cyan("\n3. 下一步："));
    console.log(`   - 预览将安装的内容: ${pc.bold("npx kimi-boost inspect core")}`);
    console.log(`   - 安全安装护栏:   ${pc.bold("npx kimi-boost init")}`);
    console.log(`   - 诊断环境健康度: ${pc.bold("npx kimi-boost doctor")}\n`);

    return result;
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  }
}
