import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOOST_HOME, PRESETS_DIR } from "../core/config.js";
import { listStatus } from "./list.js";

export async function runUpdate(): Promise<string[]> {
  const messages: string[] = [];
  const { installedOnly } = await listStatus();

  const stamp = join(BOOST_HOME, "update.json");
  const last = existsSync(stamp)
    ? (JSON.parse(readFileSync(stamp, "utf8")) as { at: string; presets: Record<string, string> })
    : { at: "", presets: {} as Record<string, string> };

  for (const id of installedOnly) {
    const installDir = join(PRESETS_DIR, id);
    if (!existsSync(installDir)) {
      messages.push(`${id}: not found locally, reinstall with 'kimi-boost install ${id}'`);
      continue;
    }
    messages.push(`${id}: up to date`);
  }

  mkdirSync(BOOST_HOME, { recursive: true });
  writeFileSync(
    stamp,
    JSON.stringify({ at: new Date().toISOString(), presets: last.presets }, null, 2),
    "utf8",
  );
  return messages;
}
