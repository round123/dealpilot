import { basename } from "node:path";

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME = "DealPilot";

export function isPackagedAgent(executablePath = process.execPath): boolean {
  return basename(executablePath).toLowerCase() === "dealpilot-agent.exe";
}

/** Applies the per-user Windows startup registration. */
export function setAutoStartEnabled(enabled: boolean): void {
  if (process.platform !== "win32") {
    throw new Error("Auto-start is only supported by the Windows Agent");
  }
  if (enabled && !isPackagedAgent()) {
    throw new Error("Auto-start can only be enabled by the packaged Agent");
  }

  if (!enabled) {
    const query = Bun.spawnSync(["reg.exe", "QUERY", RUN_KEY, "/v", VALUE_NAME], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (query.exitCode !== 0) return;
  }

  const args = enabled
    ? [
        "ADD",
        RUN_KEY,
        "/v",
        VALUE_NAME,
        "/t",
        "REG_SZ",
        "/d",
        `\"${process.execPath}\"`,
        "/f",
      ]
    : ["DELETE", RUN_KEY, "/v", VALUE_NAME, "/f"];
  const result = Bun.spawnSync(["reg.exe", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || "Registry update failed");
  }
}
