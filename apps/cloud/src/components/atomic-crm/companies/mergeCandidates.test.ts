import { CustomerSummarySchema, type Customer } from "@dealpilot/api-client";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({ list: mocks.list }),
}));

import { loadMergeCandidates } from "./mergeCandidates";

describe("loadMergeCandidates", () => {
  it("pushes active search, source exclusion, stable pagination, and signal", async () => {
    const sourceId = "8de45578-6661-4003-bccf-07ee67d9ee57" as Customer["id"];
    const controller = new AbortController();
    const result = { data: [], total: 0 };
    mocks.list.mockResolvedValue(result);

    await expect(
      loadMergeCandidates(sourceId, "  North  ", 2, 10, controller.signal),
    ).resolves.toBe(result);
    expect(mocks.list).toHaveBeenCalledWith(
      "companies_summary",
      CustomerSummarySchema,
      {
        filters: {
          deleted_at: { operator: "is", value: null },
          id: { operator: "neq", value: sourceId },
          search_text: { operator: "ilike", value: "%North%" },
        },
        sort: [
          { field: "name", order: "asc" },
          { field: "id", order: "asc" },
        ],
        pagination: { page: 2, perPage: 10 },
        signal: controller.signal,
      },
    );
  });
});
