import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { handleError, isStorageCapacityError } from "../src/middleware/error-handler";
import type { AppEnv } from "../src/types/hono";

describe("storage capacity error handling", () => {
  it("recognizes SQLite and filesystem capacity errors, including causes", () => {
    expect(isStorageCapacityError(Object.assign(new Error("write failed"), {
      code: "SQLITE_FULL",
    }))).toBe(true);
    expect(isStorageCapacityError(new Error("No space left on device", {
      cause: { code: "ENOSPC" },
    }))).toBe(true);
    expect(isStorageCapacityError({ code: "SQLITE_BUSY" })).toBe(false);
  });

  it("returns a parseable STORAGE_ERROR envelope with HTTP 507", async () => {
    const app = new Hono<AppEnv>();
    app.onError((error, context) => handleError(error, context));
    app.get("/full", () => {
      throw Object.assign(new Error("database or disk is full"), {
        code: "SQLITE_FULL",
      });
    });

    const response = await app.request("/full");
    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({
      error: {
        code: "STORAGE_ERROR",
        message: "Local storage capacity is exhausted",
        request_id: "unknown",
      },
    });
  });
});
