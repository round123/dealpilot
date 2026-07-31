import { ExternalLink, FolderOpen, Puzzle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ExtensionStoreUrls {
  chrome?: string;
  edge?: string;
}

export const ExtensionInstallGuide = ({
  urls = {
    chrome: import.meta.env.VITE_DEALPILOT_CHROME_EXTENSION_URL,
    edge: import.meta.env.VITE_DEALPILOT_EDGE_EXTENSION_URL,
  },
}: {
  urls?: ExtensionStoreUrls;
}) => {
  const chromeUrl = safeStoreUrl(urls.chrome, "chromewebstore.google.com");
  const edgeUrl = safeStoreUrl(urls.edge, "microsoftedge.microsoft.com");
  const hasStoreLink = Boolean(chromeUrl || edgeUrl);

  return (
    <section className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
      <Puzzle className="mt-0.5 size-5 text-muted-foreground" />
      <div>
        <h3 className="font-medium">安装或重新配对浏览器扩展</h3>
        <div className="mt-2 space-y-3 leading-6 text-muted-foreground">
          {hasStoreLink ? (
            <div className="flex flex-wrap gap-2">
              {chromeUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={chromeUrl} target="_blank" rel="noreferrer">
                    Chrome Web Store
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
              {edgeUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={edgeUrl} target="_blank" rel="noreferrer">
                    Edge Add-ons
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="flex items-start gap-2">
                <FolderOpen className="mt-1 size-4 shrink-0" />
                商店版本尚未配置。打开浏览器扩展管理页，启用“开发者模式”，选择“加载已解压的扩展”。
              </p>
              <p>
                默认目录：
                <code className="ml-1 break-all rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                  %LOCALAPPDATA%\Programs\DealPilot\extension
                </code>
              </p>
            </div>
          )}
          <p className="flex items-start gap-2">
            <RefreshCw className="mt-1 size-4 shrink-0" />
            保持 Agent 运行，安装或重新安装扩展后会自动配对。本地客户数据不会因卸载扩展而删除。
          </p>
          <p className="text-xs">
            浏览器会在卸载后立即终止扩展代码，因此扩展无法再弹出本地提示；重装入口和配对说明始终保留在此页面。
          </p>
        </div>
      </div>
    </section>
  );
};

function safeStoreUrl(value: string | undefined, expectedHost: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === expectedHost
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
