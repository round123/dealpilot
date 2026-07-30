import type { CustomerDetail } from "@dealpilot/api-client";

const mocks = vi.hoisted(() => ({
  getCustomerDetail: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    customers: {
      getCustomerDetail: mocks.getCustomerDetail,
    },
  }),
}));

import { loadCustomerDetail } from "./useCustomerDetail";

describe("loadCustomerDetail", () => {
  it("uses the shared customer API and forwards cancellation", async () => {
    const controller = new AbortController();
    const detail = { id: "8de45578-6661-4003-bccf-07ee67d9ee57" };
    mocks.getCustomerDetail.mockResolvedValue(detail);

    await expect(
      loadCustomerDetail(detail.id, controller.signal),
    ).resolves.toBe(detail);
    expect(mocks.getCustomerDetail).toHaveBeenCalledWith(
      detail.id as CustomerDetail["id"],
      { signal: controller.signal },
    );
  });
});
