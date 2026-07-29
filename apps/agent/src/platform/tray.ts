/**
 * DealPilot 系统托盘（.NET NotifyIcon 子进程实现）
 *
 * G1 Spike S7：systray2 在 Bun 编译 exe 里不兼容（"Object is not a constructor"），
 * 按文档降级方案 spawn 一个 PowerShell 子进程，用 System.Windows.Forms.NotifyIcon
 * 实现托盘图标 + 右键菜单（打开工作台 / 退出）。框架托管全部 Win32 管道，稳定。
 *
 * IPC：菜单点击 → PS stdout 输出一行（open/quit）→ Agent 读取并分发。
 * 脚本经 -EncodedCommand（UTF-16LE base64）传入，规避 PS 5.1 的 CJK 编码问题。
 */

import { launchBrowser } from "./browser-launch";

let child: ReturnType<typeof Bun.spawn> | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

/** PowerShell 托盘脚本：创建 NotifyIcon + 右键菜单，点击写 open/quit 到 stdout */
const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Text = 'DealPilot Agent'
$icon.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add('打开工作台')
$miQuit = $menu.Items.Add('退出')
$icon.ContextMenuStrip = $menu
$miOpen.Add_Click({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })
$miQuit.Add_Click({ [Console]::Out.WriteLine('quit'); [Console]::Out.Flush(); $icon.Visible = $false; [System.Windows.Forms.Application]::Exit() })
# 双击托盘图标 = 打开工作台
$icon.Add_DoubleClick({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
[System.Windows.Forms.Application]::Run()
`;

export interface TrayOptions {
  /** 点击"打开工作台"/双击图标 */
  onOpen?: () => void;
  /** 点击"退出" */
  onQuit?: () => void;
}

/**
 * 启动系统托盘（PowerShell NotifyIcon 子进程）
 */
export async function startTray(opts?: TrayOptions): Promise<void> {
  const onOpen = opts?.onOpen ?? (() => launchBrowser());
  const onQuit = opts?.onQuit ?? (() => process.exit(0));

  try {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    child = Bun.spawn(
      [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const stdout = child.stdout;
    if (!stdout || typeof stdout === "number") {
      throw new Error("Tray subprocess stdout pipe is unavailable");
    }
    reader = stdout.getReader();
    let buf = "";
    const decoder = new TextDecoder();

    // 异步按行读取 PS stdout，分发菜单事件
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader!.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line === "ready") {
              console.log("[tray] NotifyIcon ready");
            } else if (line === "open") {
              onOpen();
            } else if (line === "quit") {
              onQuit();
            }
          }
        }
      } catch {
        // reader 已关闭
      }
    })();

    console.log("[tray] NotifyIcon started (PowerShell subprocess)");
  } catch (err) {
    console.warn("[tray] tray not available:", err);
    child = null;
    reader = null;
  }
}

/**
 * 停止系统托盘（杀子进程，图标随进程退出消失）
 */
export function stopTray(): void {
  if (reader) {
    try {
      reader.cancel();
    } catch {
      // 忽略
    }
    reader = null;
  }
  if (child) {
    try {
      child.kill();
    } catch {
      // 忽略
    }
    child = null;
  }
}
