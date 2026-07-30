import { describe, expect, it, vi } from "vitest";
import { createPrivateStorageApi } from "../src/storage.js";
import { ApiError, API_ERROR_CODES } from "../src/error.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";

function storageClient(
  overrides: {
    getUser?: ReturnType<typeof vi.fn>;
    upload?: ReturnType<typeof vi.fn>;
    remove?: ReturnType<typeof vi.fn>;
    createSignedUrl?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const bucket = {
    upload:
      overrides.upload ??
      vi.fn().mockResolvedValue({ data: null, error: null }),
    remove:
      overrides.remove ?? vi.fn().mockResolvedValue({ data: [], error: null }),
    createSignedUrl:
      overrides.createSignedUrl ??
      vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const from = vi.fn(() => bucket);
  const getUser =
    overrides.getUser ??
    vi.fn().mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  return {
    client: { auth: { getUser }, storage: { from } },
    bucket,
    from,
    getUser,
  };
}

describe("private Storage facade", () => {
  it("uploads only beneath the current authenticated user prefix", async () => {
    const path = `${userId}/customers/acme/avatar.png`;
    const upload = vi.fn().mockResolvedValue({
      data: { id: "object-id", path, fullPath: `attachments/${path}` },
      error: null,
    });
    const fixture = storageClient({ upload });
    const storage = createPrivateStorageApi(fixture.client as never);
    const body = new Uint8Array([1, 2, 3]);

    await expect(
      storage.upload("attachments", "customers/acme/avatar.png", body, {
        contentType: "image/png",
        upsert: false,
      }),
    ).resolves.toEqual({ path });

    expect(fixture.from).toHaveBeenCalledWith("attachments");
    expect(upload).toHaveBeenCalledWith(path, body, {
      cacheControl: undefined,
      contentType: "image/png",
      upsert: false,
    });
  });

  it.each([
    "../other-user/file.txt",
    "/absolute/file.txt",
    "folder\\file.txt",
    "folder/%2e%2e/file.txt",
    "folder/%2Fother/file.txt",
    "folder//file.txt",
  ])(
    "rejects unsafe relative path %s before auth or storage I/O",
    async (path) => {
      const fixture = storageClient();
      const storage = createPrivateStorageApi(fixture.client as never);

      await expect(
        storage.upload("attachments", path, "data"),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.validation,
      });
      expect(fixture.getUser).not.toHaveBeenCalled();
      expect(fixture.from).not.toHaveBeenCalled();
    },
  );

  it("prefixes every path in a remove operation", async () => {
    const fixture = storageClient();
    const storage = createPrivateStorageApi(fixture.client as never);

    await expect(
      storage.remove("attachments", ["one.txt", "nested/two.txt"]),
    ).resolves.toBeUndefined();
    expect(fixture.bucket.remove).toHaveBeenCalledWith([
      `${userId}/one.txt`,
      `${userId}/nested/two.txt`,
    ]);
  });

  it("creates a short-lived signed URL for the owned path", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          "https://example.supabase.co/storage/v1/object/sign/attachments/file?token=value",
      },
      error: null,
    });
    const fixture = storageClient({ createSignedUrl });
    const storage = createPrivateStorageApi(fixture.client as never);

    await expect(
      storage.createSignedUrl("attachments", "file.pdf", 300, {
        download: true,
      }),
    ).resolves.toEqual({
      path: `${userId}/file.pdf`,
      signedUrl:
        "https://example.supabase.co/storage/v1/object/sign/attachments/file?token=value",
      expiresIn: 300,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(`${userId}/file.pdf`, 300, {
      download: true,
      transform: undefined,
      cacheNonce: undefined,
    });
  });

  it("does not expose getPublicUrl", () => {
    const fixture = storageClient();
    const storage = createPrivateStorageApi(fixture.client as never);

    expect(storage).not.toHaveProperty("getPublicUrl");
  });

  it("requires a currently authenticated user", async () => {
    const fixture = storageClient({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    });
    const storage = createPrivateStorageApi(fixture.client as never);

    await expect(
      storage.remove("attachments", "file.txt"),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.unauthorized,
      status: 401,
    });
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it("normalizes Storage SDK failures to ApiError", async () => {
    const fixture = storageClient({
      upload: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "AccessDenied",
          message: "new row violates row-level security policy",
          statusCode: "403",
          name: "StorageApiError",
          request_id: "req-storage",
        },
      }),
    });
    const storage = createPrivateStorageApi(fixture.client as never);

    try {
      await storage.upload("attachments", "file.txt", "data");
      throw new Error("Expected upload to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "AccessDenied",
        status: 403,
        requestId: "req-storage",
      });
    }
  });

  it("normalizes an aborted request without calling Supabase", async () => {
    const fixture = storageClient();
    const storage = createPrivateStorageApi(fixture.client as never);
    const controller = new AbortController();
    controller.abort();

    await expect(
      storage.createSignedUrl("attachments", "file.txt", 60, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.aborted });
    expect(fixture.getUser).not.toHaveBeenCalled();
  });

  it("rejects an upload response outside the expected owner path", async () => {
    const fixture = storageClient({
      upload: vi.fn().mockResolvedValue({
        data: { path: "another-user/file.txt" },
        error: null,
      }),
    });
    const storage = createPrivateStorageApi(fixture.client as never);

    await expect(
      storage.upload("attachments", "file.txt", "data"),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.invalidResponse });
  });
});
