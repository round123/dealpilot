import { BackupCreate } from "../components/backup-create";
import { BackupRestore } from "../components/backup-restore";
import { Button } from "@/components/ui/button";
import { FileWarning, Download } from "lucide-react";

export function BackupPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <BackupCreate />
        <BackupRestore />
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">备份历史</h2>
        <div className="rounded-md border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="bg-bg-hover">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">时间</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">文件名</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">数据量</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">操作</th>
              </tr>
            </thead>
          </table>
        </div>
        <p className="text-sm text-text-tertiary py-4 text-center">暂无备份记录</p>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">导出明文 Excel</h2>
        <div
          className="flex items-start gap-2 rounded-md p-3 text-xs mb-4"
          style={{ backgroundColor: "var(--color-warning-light)" }}
        >
          <FileWarning size={16} style={{ color: "var(--color-warning)" }} className="flex-shrink-0 mt-0.5" />
          <p style={{ color: "var(--color-warning-dark)" }}>
            Excel 为明文文件，导出前请妥善保管
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="md">
            <Download size={16} />
            导出客户
          </Button>
          <Button variant="outline" size="md">
            <Download size={16} />
            导出联系人
          </Button>
          <Button variant="outline" size="md">
            <Download size={16} />
            导出项目
          </Button>
          <Button variant="outline" size="md">
            <Download size={16} />
            导出跟进+提醒
          </Button>
        </div>
      </div>
    </div>
  );
}
