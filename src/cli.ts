import { Command } from "commander";
import { createRequire } from "node:module";
import { registerInstall } from "./commands/registerInstall.js";
import { registerInit } from "./commands/registerInit.js";
import { registerRemove } from "./commands/registerRemove.js";
import { registerList } from "./commands/registerList.js";
import { registerInspect } from "./commands/registerInspect.js";
import { registerVerify } from "./commands/registerVerify.js";
import { registerDoctor } from "./commands/registerDoctor.js";
import { registerCreate } from "./commands/registerCreate.js";
import { registerStats } from "./commands/registerStats.js";
import { registerBadge } from "./commands/registerBadge.js";
import { registerExport } from "./commands/registerExport.js";
import { registerImport } from "./commands/registerImport.js";
import { registerValidate } from "./commands/registerValidate.js";
import { registerDev } from "./commands/registerDev.js";
import { registerPackage } from "./commands/registerPackage.js";
import { registerGuard } from "./commands/registerGuard.js";
import { registerOutdated } from "./commands/registerOutdated.js";
import { registerStatus } from "./commands/registerStatus.js";
import { registerUpdate } from "./commands/registerUpdate.js";
import { registerBootstrap } from "./commands/registerBootstrap.js";
import { registerMarketplace } from "./commands/registerMarketplace.js";

const program = new Command();
const require = createRequire(import.meta.url);
const pkgVersion = (require("../package.json") as { version: string }).version;

program
  .name("kimi-boost")
  .description("One-command preset installer & cross-tool enhancer for Kimi Code, Claude Code and Codex CLI")
  .version(pkgVersion);

// Register all commands
registerInstall(program);
registerInit(program);
registerRemove(program);
registerList(program);
registerUpdate(program);
registerBootstrap(program);
registerMarketplace(program);
registerInspect(program);
registerVerify(program);
registerDoctor(program);
registerCreate(program);
registerStats(program);
registerBadge(program);
registerExport(program);
registerImport(program);
registerValidate(program);
registerDev(program);
registerPackage(program);
registerGuard(program);
registerOutdated(program);
registerStatus(program);

program.parse(process.argv);
