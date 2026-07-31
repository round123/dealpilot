import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseData, parseSuccessEnvelope } from "../src/contracts.js";
import { ApiError, API_ERROR_CODES, errorCodeForStatus } from "../src/error.js";

const CustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

describe("response contracts", () => {
  it("returns parsed data instead of leaking an unknown wire value", () => {
    const customer = parseData(CustomerSchema, {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Acme",
    });

    expect(customer.name).toBe("Acme");
  });

  it("maps schema drift to INVALID_RESPONSE", () => {
    expect(() => parseData(CustomerSchema, { id: "not-a-uuid" })).toThrowError(
      expect.objectContaining<ApiError>({
        code: API_ERROR_CODES.invalidResponse,
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("unwraps the public success envelope", () => {
    expect(parseSuccessEnvelope(z.number(), { data: 42 })).toBe(42);
  });

  it("normalizes a public error envelope, including field errors", () => {
    try {
      parseSuccessEnvelope(z.number(), {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          fields: { name: "Required", email: ["Invalid"] },
          request_id: "req-123",
        },
      });
      throw new Error("Expected parseSuccessEnvelope to throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        status: 200,
        fields: { name: ["Required"], email: ["Invalid"] },
        requestId: "req-123",
      });
    }
  });

  it("generates a request ID when an error envelope omits it", () => {
    expect(() =>
      parseSuccessEnvelope(z.number(), {
        error: {
          code: "SERVER_ERROR",
          message: "Unexpected failure",
        },
      }),
    ).toThrowError(
      expect.objectContaining<ApiError>({
        code: "SERVER_ERROR",
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("keeps a generated request ID stable on an ApiError instance", () => {
    const error = new ApiError({ code: "TEST_ERROR", message: "Test failure" });

    expect(error.requestId).toMatch(/\S/);
    expect(error.requestId).toBe(error.requestId);
  });

  it("classifies HTTP 507 as a storage capacity error", () => {
    expect(errorCodeForStatus(507)).toBe(API_ERROR_CODES.storage);
  });
});
