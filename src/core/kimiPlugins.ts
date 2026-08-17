import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kimiHomeDir } from "./detect.js";

/**
 * 检测某 preset 是否已通过 Kimi Code 官方 `/plugins` 通道安装。
 *
 * 官方机制:安装记录在 $KIMI_CODE_HOME/plugins/installed.json,
 * 插件本体拷贝到 $KIMI_CODE_HOME/plugins/managed/<id>/。
 * installed.json 的具体 schema 未公开,这里做格式自适应解析。
 */
export function kimiPluginInstalled(presetId: string): boolean {
  const home = kimiHomeDir();
  if (!existsSync(home)) return false;

  const managed = join(home, "plugins", "managed", presetId);
  if (existsSync(managed)) return true;

  const file = join(home, "plugins", "installed.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const arr = Array.isArray(data.plugins) ? data.plugins : Array.isArray(data.installed) ? data.installed : [];
      return (arr as Array<Record<string, unknown>>).some((p) => {
        const id = String(p.id ?? p.name ?? p ?? "");
        return id === presetId;
      });
    } catch {
      /* unreadable record: fall back to dir probe only */
    }
  }
  return false;
}
