let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const command = String(payload.tool_input?.command ?? "");
    const m = command.match(/\bgit\s+push\b([\s\S]*)/);
    if (!m) process.exit(0);

    // --force-with-lease 是相对安全的强推(远端被别人更新时会拒绝),放行;先从参数里剔除再判
    const args = m[1].replace(/--force-with-lease(=\S+)?/g, "");
    const dangerous = /--force\b|--delete\b|(?:^|\s)-[a-zA-Z]*f[a-zA-Z]*(?=\s|$)/.test(args);
    if (dangerous) {
      console.error(
        "[kimi-boost] Blocked: dangerous git push (--force / --delete). " +
          "如确需覆盖远端,请用 --force-with-lease 并先确认无他人协作。",
      );
      process.exit(2);
    }
  } catch {
    /* fail-open */
  }
  process.exit(0);
});
