import { ApiError } from "@dealpilot/api-client";

export function importErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "导入操作失败，请重试。";
  if (error.code === "ABORTED") return "解析已取消，客户数据未写入。";
  if (error.code === "NETWORK_ERROR")
    return "无法连接本地 Agent，请确认 DealPilot 正在运行。";
  if (error.code === "VALIDATION_ERROR")
    return "文件格式或导入内容不符合要求，请检查后重试。";
  if (error.code === "CONFLICT") return "该导入任务已经提交，请重新选择文件。";
  if (error.code === "STORAGE_ERROR")
    return "本地存储空间不足，请释放空间，或先备份后重试。";
  return "导入操作失败，请稍后重试。";
}
