import { API_ERROR_CODES, type ApiClient } from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

import { createCloudBusinessApi } from "./cloudBusinessApi";

const userId = "3fef2a38-1c5b-4bb8-a8fd-50dc735e8751";
const sourceContactId = "4fef2a38-1c5b-4bb8-a8fd-50dc735e8752";
const targetContactId = "5fef2a38-1c5b-4bb8-a8fd-50dc735e8753";

const createClient = (authenticated = true) => {
  const client = {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue(authenticated ? { user: { id: userId } } : null),
    },
    getOne: vi.fn().mockResolvedValue({
      owner_user_id: userId,
      config: { title: "DealPilot" },
    }),
    update: vi.fn().mockResolvedValue({
      owner_user_id: userId,
      config: { title: "Updated" },
    }),
    customers: {
      mergeContacts: vi.fn().mockResolvedValue({ id: "target" }),
    },
    storage: {
      upload: vi.fn().mockResolvedValue({ path: `${userId}/note.txt` }),
      createSignedUrl: vi.fn().mockResolvedValue({
        path: `${userId}/note.txt`,
        signedUrl: "https://example.test/signed/note.txt",
        expiresIn: 3600,
      }),
    },
  };
  return client;
};

describe("cloud business API", () => {
  it("uses owner_user_id for personal configuration", async () => {
    const client = createClient();
    const api = createCloudBusinessApi(client as unknown as ApiClient);

    await expect(api.getConfiguration()).resolves.toEqual({ title: "DealPilot" });
    await api.updateConfiguration({ title: "Updated" } as never);

    expect(client.getOne).toHaveBeenCalledWith(
      "configuration",
      userId,
      expect.anything(),
      { idField: "owner_user_id", select: "owner_user_id,config" },
    );
    expect(client.update).toHaveBeenCalledWith(
      "configuration",
      userId,
      { config: { title: "Updated" } },
      expect.anything(),
      { idField: "owner_user_id", select: "owner_user_id,config" },
    );
  });

  it("uses the API client for merge commands and private attachments", async () => {
    const client = createClient();
    const api = createCloudBusinessApi(client as unknown as ApiClient);

    await api.mergeContacts(sourceContactId, targetContactId);
    await expect(
      api.uploadAttachment("note.txt", new Blob(["note"]), "text/plain"),
    ).resolves.toBe("https://example.test/signed/note.txt");

    expect(client.customers.mergeContacts).toHaveBeenCalledWith(
      sourceContactId,
      targetContactId,
    );
    expect(client.storage.upload).toHaveBeenCalledWith(
      "attachments",
      "note.txt",
      expect.any(Blob),
      { contentType: "text/plain" },
    );
  });

  it("rejects attachment access without a current session", async () => {
    const client = createClient(false);
    const api = createCloudBusinessApi(client as unknown as ApiClient);

    await expect(
      api.uploadAttachment("note.txt", new Blob(["note"]), "text/plain"),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.unauthorized,
      status: 401,
    });
    await expect(api.getAttachmentUrl("note.txt")).rejects.toMatchObject({
      code: API_ERROR_CODES.unauthorized,
      status: 401,
    });

    expect(client.storage.upload).not.toHaveBeenCalled();
    expect(client.storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
