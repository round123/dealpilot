import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ImportParseResponse } from "@dealpilot/shared";

type Tab = "valid" | "errors" | "duplicates";

export function ImportPreview({
  data,
  onDownloadErrors,
}: {
  data: ImportParseResponse;
  onDownloadErrors?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("valid");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-md border border-border-default bg-bg-hover px-4 py-3 text-sm">
        <span className="text-text-secondary">总行数 <strong className="text-text-primary">{data.total_rows}</strong></span>
        <span className="text-success">有效 <strong>{data.valid_rows}</strong></span>
        <span className="text-error">错误 <strong>{data.errors.length}</strong></span>
        <span className="text-info">重复候选 <strong>{data.duplicate_candidates.length}</strong></span>
      </div>

      <div className="flex gap-1 border-b border-border-default">
        <TabButton active={tab === "valid"} onClick={() => setTab("valid")}>
          有效预览
        </TabButton>
        <TabButton active={tab === "errors"} onClick={() => setTab("errors")}>
          错误行 ({data.errors.length})
        </TabButton>
        <TabButton active={tab === "duplicates"} onClick={() => setTab("duplicates")}>
          重复候选 ({data.duplicate_candidates.length})
        </TabButton>
      </div>

      {tab === "valid" && (
        <div className="overflow-x-auto rounded-lg border border-border-default">
          <table className="w-full text-sm">
            <thead className="bg-bg-hover">
              <tr>
                {data.preview.length > 0 &&
                  Object.keys(data.preview[0]).map((key) => (
                    <th key={key} className="px-3 py-2 text-left text-xs font-medium text-text-secondary">
                      {key}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {data.preview.map((row, i) => (
                <tr key={i} className="border-t border-border-subtle">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-3 py-2 text-text-primary">
                      {String(val ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "errors" && (
        <div className="space-y-2">
          {data.errors.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">无错误行</p>
          ) : (
            data.errors.map((err, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border-default bg-bg-card px-4 py-2">
                <Badge variant="error">第 {err.row} 行</Badge>
                {err.field && <span className="text-xs text-text-tertiary">{err.field}</span>}
                <span className="text-sm text-text-primary">{err.message}</span>
              </div>
            ))
          )}
          {data.errors.length > 0 && (
            <Button variant="outline" size="sm" onClick={onDownloadErrors}>
              <FileDown size={16} />
              下载错误报告
            </Button>
          )}
        </div>
      )}

      {tab === "duplicates" && (
        <div className="space-y-3">
          {data.duplicate_candidates.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">无重复候选</p>
          ) : (
            data.duplicate_candidates.map((dup, i) => (
              <div key={i} className="rounded-md border border-border-default bg-bg-card p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-text-tertiary mb-1">新行数据</p>
                    <p className="text-text-primary">{dup.new_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary mb-1">匹配到现有客户</p>
                    <p className="text-text-primary">{dup.existing_name}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" size="sm">合并</Button>
                  <Button variant="outline" size="sm">跳过</Button>
                  <Button variant="outline" size="sm">保留为新客户</Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-text-primary"
          : "text-text-secondary hover:text-text-primary"
      }`}
      style={active ? { borderBottomColor: "var(--color-primary)" } : {}}
    >
      {children}
    </button>
  );
}
