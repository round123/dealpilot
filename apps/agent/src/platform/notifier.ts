/**
 * DealPilot 平台适配 - 系统通知
 * node-notifier Toast 通知
 *
 * G1 Spike 验证：node-notifier 在 Bun 下的兼容性
 */

import type { NotificationOptions } from "node-notifier";

/**
 * 发送系统通知
 */
export async function notify(options: {
  title: string;
  message: string;
  sound?: boolean;
  wait?: boolean;
}): Promise<void> {
  // G1 Spike: 验证 node-notifier 在 Bun 下的兼容性
  try {
    const notifier = await import("node-notifier");
    const notifyOptions: NotificationOptions = {
      title: options.title,
      message: options.message,
      sound: options.sound ?? false,
      wait: options.wait ?? false,
    };
    notifier.notify(notifyOptions);
  } catch (err) {
    // Fallback: 控制台日志
    console.log(`[notify] ${options.title}: ${options.message}`);
  }
}
