import { describe, expect, it } from "vitest";

import {
  AGENT_CRM_CAPABILITIES,
  FULL_CRM_CAPABILITIES,
  SUPABASE_CRM_CAPABILITIES,
} from "./capabilities";

describe("account deletion capability", () => {
  it("is exposed only by the Supabase data provider", () => {
    expect(SUPABASE_CRM_CAPABILITIES.accountDeletion).toBe(true);
    expect(FULL_CRM_CAPABILITIES.accountDeletion).toBe(false);
    expect(AGENT_CRM_CAPABILITIES.accountDeletion).toBe(false);
  });
});
