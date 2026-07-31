/**
 * @dealpilot/shared - 统一导出
 *
 * 前端、后端、插件三端共享的 Zod schema、TypeScript 类型、常量和工具函数。
 */

// Schemas
export * from "./schemas/common.js";
export * from "./schemas/customer.js";
export * from "./schemas/contact.js";
export * from "./schemas/social-account.js";
export * from "./schemas/follow-up.js";
export * from "./schemas/reminder.js";
export * from "./schemas/project.js";
export * from "./schemas/risk.js";
export * from "./schemas/milestone.js";
export * from "./schemas/match.js";
export * from "./schemas/import.js";
export * from "./schemas/settings.js";
export * from "./schemas/backup.js";
export * from "./schemas/stats.js";
export * from "./schemas/system.js";

// Types
export * from "./types/index.js";

// Constants
export * from "./constants/api-paths.js";
export * from "./constants/platforms.js";
export * from "./constants/config.js";

// Utils
export * from "./utils/format.js";
export * from "./utils/id.js";
export * from "./utils/normalize.js";
