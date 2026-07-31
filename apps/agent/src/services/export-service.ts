import * as XLSX from "xlsx";
import {
  getAllBusinessDataForExport,
  listCustomersForExport,
} from "../repositories/system-repository";

export interface CustomerExportFilters {
  search?: string;
  grade?: "A" | "B" | "C";
  status?: "active" | "inactive";
}

export async function exportCustomers(filters?: CustomerExportFilters): Promise<Buffer> {
  const customers = await listCustomersForExport(filters);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(customers.map((customer) => ({
    ID: customer.id,
    名称: customer.name,
    公司: customer.company ?? "",
    国家: customer.country ?? "",
    来源: customer.source ?? "",
    分级: customer.grade,
    状态: customer.status,
    创建时间: customer.created_at,
  })));
  XLSX.utils.book_append_sheet(workbook, sheet, "客户");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function exportAllBusinessData(): Promise<Buffer> {
  const data = await getAllBusinessDataForExport();
  const workbook = XLSX.utils.book_new();

  appendSheet(workbook, "客户", data.customers);
  appendSheet(workbook, "联系人", data.contacts);
  appendSheet(workbook, "社媒账号", data.socialAccounts);
  appendSheet(workbook, "项目", data.projects);
  appendSheet(workbook, "跟进", data.followUps);
  appendSheet(workbook, "提醒", data.reminders);
  appendSheet(workbook, "风险", data.risks);
  appendSheet(workbook, "里程碑", data.milestones);

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
) {
  const sheet = rows.length > 0
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([["暂无数据"]]);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}
