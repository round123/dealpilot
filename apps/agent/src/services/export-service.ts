import * as XLSX from "xlsx";
import { listCustomersForExport } from "../repositories/system-repository";

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
