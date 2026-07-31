import { Download, ShieldCheck } from "lucide-react";
import { useDataProvider, useNotify, type RaRecord } from "ra-core";
import { useState } from "react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EXPORT_RESOURCES = [
  ["companies", "客户"],
  ["contacts", "联系人"],
  ["social_accounts", "社媒账号"],
  ["deals", "项目"],
  ["follow_ups", "跟进"],
  ["reminders", "提醒"],
  ["deal_risks", "项目风险"],
  ["deal_milestones", "项目里程碑"],
] as const;

type ExportRow = RaRecord & Record<string, unknown>;
type SpreadsheetRow = Record<string, unknown>;

export const CloudDataToolsPage = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [pending, setPending] = useState(false);

  const exportCloudData = async () => {
    setPending(true);
    try {
      const workbook = XLSX.utils.book_new();
      const counts: string[] = [];

      for (const [resource, label] of EXPORT_RESOURCES) {
        const result = await dataProvider.getList<ExportRow>(resource, {
          pagination: { page: 1, perPage: 10_000 },
          sort: { field: "created_at", order: "ASC" },
        });
        const rows = result.data.map(toExportRow);
        const sheet = XLSX.utils.json_to_sheet(
          rows.length ? rows : [{ "暂无数据": "" }],
        );
        XLSX.utils.book_append_sheet(workbook, sheet, label.slice(0, 31));
        counts.push(`${label} ${rows.length} 条`);
      }

      const metadata = XLSX.utils.json_to_sheet([
        { 字段: "导出时间", 值: new Date().toISOString() },
        { 字段: "数据来源", 值: "DealPilot Cloud / Supabase" },
        { 字段: "说明", 值: "仅包含当前账号在 RLS 授权范围内的数据" },
      ]);
      XLSX.utils.book_append_sheet(workbook, metadata, "导出说明");
      XLSX.writeFile(workbook, `dealpilot-cloud-export-${fileTimestamp()}.xlsx`);
      notify(`云端数据已导出：${counts.join("、")}`, { type: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "云端数据导出失败，请重试", {
        type: "error",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">设置 / 云端数据</p>
        <h1 className="mt-1 text-2xl font-semibold">导出与数据管理</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="size-5" />
            导出云端业务数据
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            导出当前账号有权限访问的客户、联系人、社媒账号、项目、跟进、提醒、风险和里程碑。导出过程使用云端 RLS，其他账号的数据不会进入文件。
          </p>
          <Button onClick={exportCloudData} disabled={pending}>
            <Download className="size-4" />
            {pending ? "正在导出..." : "导出 Excel"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-5" />
            云端数据安全
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>PostgreSQL 是当前业务唯一事实源，浏览器不维护 SQLite 业务副本。</p>
          <p>云端数据库和 Storage 备份由 Supabase 项目策略管理；下载的导出文件请按敏感业务数据妥善保管。</p>
        </CardContent>
      </Card>
    </main>
  );
};

CloudDataToolsPage.path = "/settings/cloud-data";

const toExportRow = (record: ExportRow): SpreadsheetRow =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : value,
    ]),
  );

const fileTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
