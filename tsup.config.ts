import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  publicDir: "presets",
  banner: {
    js: "#!/usr/bin/env node",
  },
  outExtension: () => ({ js: ".js" }),
});
