/**
 * DealPilot 插件 Content Script 入口
 *
 * 检测当前页面是 WhatsApp 还是 Telegram，
 * 检测是否进入一对一对话（群组/频道显示"不支持"），
 * 挂载 Shadow DOM 隔离的浮窗。
 *
 * WXT 会自动将此文件编译为 content script。
 */

import { defineContentScript } from "wxt/sandbox";
import React from "react";
import { createRoot } from "react-dom/client";
import { FloatApp } from "./App";
import { createShadowHost, getMountPoint } from "./shadow-root";
import { detectPlatform } from "../../src/lib/platform-detect";

/** 初始化浮窗 */
function initFloat(): void {
  // 检测当前是否在支持的平台
  const platform = detectPlatform();
  if (!platform) {
    return;
  }

  // 创建 Shadow DOM 并挂载 React
  const { shadow } = createShadowHost();
  const mountPoint = getMountPoint(shadow);

  if (mountPoint && !mountPoint.hasChildNodes()) {
    const root = createRoot(mountPoint);
    root.render(
      <React.StrictMode>
        <FloatApp />
      </React.StrictMode>,
    );
  }
}

export default defineContentScript({
  matches: ["https://web.whatsapp.com/*", "https://web.telegram.org/*"],
  main() {
    // 等 DOM 就绪后初始化
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initFloat);
    } else {
      initFloat();
    }
  },
});
