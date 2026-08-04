import {
  AGENT_CRM_CAPABILITIES,
  FULL_CRM_CAPABILITIES,
  SUPABASE_CRM_CAPABILITIES,
} from "../providers/capabilities";
import { applyContactCapabilities } from "./contactModel";

describe("applyContactCapabilities", () => {
  it("synchronizes the compatibility name for full-profile providers", () => {
    const result = applyContactCapabilities(
      {
        name: "Stale Name",
        first_name: " Ada ",
        last_name: " Lovelace ",
        email_jsonb: [],
        phone_jsonb: [],
      } as any,
      SUPABASE_CRM_CAPABILITIES,
    );

    expect(result).toMatchObject({
      first_name: " Ada ",
      last_name: " Lovelace ",
      name: "Ada Lovelace",
    });
  });

  it("preserves the existing name when structured name fields are empty", () => {
    const input = {
      name: "Existing Name",
      first_name: " ",
      last_name: "",
      email_jsonb: [],
      phone_jsonb: [],
    } as any;

    expect(applyContactCapabilities(input, FULL_CRM_CAPABILITIES)).toBe(input);
    expect(input.name).toBe("Existing Name");
  });

  it("keeps the restricted-provider name projection unchanged", () => {
    const result = applyContactCapabilities(
      {
        name: " Agent Name ",
        first_name: "Structured",
        last_name: "Name",
        title: "CTO",
        company_id: 1,
        email_jsonb: [],
        phone_jsonb: [],
      } as any,
      AGENT_CRM_CAPABILITIES,
    );

    expect(result).toEqual({
      name: "Agent Name",
      title: "CTO",
      company_id: 1,
      email_jsonb: [],
      phone_jsonb: [],
    });
  });
});
