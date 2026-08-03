export const FLOAT_PANEL_AUTO_COLLAPSE_WIDTH = 600;

export function shouldAutoCollapseFloatPanel(viewportWidth: number): boolean {
  return viewportWidth < FLOAT_PANEL_AUTO_COLLAPSE_WIDTH;
}
