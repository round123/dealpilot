/**
 * DealPilot 平台适配 - 系统通知
 * node-notifier Toast 通知
 *
 * G1 Spike 验证：node-notifier 在 Bun 下的兼容性
 */

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
  const module = await import("node-notifier");
  const notifier = module.default;
  await new Promise<void>((resolve, reject) => {
    notifier.notify({
      title: options.title,
      message: options.message,
      sound: options.sound ?? false,
      wait: options.wait ?? false,
    }, (error) => error ? reject(error) : resolve());
  });
}
