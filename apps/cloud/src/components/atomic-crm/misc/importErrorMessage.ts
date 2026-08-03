import { ApiError } from "@dealpilot/api-client";

export function importErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "导入操作失败，请重试。";
  if (error.code === "ABORTED") return "解析已取消，客户数据未写入。";
  if (error.code === "NETWORK_ERROR")
    return "无法连接云服务，请检查网络后重试。";
  if (error.code === "VALIDATION_ERROR")
    return "文件格式或导入内容不符合要求，请检查后重试。";
  if (error.code === "CONFLICT") return "该导入任务已经提交，请重新选择文件。";
  if (error.code === "STORAGE_ERROR")
    return "云端存储暂时不可用或容量不足，请稍后重试。";
  return "导入操作失败，请稍后重试。";
}
