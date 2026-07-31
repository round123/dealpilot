import { describe, expect, it, vi } from "vitest";

import { createAccountApi } from "../src/account.js";

describe("account API", () => {
  it("invokes the authenticated account deletion function and parses its response", async () => {
    const signal = new AbortController().signal;
    const invoke = vi.fn(async (_name, schema, options) =>
      schema.parse({ deleted: true }),
    );
    const account = createAccountApi({ invoke });

    await expect(account.deleteCurrent({ signal })).resolves.toEqual({
      deleted: true,
    });
    expect(invoke).toHaveBeenCalledWith("delete-account", expect.anything(), {
      body: {},
      signal,
    });
  });

  it("rejects an invalid successful response at the client boundary", async () => {
    const account = createAccountApi({
      invoke: async (_name, schema) => schema.parse({ deleted: false }),
    });

    await expect(account.deleteCurrent()).rejects.toThrow();
  });
});
