/**
 * DealPilot API 路径常量
 * 前端和插件统一引用，避免硬编码路径
 */

export const API_V1 = "/api/v1";

export const API_PATHS = {
  // Health
  health: `${API_V1}/health`,

  // Customers
  customers: `${API_V1}/customers`,
  customer: (id: string) => `${API_V1}/customers/${id}`,
  customerRestore: (id: string) => `${API_V1}/customers/${id}/restore`,
  customerMerge: `${API_V1}/customers/merge`,
  customerContacts: (id: string) => `${API_V1}/customers/${id}/contacts`,
  customerSocialAccounts: (id: string) =>
    `${API_V1}/customers/${id}/social-accounts`,

  // Contacts
  contacts: `${API_V1}/contacts`,
  contact: (id: string) => `${API_V1}/contacts/${id}`,

  // Social Accounts
  socialAccounts: `${API_V1}/social-accounts`,
  socialAccount: (id: string) => `${API_V1}/social-accounts/${id}`,

  // Matches
  matchResolve: `${API_V1}/matches/resolve`,
  matchBind: `${API_V1}/matches/bind`,

  // Follow-ups
  followUps: `${API_V1}/follow-ups`,
  followUp: (id: string) => `${API_V1}/follow-ups/${id}`,

  // Reminders
  reminders: `${API_V1}/reminders`,
  reminder: (id: string) => `${API_V1}/reminders/${id}`,
  remindersPopup: `${API_V1}/reminders/popup`,

  // Projects
  projects: `${API_V1}/projects`,
  project: (id: string) => `${API_V1}/projects/${id}`,
  projectStage: (id: string) => `${API_V1}/projects/${id}/stage`,
  projectRisks: (id: string) => `${API_V1}/projects/${id}/risks`,
  projectMilestones: (id: string) => `${API_V1}/projects/${id}/milestones`,

  // Risks & Milestones
  risks: `${API_V1}/risks`,
  risk: (id: string) => `${API_V1}/risks/${id}`,
  milestones: `${API_V1}/milestones`,
  milestone: (id: string) => `${API_V1}/milestones/${id}`,

  // Imports
  importsParse: `${API_V1}/imports/parse`,
  importCommit: (jobId: string) => `${API_V1}/imports/${jobId}/commit`,
  importErrors: (jobId: string) => `${API_V1}/imports/${jobId}/errors`,

  // Exports
  exportsCustomers: `${API_V1}/exports/customers`,
  exportsAll: `${API_V1}/exports/all`,

  // Backups
  backupsCreate: `${API_V1}/backups/create`,
  backupsValidate: `${API_V1}/backups/validate`,
  backupsRestore: `${API_V1}/backups/restore`,

  // Settings
  settings: `${API_V1}/settings`,

  // Stats
  stats: `${API_V1}/stats`,
} as const;
