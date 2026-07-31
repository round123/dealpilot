/**
 * The browser workbench has no window-level quit control. The tray must stay
 * available as the Agent's only normal exit path; the legacy setting is kept
 * in SQLite for compatibility but deliberately does not affect startup.
 */
export function shouldStartTray(
  skipTray = process.env.DEALPILOT_SKIP_TRAY,
  _legacyMinimizeToTray?: boolean,
): boolean {
  return skipTray !== "1";
}
