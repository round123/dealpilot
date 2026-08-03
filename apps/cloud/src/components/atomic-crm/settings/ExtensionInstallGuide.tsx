import { Cloud, ExternalLink, Puzzle, RefreshCw } from "lucide-react";

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
            <p>商店版本尚未发布，正式上架后可在这里安装。</p>
          )}
          <p className="flex items-start gap-2">
            <Cloud className="mt-1 size-4 shrink-0" />
            扩展使用同一 DealPilot 账号连接云端；卸载扩展不会删除云端客户数据。
          </p>
          <p className="flex items-start gap-2 text-xs">
            <RefreshCw className="mt-1 size-3.5 shrink-0" />
            重新安装后，请在扩展中重新登录并授权当前浏览器。
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
